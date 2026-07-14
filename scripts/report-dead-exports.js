const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');

if (!configPath) {
  console.error('Dead-export report failed: tsconfig.json was not found.');
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
const fileVersions = new Map(parsedConfig.fileNames.map(fileName => [fileName, '0']));
const host = {
  getScriptFileNames: () => parsedConfig.fileNames,
  getScriptVersion: fileName => fileVersions.get(fileName) || '0',
  getScriptSnapshot: fileName => {
    if (!fs.existsSync(fileName)) return undefined;
    return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
  },
  getCurrentDirectory: () => rootDir,
  getCompilationSettings: () => parsedConfig.options,
  getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

const isTestFile = fileName =>
  fileName.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.[cm]?[jt]sx?$/.test(fileName);

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function getExportedIdentifiers(sourceFile) {
  const identifiers = [];
  const visit = node => {
    if (hasExportModifier(node)) {
      if (node.name && ts.isIdentifier(node.name)) {
        identifiers.push(node.name);
      } else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) identifiers.push(declaration.name);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return identifiers;
}

const findings = [];
for (const fileName of parsedConfig.fileNames) {
  if (isTestFile(fileName) || !fileName.includes(`${path.sep}src${path.sep}`)) continue;
  const sourceFile = languageService.getProgram()?.getSourceFile(fileName);
  if (!sourceFile) continue;

  for (const identifier of getExportedIdentifiers(sourceFile)) {
    const references = languageService.findReferences(fileName, identifier.getStart(sourceFile)) || [];
    const productionReferences = references.flatMap(group => group.references).filter(reference => {
      if (reference.isDefinition || isTestFile(reference.fileName)) return false;
      return true;
    });

    if (productionReferences.length === 0) {
      const position = sourceFile.getLineAndCharacterOfPosition(identifier.getStart(sourceFile));
      findings.push({
        fileName: path.relative(rootDir, fileName),
        line: position.line + 1,
        name: identifier.text,
      });
    }
  }
}

if (findings.length === 0) {
  console.log('Dead-export report passed: every source export has a production reference.');
  process.exit(0);
}

console.log('Exports with no production reference:');
for (const finding of findings) {
  console.log(`- ${finding.fileName}:${finding.line} ${finding.name}`);
}
console.log(`${findings.length} export(s) require review.`);

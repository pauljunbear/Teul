const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const isTest = file => /(?:^|[\\/])__tests__[\\/]|\.test\.[cm]?[jt]sx?$/.test(file);
const isOwned = (root, file) =>
  [path.join(root, 'src') + path.sep, path.join(root, 'web', 'src') + path.sep].some(prefix =>
    file.startsWith(prefix)
  ) &&
  !file.endsWith('.d.ts') &&
  !isTest(file);

function readConfig(root, relative) {
  const file = path.join(root, relative);
  const config = ts.readConfigFile(file, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  return ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(file));
}

function defaultSurfaces(root) {
  const webpackConfig = require(path.join(root, 'webpack.config.js'));
  const plugin = readConfig(root, 'tsconfig.json').options;
  const studio = readConfig(root, 'web/tsconfig.app.json').options;
  return [
    ...[false, true].map(candidate => {
      const config = webpackConfig({ genericColorBuilder: candidate }, { mode: 'production' });
      return {
        name: candidate ? 'plugin-candidate' : 'plugin-production',
        entries: Object.values(config.entry).map(file => path.resolve(root, file)),
        options: plugin,
        aliases: config.resolve.alias,
      };
    }),
    {
      name: 'studio',
      entries: [path.join(root, 'web/src/main.tsx')],
      options: studio,
      aliases: {},
    },
  ];
}

function exportedIdentifiers(source) {
  const names = [];
  for (const node of source.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      names.push(...node.exportClause.elements.map(item => item.name));
    } else if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (node.name && ts.isIdentifier(node.name)) names.push(node.name);
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations)
          if (ts.isIdentifier(declaration.name)) names.push(declaration.name);
      }
    }
  }
  return names;
}

/** Advisory reference analysis across actual entrypoints; not proof that a symbol is safe to delete. */
function reportDeadExports({
  root = ROOT,
  surfaces = defaultSurfaces(root),
  toolingFiles = [],
} = {}) {
  const findings = new Map();
  const reachable = new Set();
  const counts = [];
  for (const surface of surfaces) {
    for (const file of surface.entries)
      if (!fs.existsSync(file)) throw new Error(`Missing ${surface.name} entrypoint: ${file}`);
    const host = {
      getScriptFileNames: () => surface.entries,
      getScriptVersion: () => '0',
      getScriptSnapshot: file => {
        const text = ts.sys.readFile(file);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => surface.options,
      getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      resolveModuleNames: (names, containingFile) =>
        names.map(name => {
          const aliased = surface.aliases?.[`${name}$`] ?? surface.aliases?.[name];
          const specifier = typeof aliased === 'string' ? aliased : name;
          const resolved = ts.resolveModuleName(
            specifier,
            containingFile,
            surface.options,
            ts.sys
          ).resolvedModule;
          // Webpack aliases may name a .ts file even though the original import is
          // extensionless. This flag describes source syntax, not the alias target;
          // passing the target's flag makes TypeScript try to extract a nonexistent
          // extension from the original import and triggers an internal assertion.
          return resolved && specifier !== name
            ? { ...resolved, resolvedUsingTsExtension: /\.[cm]?tsx?$/.test(name) }
            : resolved;
        }),
    };
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    try {
      const files = service
        .getProgram()
        .getSourceFiles()
        .filter(file => isOwned(root, file.fileName));
      counts.push({ name: surface.name, files: files.length });
      for (const source of files) {
        reachable.add(source.fileName);
        for (const identifier of exportedIdentifiers(source)) {
          const position = identifier.getStart(source);
          const key = `${source.fileName}:${position}`;
          const finding = findings.get(key) ?? {
            file: path.relative(root, source.fileName),
            line: source.getLineAndCharacterOfPosition(position).line + 1,
            name: identifier.text,
            referenced: false,
            surfaces: [],
          };
          finding.surfaces.push(surface.name);
          if (!finding.referenced) {
            const groups = service.findReferences(source.fileName, position) ?? [];
            // For `const spare = 1; export { spare }`, TypeScript sometimes marks
            // the declaration as a non-definition reference. Exclude the group's
            // declared symbol explicitly so exporting alone is not a consumer.
            const definitions = new Set(
              groups.map(group => `${group.definition.fileName}:${group.definition.textSpan.start}`)
            );
            finding.referenced = groups
              .flatMap(group => group.references)
              .some(
                reference =>
                  !reference.isDefinition &&
                  !isTest(reference.fileName) &&
                  !definitions.has(`${reference.fileName}:${reference.textSpan.start}`) &&
                  !(reference.fileName === source.fileName && reference.textSpan.start === position)
              );
          }
          findings.set(key, finding);
        }
      }
    } finally {
      service.dispose();
    }
  }
  const tooling = new Set(toolingFiles.map(file => path.resolve(root, file)));
  const sourceFiles = ['src', 'web/src'].flatMap(directory =>
    ts.sys.readDirectory(
      path.join(root, directory),
      ['.ts', '.tsx'],
      ['**/__tests__/**', '**/*.test.*']
    )
  );
  return {
    surfaces: counts,
    exports: [...findings.values()].filter(item => !item.referenced),
    unreachedFiles: sourceFiles
      .filter(file => isOwned(root, file) && !reachable.has(file) && !tooling.has(file))
      .map(file => path.relative(root, file)),
  };
}

function run() {
  // The shadcn generator uses this alias even when runtime components import cn directly.
  const components = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/components.json'), 'utf8'));
  const utility = components.aliases.utils.replace(/^@\//, 'web/src/') + '.ts';
  const report = reportDeadExports({ toolingFiles: [utility] });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Dead-code review across production, candidate and Studio entrypoints:');
  for (const surface of report.surfaces)
    console.log(`- ${surface.name}: ${surface.files} source files`);
  for (const item of report.exports) console.log(`- ${item.file}:${item.line} ${item.name}`);
  for (const file of report.unreachedFiles)
    console.log(`- ${file}: outside the declared TypeScript entry graphs`);
  console.log(
    `${report.exports.length} export(s), ${report.unreachedFiles.length} file(s) require consumer review. Build aliases and named re-exports are included; this is not deletion authority.`
  );
}

module.exports = { reportDeadExports, defaultSurfaces };
if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`Dead-code report failed: ${error.message}`);
    process.exitCode = 1;
  }
}

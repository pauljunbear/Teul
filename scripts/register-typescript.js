'use strict';

const fs = require('fs');
const ts = require('typescript');

function register(extension, jsx) {
  require.extensions[extension] = (loadedModule, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        jsx,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      reportDiagnostics: false,
    });
    loadedModule._compile(result.outputText, filename);
  };
}

register('.ts', ts.JsxEmit.React);
register('.tsx', ts.JsxEmit.React);

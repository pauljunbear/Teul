const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rootDir = path.resolve(__dirname, '..');
const uiPath = path.join(rootDir, process.env.TEUL_DIST_DIR || 'dist', 'ui.html');

if (!fs.existsSync(uiPath)) {
  console.error('Production UI smoke failed: dist/ui.html does not exist. Run npm run build first.');
  process.exit(1);
}

const backendMessages = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  console.error(`Production UI smoke failed: ${error.message}`);
  process.exitCode = 1;
});

const dom = new JSDOM(fs.readFileSync(uiPath, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://figma.local/plugin',
  virtualConsole,
  beforeParse(window) {
    Object.defineProperty(window, 'parent', {
      value: {
        postMessage(payload) {
          backendMessages.push(payload);
        },
      },
    });
  },
});

setTimeout(() => {
  const bodyText = dom.window.document.body.textContent || '';
  const requiredLabels = ['Wada', 'Werner', 'Grids'];
  const missingLabels = requiredLabels.filter(label => !bodyText.includes(label));
  const buttonCount = dom.window.document.querySelectorAll('button').length;
  const requestedProfile = backendMessages.some(
    payload => payload?.pluginMessage?.type === 'get-document-color-profile'
  );

  if (missingLabels.length > 0) {
    console.error(`Production UI smoke failed: missing ${missingLabels.join(', ')}.`);
    process.exitCode = 1;
  }
  if (buttonCount === 0) {
    console.error('Production UI smoke failed: no buttons rendered.');
    process.exitCode = 1;
  }
  if (!requestedProfile) {
    console.error('Production UI smoke failed: startup backend request was not sent.');
    process.exitCode = 1;
  }

  if (!process.exitCode) {
    console.log(
      `Production UI smoke passed: ${buttonCount} buttons, ${backendMessages.length} backend message(s).`
    );
  }

  dom.window.close();
}, 50);

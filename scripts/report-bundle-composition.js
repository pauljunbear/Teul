'use strict';

/**
 * Report production bundle composition without touching dist/.
 *
 * The production Webpack config cleans its output directory on every run, so a
 * report build aimed at dist/ would replace verified artifacts. This script
 * builds into a fresh temporary directory, prints the report, and removes the
 * directory afterwards.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const createConfig = require('../webpack.config');

const REPO_DIST = path.resolve(__dirname, '..', 'dist');
const CANDIDATE_DIST = path.resolve(__dirname, '..', 'figma-candidate', 'dist');

function createReportConfig(env = {}, temporaryRoot = os.tmpdir()) {
  const outputPath = fs.mkdtempSync(path.join(temporaryRoot, 'teul-bundle-report-'));
  const config = createConfig(env, { mode: 'production' });
  if (outputPath === REPO_DIST || outputPath === CANDIDATE_DIST) {
    throw new Error('Bundle report must not build into a tracked artifact directory.');
  }
  return {
    ...config,
    output: { ...config.output, path: outputPath, clean: true },
  };
}

function summarize(stats) {
  const data = stats.toJson({ all: false, assets: true, modules: true });
  const assets = (data.assets || [])
    .map(asset => ({ name: asset.name || 'unknown', size: asset.size || 0 }))
    .sort((first, second) => second.size - first.size);
  const modules = (data.modules || [])
    .filter(module => module.name && Number.isFinite(module.size))
    .map(module => ({ name: module.name, size: module.size }))
    .sort((first, second) => second.size - first.size)
    .slice(0, 20);
  return { assets, modules };
}

function runReport() {
  const webpack = require('webpack');
  const config = createReportConfig();
  const compiler = webpack(config);

  compiler.run((error, stats) => {
    compiler.close(() => fs.rmSync(config.output.path, { recursive: true, force: true }));
    if (error) {
      console.error(error.message || error);
      process.exitCode = 1;
      return;
    }
    if (!stats || stats.hasErrors()) {
      console.error(stats?.toString({ all: false, errors: true }) || 'Webpack returned no stats.');
      process.exitCode = 1;
      return;
    }

    const { assets, modules } = summarize(stats);
    console.log(`Production assets (built in ${config.output.path}, dist/ untouched):`);
    for (const asset of assets)
      console.log(`- ${asset.name}: ${asset.size.toLocaleString()} bytes`);
    console.log('\nLargest source modules before minification:');
    for (const module of modules)
      console.log(`- ${module.name}: ${module.size.toLocaleString()} bytes`);
  });
}

module.exports = { CANDIDATE_DIST, REPO_DIST, createReportConfig, summarize };

if (require.main === module) {
  runReport();
}

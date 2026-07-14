const webpack = require('webpack');
const createConfig = require('../webpack.config');

const config = createConfig({}, { mode: 'production' });
const compiler = webpack(config);

compiler.run((error, stats) => {
  compiler.close(() => undefined);
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

  const data = stats.toJson({ all: false, assets: true, modules: true });
  const assets = (data.assets || [])
    .map(asset => ({ name: asset.name || 'unknown', size: asset.size || 0 }))
    .sort((first, second) => second.size - first.size);
  const modules = (data.modules || [])
    .filter(module => module.name && Number.isFinite(module.size))
    .map(module => ({ name: module.name, size: module.size }))
    .sort((first, second) => second.size - first.size)
    .slice(0, 20);

  console.log('Production assets:');
  for (const asset of assets) console.log(`- ${asset.name}: ${asset.size.toLocaleString()} bytes`);
  console.log('\nLargest source modules before minification:');
  for (const module of modules) console.log(`- ${module.name}: ${module.size.toLocaleString()} bytes`);
});

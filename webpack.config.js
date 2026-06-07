const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

class InlineUiChunkHtmlPlugin {
  apply(compiler) {
    const pluginName = 'InlineUiChunkHtmlPlugin';

    compiler.hooks.compilation.tap(pluginName, compilation => {
      const inlineUiScript = tag => {
        if (tag.tagName !== 'script' || !tag.attributes?.src) {
          return tag;
        }

        const scriptName = String(tag.attributes.src).split(/[?#]/, 1)[0].split('/').pop();

        if (scriptName !== 'ui.js') {
          return tag;
        }

        const asset = compilation.getAsset(scriptName);
        if (!asset) {
          throw new Error(`${pluginName} could not find ${scriptName} in the compilation.`);
        }

        return {
          tagName: 'script',
          innerHTML: asset.source.source(),
          closeTag: true,
        };
      };

      const hooks = HtmlWebpackPlugin.getHooks(compilation);
      hooks.alterAssetTagGroups.tap(pluginName, assets => {
        assets.headTags = assets.headTags.map(inlineUiScript);
        assets.bodyTags = assets.bodyTags.map(inlineUiScript);
      });
    });
  }
}

class RemoveInlinedUiAssetPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('RemoveInlinedUiAssetPlugin', compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: 'RemoveInlinedUiAssetPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        () => {
          compilation.deleteAsset('ui.js');
        }
      );
    });
  }
}

class EmitLegalArtifactsPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitLegalArtifactsPlugin', compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EmitLegalArtifactsPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const artifacts = [
            { source: 'LICENSE', output: 'LICENSE' },
            { source: 'THIRD_PARTY_NOTICES.md', output: 'THIRD_PARTY_NOTICES.md' },
            { source: 'docs/SOURCE_PROVENANCE.md', output: 'SOURCE_PROVENANCE.md' },
          ];

          for (const artifact of artifacts) {
            const contents = fs.readFileSync(path.resolve(__dirname, artifact.source), 'utf8');
            compilation.emitAsset(
              artifact.output,
              new compiler.webpack.sources.RawSource(contents)
            );
          }
        }
      );
    });
  }
}

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',

  devtool: argv.mode === 'production' ? false : 'inline-source-map',

  entry: {
    code: './src/code.ts',
    ui: './src/ui.tsx',
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.json$/,
        type: 'json',
        parser: {
          parse: JSON.parse,
        },
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },

  // Figma requires the complete UI runtime inside one HTML file. Keep a
  // realistic explicit budget for that artifact instead of Webpack's generic
  // 244 KiB web-page recommendation.
  performance: {
    hints: 'warning',
    maxAssetSize: 440 * 1024,
    maxEntrypointSize: 440 * 1024,
  },

  optimization: {
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          compress: {
            passes: 3,
          },
          format: {
            comments: false,
          },
        },
      }),
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui.html',
      filename: 'ui.html',
      chunks: ['ui'],
      cache: false,
      inject: 'body',
    }),
    new InlineUiChunkHtmlPlugin(),
    new RemoveInlinedUiAssetPlugin(),
    new EmitLegalArtifactsPlugin(),
  ],
});

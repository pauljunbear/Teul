import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

// Self-host only PDF.js's licensed fallback fonts; a private PDF never triggers a font CDN request.
const fontDirectory = new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url);
const pdfFonts = {
  name: 'teul-pdf-fonts',
  async generateBundle(this: {
    emitFile: (asset: { type: 'asset'; fileName: string; source: Uint8Array }) => void;
  }) {
    for (const name of await readdir(fontDirectory)) {
      if (/\.(pfb|ttf)$/.test(name))
        this.emitFile({
          type: 'asset',
          fileName: `pdf-fonts/${name}`,
          source: await readFile(new URL(name, fontDirectory)),
        });
    }
  },
  configureServer(server: {
    middlewares: {
      use: (
        handler: (
          req: { url?: string },
          res: { end: (body: Uint8Array) => void },
          next: () => void
        ) => void
      ) => void;
    };
  }) {
    server.middlewares.use((req, res, next) => {
      const name = req.url?.match(/^\/pdf-fonts\/([\w-]+\.(?:pfb|ttf))$/)?.[1];
      if (!name) return next();
      void readFile(new URL(name, fontDirectory)).then(bytes => res.end(bytes), next);
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfFonts],
  worker: { format: 'es' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});

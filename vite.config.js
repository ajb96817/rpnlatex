
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mkcert from 'vite-plugin-mkcert';  // enable HTTPS in development mode
import react from '@vitejs/plugin-react';

const PYODIDE_EXCLUDE = [
  "!**/*.{md,html}",
  "!**/*.d.ts",
  "!**/*.whl",
  "!**/node_modules",
];

export function viteStaticCopyPyodide() {
  const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));
  return viteStaticCopy({
    targets: [
      {
        src: [join(pyodideDir, "*")].concat(PYODIDE_EXCLUDE),
        dest: "public",
      },
    ],
  });
}

export default defineConfig({
  optimizeDeps: { exclude: ['pyodide'] },
  plugins: [react(), mkcert(), viteStaticCopyPyodide()],
  base: './',
  build: { outDir: 'build' },
  server: {
    port: 3000,
    headers: {
      // Enable cross-origin isolation so that SharedArrayBuffer
      // can be used to communicate with the Pyodide worker.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  }
})

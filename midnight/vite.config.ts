import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  root: '.',
  plugins: [wasm()],
  define: { global: 'globalThis' },
  resolve: { alias: { assert: 'assert/', process: 'process/browser' } },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  assetsInclude: ['**/*.wasm'],
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  build: {
    target: 'esnext',
    outDir: 'dist-preview',
    rollupOptions: { input: resolve('preview/index.html') },
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        simple: resolve(__dirname, 'examples/simple.html'),
        viewer: resolve(__dirname, 'examples/viewer.html'),
      },
    },
  },
});

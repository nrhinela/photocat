import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: 'frontend/index.html',
    },
  },
});

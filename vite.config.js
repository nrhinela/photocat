const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: 'frontend',
  build: {
    outDir: '../src/photocat/static/dist',
    rollupOptions: {
      input: 'frontend/index.html',
    },
  },
});
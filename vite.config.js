const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: 'frontend',
  build: {
    outDir: '../src/photocat/static/dist',
    rollupOptions: {
      input: 'frontend/index.html',
    },
  },
  server: {
    proxy: {
      // Proxy API requests to the backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Proxy admin pages to the backend
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/tagging-admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Proxy OAuth and webhooks
      '/oauth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
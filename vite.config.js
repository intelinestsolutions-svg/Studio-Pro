import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site can be dropped onto any subdomain sub-path.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5180,
  },
  preview: {
    host: '127.0.0.1',
    port: 5182,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
});

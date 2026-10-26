import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from https://<user>.github.io/spy_chess/ on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/spy_chess/',
  plugins: [react()],
  server: { port: 5173 },
});

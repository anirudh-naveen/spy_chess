import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from https://<user>.github.io/veiled_chess/ on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/veiled_chess/',
  plugins: [react()],
  server: { port: 5173 },
});

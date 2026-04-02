import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  build: {
    outDir: 'dist'
  },
  plugins: [react(), tailwindcss(), crx({ manifest })]
});

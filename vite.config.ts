import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
          dest: '.',
        },
        {
          src: 'public/background.js', // <-- Ensures our side panel trigger is copied
          dest: '.',
        }
      ],
    }),
  ],
  build: {
    outDir: 'build',
    rollupOptions: {
      // 1. MULTIPLE ENTRY POINTS
      // We are telling Vite to build two completely separate programs.
      input: {
        content: './src/content.tsx', 
      },
      
      // 2. OUTPUT NAMING RULES
      output: {
        // 2. Force the JS to be named content.js
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        // 3. Force the CSS to be named content.css so we can find it in Phase 3
        assetFileNames: (assetInfo) => {
            if (assetInfo.name && /\.css$/.test(assetInfo.name)) {
            return 'content.css'; 
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    },
  },
});
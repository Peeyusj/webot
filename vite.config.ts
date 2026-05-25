import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
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
        main: './index.html',        // Program 1: The React UI
        content: './src/content.ts', // Program 2: The invisible scraper script
      },
      
      // 2. OUTPUT NAMING RULES
      output: {
        entryFileNames: (chunkInfo) => {
          // Check if Vite is currently building the 'content' program defined above
          if (chunkInfo.name === 'content') {
            // Force the output name to be exactly 'content.js' without random hashes.
            // This guarantees Chrome can always find our scraper.
            return 'content.js'; 
          }
          // For your React components, let Vite add hashes as usual
          return 'assets/[name]-[hash].js';
        }
      }
    },
  },
});
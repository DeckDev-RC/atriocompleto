import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
      open: false,
    }),
  ],
  esbuild: isProduction
    ? {
        drop: ['console', 'debugger'],
      }
    : undefined,
  build: {
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/');

          if (!moduleId.includes('/node_modules/')) {
            return;
          }

          if (
            moduleId.includes('/react-router-dom/') ||
            moduleId.includes('/react-dom/') ||
            moduleId.includes('/react/')
          ) {
            return 'vendor-react';
          }

          if (
            moduleId.includes('/lucide-react/') ||
            moduleId.includes('/react-day-picker/') ||
            moduleId.includes('/date-fns/')
          ) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
});

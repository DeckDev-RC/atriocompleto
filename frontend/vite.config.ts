import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/')

          if (!moduleId.includes('/node_modules/')) {
            return
          }

          if (
            moduleId.includes('/react-router-dom/') ||
            moduleId.includes('/react-dom/') ||
            moduleId.includes('/react/')
          ) {
            return 'vendor-react'
          }

          if (moduleId.includes('/chart.js/')) {
            return 'vendor-chartjs'
          }

          if (moduleId.includes('/recharts/')) {
            return 'vendor-recharts'
          }

          if (
            moduleId.includes('/d3-') ||
            moduleId.includes('/internmap/') ||
            moduleId.includes('/robust-predicates/')
          ) {
            return 'vendor-d3'
          }

          if (
            moduleId.includes('/react-markdown/') ||
            moduleId.includes('/remark-gfm/') ||
            moduleId.includes('/mdast-util-') ||
            moduleId.includes('/micromark') ||
            moduleId.includes('/unified/') ||
            moduleId.includes('/remark-') ||
            moduleId.includes('/hast-util-') ||
            moduleId.includes('/property-information/') ||
            moduleId.includes('/space-separated-tokens/') ||
            moduleId.includes('/comma-separated-tokens/')
          ) {
            return 'vendor-markdown'
          }

          if (
            moduleId.includes('/lucide-react/') ||
            moduleId.includes('/react-day-picker/') ||
            moduleId.includes('/date-fns/')
          ) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
})

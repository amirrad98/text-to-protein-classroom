import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { writeFileSync } from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'add-nojekyll',
      writeBundle() {
        writeFileSync('dist/.nojekyll', '')
      }
    }
  ],
  base: '/text-to-protein-classroom/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

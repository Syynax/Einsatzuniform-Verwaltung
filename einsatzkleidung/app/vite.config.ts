import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' ist Pflicht für den Home-Assistant-Ingress: die App wird dort unter
// /api/hassio_ingress/<token>/ ausgeliefert, absolute Asset-Pfade würden 404en.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:8098',
        changeOrigin: true,
      },
    },
  },
})

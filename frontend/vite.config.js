import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:4000',
        changeOrigin: true,
        secure: false, // backend uses a self-signed cert
      },
      '/uploads': {
        target: 'https://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'https://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

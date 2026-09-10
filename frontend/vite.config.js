import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8010',
      // Las miniaturas de Instagram se guardan en el backend: en producción las sirve
      // nginx, en desarrollo hace falta pasarlas por el proxy.
      '/uploads': 'http://127.0.0.1:8010',
    },
  },
})

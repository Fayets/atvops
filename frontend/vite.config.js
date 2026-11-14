import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** El commit con el que se construyó, o la hora si no hay git a mano (dentro de Docker). */
function version() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return String(Date.now())
  }
}

/**
 * Deja un version.json al lado del index para que una pestaña abierta se entere de que
 * hubo deploy. Los assets van con hash y caché eterno; este archivo es el único que
 * cambia de contenido con el mismo nombre, así que nginx lo sirve sin caché.
 */
function versionJson() {
  return {
    name: 'atv-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: version() }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJson()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8010',
      // Las miniaturas de Instagram se guardan en el backend: en producción las sirve
      // nginx, en desarrollo hace falta pasarlas por el proxy.
      '/uploads': 'http://127.0.0.1:8010',
    },
  },
})

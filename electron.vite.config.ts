import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    resolve: {
      alias: { '@shared': shared, '@main': resolve('src/main') }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': shared }
    },
    build: {
      // Sandboxed preload must be a single self-contained bundle.
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), tailwindcss()],
    server: {
      // The component preview iframe is sandboxed (opaque origin) and needs CORS in dev.
      cors: true
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          preview: resolve('src/renderer/preview.html')
        }
      }
    }
  }
})

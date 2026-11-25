import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const shared = resolve('src/shared')

/** The CSP allows the dev server's HMR origins only while developing: the packaged window talks to itself alone. */
const stripDevCsp: Plugin = {
  name: 'vault-strip-dev-csp',
  apply: 'build',
  transformIndexHtml: (html, ctx) =>
    ctx.filename.endsWith('index.html') ? html.replace(' ws://localhost:* http://localhost:*', '') : html
}

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
    plugins: [react(), tailwindcss(), stripDevCsp],
    server: {
      // The component preview iframe is sandboxed (opaque origin) and needs CORS in dev.
      cors: true
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          preview: resolve('src/renderer/preview.html')
        },
        output: {
          // React must live in exactly one chunk: when Rolldown spread react / react-dom across shared
          // chunks, hooks hit a null dispatcher at startup (blank window, "reading 'useContext'").
          codeSplitting: {
            groups: [{ name: 'react', test: /[\/]node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 20 }]
          }
        }
      }
    }
  }
})

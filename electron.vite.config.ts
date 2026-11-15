import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read at build time: under the e2e drivers the app runs as `Electron out/main`,
// where app.getVersion() can report Electron's own version.
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    // Bundled rather than left external: the packaged app ships out/ only, no
    // node_modules (see electron-builder.yml `files`).
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(version)
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      // The renderer is served from file:// in packaged builds, where CSP
      // `font-src 'self'` does not reliably match. Inlining the one bundled
      // woff2 (Inter latin, ~48 KB) as a data: URI sidesteps that entirely.
      assetsInlineLimit: 96 * 1024
    },
    plugins: [react(), tailwindcss()]
  }
})

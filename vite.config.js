import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/waypoints/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // Two pages, one engine: the cinematic home and the atlas app.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        atlas: resolve(import.meta.dirname, 'atlas/index.html'),
      },
      output: {
        // three is ~600KB and changes only on dependency bumps — keep it
        // cached across app deploys.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})

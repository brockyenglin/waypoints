import { defineConfig } from 'vite'

export default defineConfig({
  base: '/waypoints/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
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

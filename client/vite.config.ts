import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// Custom plugin to handle .babylon files as JSON
const babylonPlugin = () => {
  return {
    name: 'babylon-json',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && req.url.includes('.babylon')) {
          res.setHeader('Content-Type', 'application/json')
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    babylonPlugin()
  ],
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()]
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  define: {
    // Enable WebGPU
    'process.env.WEBGPU_ENABLED': true  },  server: {
    port: 3001,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core', '@babylonjs/gui', '@babylonjs/materials'],
          physics: ['@dimforge/rapier3d-compat']
        }
      }
    }
  }
})

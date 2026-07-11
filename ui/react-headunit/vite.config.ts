import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Needed for Docker mapping
    port: 5173,
    allowedHosts: true, // accept forwarded/tunnel hostnames (VSCode port-forward, Cloudflare, LAN IP)
    proxy: {
      // Serve the Go API under the same origin so one shared URL works everywhere
      '/schools': { target: 'http://routing-service:8080', changeOrigin: true },
      '/partners': { target: 'http://routing-service:8080', changeOrigin: true },
    },
    watch: {
      usePolling: true // Needed for Docker specifically in some environments
    }
  }
})

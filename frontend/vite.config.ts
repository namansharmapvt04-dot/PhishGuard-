import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// The backend runs on :8000 in dev, or the `backend` service in docker-compose.
// Override with VITE_PROXY_TARGET (e.g. http://backend:8000) when containerised.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      host: true,
      port: 5173,
      // Vite rejects requests with an unrecognised Host header by default —
      // needed so the dev server is reachable through a tunnel (dev
      // convenience only, this file doesn't run in production). Vite 5
      // doesn't support `true` here (added in a later version) — list
      // specific suffixes instead; covers both tunnel providers in use.
      allowedHosts: ['immune-file-hear-expensive.trycloudflare.com', '.trycloudflare.com', '.ngrok-free.dev', '.ngrok-free.app'],
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/track': { target: proxyTarget, changeOrigin: true },
      },
    },
  }
})

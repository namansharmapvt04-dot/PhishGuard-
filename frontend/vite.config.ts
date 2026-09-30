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
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/track': { target: proxyTarget, changeOrigin: true },
      },
    },
  }
})

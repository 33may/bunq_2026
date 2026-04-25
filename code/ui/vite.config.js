import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy backend routes to FastAPI (uvicorn on :8000) during `npm run dev`
// so the browser can hit the API same-origin — cookies + CORS "just work".
const backend = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/transcribe': backend,
      '/scans': backend,
      '/housemates': backend,
      '/requests': backend,
      '/splits': backend,
      '/health': backend,
      '/posts': backend,
      '/ai': backend,
      // auth / session
      '/users': backend,
      '/me': backend,      // also matches /me/bunq
      '/house': backend,
      '/auth': backend,
      '/session': backend,
    },
  },
})

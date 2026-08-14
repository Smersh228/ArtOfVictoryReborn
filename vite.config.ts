import type { ServerResponse } from 'http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const API_TARGET = 'http://localhost:5000'

function proxyApiErrorBody(res: ServerResponse | undefined, err: Error & { code?: string }) {
  if (!res || res.headersSent || typeof res.writeHead !== 'function') return
  const code = err.code === 'ECONNREFUSED' ? 'ECONNREFUSED' : err.code || 'ERR'
  res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(
    code === 'ECONNREFUSED'
      ? `API не запущен. Ожидается ${API_TARGET} — в отдельном терминале: cd server && npm start`
      : `Ошибка прокси к API (${code}): ${err.message}`,
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()], 
  root: path.resolve(__dirname,'client'),
  /** Иначе Vite ищет `.env*` только в `client/`; общие `aov/.env.production` не подхватывались бы. */
  envDir: path.resolve(__dirname),
  build: {
    /** Продакшен: каталог aov/dist (выкладка nginx; домен задаётся в `.env.production`). */
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            proxyApiErrorBody(res as ServerResponse | undefined, err as Error & { code?: string })
          })
        },
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            proxyApiErrorBody(res as ServerResponse | undefined, err as Error & { code?: string })
          })
        },
      },
    },
  },
  resolve: {
  alias: {
    '@': path.resolve(__dirname,'client/src')
  }

  }
})

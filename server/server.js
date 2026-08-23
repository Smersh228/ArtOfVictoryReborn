const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const authRoutes = require('./routes/auth/router')
const editorRoutes = require('./routes/editor')
const editorUploadRoutes = require('./routes/editorUpload/router')
const roomsRoutes = require('./routes/rooms')
const mapsRoutes = require('./routes/maps/router')
const adminMaintenanceRoutes = require('./routes/admin/maintenanceRoutes')
const lobbyHubRoutes = require('./routes/lobbyHub')
const { maintenanceApiGate } = require('./maintenanceMiddleware')
const { ensureMaintenanceSchema } = require('./maintenance')
const { ensureChatMuteSchema } = require('./lobbyHub')
const { ensurePlayerStatsSchema } = require('./playerStats')
const { ensureUnitCatalogColumns } = require('./routes/editor/shared')

const app = express()
const PORT = process.env.PORT || 5000


function parseAllowedOrigins() {
  const raw = process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS || 'http://localhost:5173'
  return String(raw)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter((s) => s.length > 0)
}

const ALLOWED_ORIGINS = parseAllowedOrigins()
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      if (LOCALHOST_ORIGIN_RE.test(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Client-Id', 'X-Battle-Tab-Visible', 'Authorization'],
  }),
)
app.use(cookieParser())

app.use(express.json({ limit: '20mb' }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api', maintenanceApiGate)

app.use('/api/auth', authRoutes)
app.use('/api/admin/maintenance', adminMaintenanceRoutes)
app.use('/api/editor', editorRoutes)
app.use('/api/editor', editorUploadRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/maps', mapsRoutes)
app.use('/api/lobby', lobbyHubRoutes)

/** Продакшен: раздача SPA из aov/dist (если каталог есть). Nginx может отдавать dist сам — тогда SERVE_CLIENT=0. */
const DIST_DIR = path.join(__dirname, '..', 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const SERVE_CLIENT = process.env.SERVE_CLIENT !== '0' && fs.existsSync(DIST_INDEX)

if (SERVE_CLIENT) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)).*/, (_req, res) => {
    res.sendFile(DIST_INDEX)
  })
}

ensureMaintenanceSchema().catch((e) => {
  console.error('maintenance schema:', e.message)
})

ensureChatMuteSchema().catch((e) => {
  console.error('chat mute schema:', e.message)
})

ensurePlayerStatsSchema().catch((e) => {
  console.error('player stats schema:', e.message)
})

ensureUnitCatalogColumns().catch((e) => {
  console.error('editor catalog columns (map_editor_public):', e.message)
})

app.listen(PORT, () => {
  console.log(`API слушает порт ${PORT}`)
  if (SERVE_CLIENT) {
    console.log(`Клиент (dist): ${DIST_DIR}`)
  } else if (process.env.SERVE_CLIENT !== '0') {
    console.warn(`Клиент не найден: ${DIST_INDEX} — выполните npm run build в каталоге aov/`)
  }
})
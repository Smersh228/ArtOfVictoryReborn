const express = require('express')
const path = require('path')
const cors = require('cors')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const authRoutes = require('./routes/auth/router')
const editorRoutes = require('./routes/editor')
const editorUploadRoutes = require('./routes/editorUpload/router')
const roomsRoutes = require('./routes/rooms')
const mapsRoutes = require('./routes/maps/router')

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

app.use('/api/auth', authRoutes)
app.use('/api/editor', editorRoutes)
app.use('/api/editor', editorUploadRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/maps', mapsRoutes)

app.listen(PORT, () => {
  console.log(`API слушает порт ${PORT}`)
})
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const uploadRoot = path.join(__dirname, '..', '..', 'uploads', 'editor')
fs.mkdirSync(uploadRoot, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    const e = allowed.includes(ext) ? ext : '.png'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${e}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)
    if (!ok) {
      return cb(new Error('Допустимы только изображения (JPEG, PNG, GIF, WebP, SVG)'))
    }
    cb(null, true)
  },
})

function uploadImageHandler(req, res) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой (макс. 6 МБ)' })
      }
      return res.status(400).json({ error: err.message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не получен (поле image)' })
    }
    return res.json({ path: `/uploads/editor/${req.file.filename}` })
  })
}

module.exports = {
  uploadImageHandler,
}

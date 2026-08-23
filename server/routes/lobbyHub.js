'use strict'

const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { verifyToken } = require('../db')
const { getTokenFromRequest } = require('../cookieAuth')
const { touchPresence, dropPresence, addChatMessage, pushSystem, snapshot, getPublicProfile } = require('../lobbyHub')
const { setAvatarPath, setPlayerRole, ROLE_KEYS } = require('../playerStats')
const { isMapAdminUser } = require('../mapsPolicy')
const { applyModeration, rememberRole, getActiveBan } = require('../playerModeration')

const avatarRoot = path.join(__dirname, '..', 'uploads', 'avatars')
fs.mkdirSync(avatarRoot, { recursive: true })

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarRoot),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const e = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png'
      const uid = req.lobbyUser && req.lobbyUser.id ? Number(req.lobbyUser.id) : Date.now()
      cb(null, `${uid}-${Date.now()}${e}`)
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype)
    if (!ok) return cb(new Error('Допустимы JPEG, PNG или WebP'))
    cb(null, true)
  },
})

const router = express.Router()

async function requireUser(req, res) {
  const token = getTokenFromRequest(req)
  const user = token ? await verifyToken(token) : null
  if (!user) {
    res.status(401).json({ error: 'Нужна авторизация' })
    return null
  }
  const ban = await getActiveBan(user.id)
  if (ban) {
    dropPresence(user)
    res.status(403).json({ error: 'Аккаунт заблокирован' })
    return null
  }
  return user
}

router.get('/state', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  touchPresence(user)
  res.json(await snapshot(user))
})

router.post('/heartbeat', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  touchPresence(user)
  res.json(await snapshot(user))
})

router.post('/leave', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  dropPresence(user)
  res.json({ ok: true, ...(await snapshot(user)) })
})

router.post('/chat', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  touchPresence(user)
  const result = await addChatMessage(user, req.body && req.body.text)
  if (!result.ok) {
    return res.status(400).json({ ...(await snapshot(user)), error: result.error })
  }
  res.json(await snapshot(user))
})

router.get('/profile/:userId', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  touchPresence(user)
  const profile = await getPublicProfile(req.params.userId)
  if (!profile) {
    return res.status(404).json({ error: 'Игрок не найден' })
  }
  res.json({ profile })
})

router.post('/role', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  if (!isMapAdminUser(user)) {
    return res.status(403).json({ error: 'Менять роли может только администратор' })
  }
  const targetId = Number(req.body && req.body.userId)
  const role = req.body && req.body.role
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Неверный игрок' })
  }
  if (!ROLE_KEYS.includes(String(role || ''))) {
    return res.status(400).json({ error: 'Неверная роль' })
  }
  const target = await getPublicProfile(targetId)
  if (!target) return res.status(404).json({ error: 'Игрок не найден' })
  if (target.highlight) {
    return res.status(400).json({ error: 'Роль администратора нельзя изменить' })
  }
  const nextRole = await setPlayerRole(targetId, role)
  rememberRole(targetId, nextRole)
  touchPresence(user)
  const profile = await getPublicProfile(targetId)
  res.json({ profile })
})

router.post('/moderate', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  touchPresence(user)
  const result = await applyModeration(user, {
    userId: req.body && req.body.userId,
    action: req.body && req.body.action,
    duration: req.body && req.body.duration,
  })
  if (!result.ok) {
    return res.status(400).json({ error: result.error })
  }
  if (result.system) pushSystem(result.system)
  if (result.system && String(result.system).includes('забанен')) {
    dropPresence({ id: Number(req.body.userId) })
  }
  const profile = await getPublicProfile(req.body.userId)
  res.json({ profile, ...(await snapshot(user)) })
})

router.post('/avatar', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  req.lobbyUser = user
  avatarUpload.single('image')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой (макс. 2 МБ)' })
      }
      return res.status(400).json({ error: err.message || 'Ошибка загрузки' })
    }
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
    const avatarPath = `/uploads/avatars/${req.file.filename}`
    await setAvatarPath(user.id, avatarPath)
    touchPresence(user)
    const profile = await getPublicProfile(user.id)
    res.json({ profile, path: avatarPath })
  })
})

module.exports = router

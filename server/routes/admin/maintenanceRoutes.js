'use strict'

const express = require('express')
const { verifyToken } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')
const { isMapAdminUser } = require('../../mapsPolicy')
const {
  getMaintenanceAdminState,
  setMaintenanceEnabled,
  addAllowlistUsername,
  removeAllowlistUsername,
  listRegisteredUsersForAdmin,
} = require('../../maintenance')

const router = express.Router()

async function requireSiteAdmin(req, res, next) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return res.status(401).json({ error: 'Войдите в аккаунт' })
    const user = await verifyToken(token)
    if (!user || !isMapAdminUser(user)) {
      return res.status(403).json({ error: 'Доступ только для администратора' })
    }
    req.adminUser = user
    next()
  } catch (err) {
    next(err)
  }
}

router.use(requireSiteAdmin)

router.get('/', async (_req, res, next) => {
  try {
    const state = await getMaintenanceAdminState()
    res.json({ success: true, ...state })
  } catch (err) {
    next(err)
  }
})

router.get('/users', async (_req, res, next) => {
  try {
    const users = await listRegisteredUsersForAdmin()
    res.json({ success: true, users })
  } catch (err) {
    next(err)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true
    await setMaintenanceEnabled(enabled)
    const state = await getMaintenanceAdminState()
    res.json({ success: true, ...state })
  } catch (err) {
    next(err)
  }
})

router.post('/allowlist', async (req, res, next) => {
  try {
    const result = await addAllowlistUsername(req.body?.username)
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    const state = await getMaintenanceAdminState()
    res.json({ success: true, added: result.username, ...state })
  } catch (err) {
    next(err)
  }
})

router.delete('/allowlist/:username', async (req, res, next) => {
  try {
    const result = await removeAllowlistUsername(req.params.username)
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    const state = await getMaintenanceAdminState()
    res.json({ success: true, removed: result.username, ...state })
  } catch (err) {
    next(err)
  }
})

module.exports = router

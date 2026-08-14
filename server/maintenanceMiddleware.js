'use strict'

const { verifyToken } = require('./db')
const { getTokenFromRequest } = require('./cookieAuth')
const { isMapAdminUser } = require('./mapsPolicy')
const {
  MAINTENANCE_MESSAGE,
  isMaintenanceEnabled,
  isUsernameOnAllowlist,
} = require('./maintenance')

function apiPathname(originalUrl) {
  return String(originalUrl || '').split('?')[0]
}

const SKIP_EXACT = new Set([
  '/api/auth/maintenance-status',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
])

function sendMaintenanceBlocked(res) {
  return res.status(503).json({
    success: false,
    error: MAINTENANCE_MESSAGE,
    maintenance: true,
    message: MAINTENANCE_MESSAGE,
  })
}

async function userAllowedDuringMaintenance(user) {
  if (!user) return false
  if (isMapAdminUser(user)) return true
  return isUsernameOnAllowlist(user.username)
}

async function maintenanceApiGate(req, res, next) {
  try {
    const path = apiPathname(req.originalUrl)
    if (SKIP_EXACT.has(path)) return next()
    if (path.startsWith('/api/admin/')) return next()

    if (!(await isMaintenanceEnabled())) return next()

    const token = getTokenFromRequest(req)
    const user = token ? await verifyToken(token) : null
    if (await userAllowedDuringMaintenance(user)) return next()

    return sendMaintenanceBlocked(res)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  maintenanceApiGate,
  sendMaintenanceBlocked,
  MAINTENANCE_MESSAGE,
}

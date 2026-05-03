const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'aov_access_token'

function cookieSecure() {
  if (process.env.COOKIE_SECURE === '0' || process.env.COOKIE_SECURE === 'false') return false
  if (process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true') return true
  return process.env.NODE_ENV === 'production'
}

function getCookieOptions() {
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, getCookieOptions())
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'lax' })
}

function getTokenFromRequest(req) {
  const fromCookie = req.cookies?.[COOKIE_NAME]
  if (fromCookie) return fromCookie
  const h = req.headers.authorization
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim()
  return null
}

module.exports = {
  COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  getTokenFromRequest,
}

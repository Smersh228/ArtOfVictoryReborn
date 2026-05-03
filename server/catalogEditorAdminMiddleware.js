const { verifyToken } = require('./db')
const { getTokenFromRequest } = require('./cookieAuth')
const { isMapAdminUser } = require('./mapsPolicy')


async function requireCatalogEditorAdmin(req, res, next) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) {
      return res.status(401).json({ error: 'Войдите в аккаунт' })
    }
    const user = await verifyToken(token)
    if (!user || !isMapAdminUser(user)) {
      return res.status(403).json({
        error: 'Редактор объектов доступен только учётной записи mstislaw',
      })
    }
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { requireCatalogEditorAdmin }

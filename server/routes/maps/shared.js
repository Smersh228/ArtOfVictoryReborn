const { pool, verifyToken } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')
const { isMapAdminUser, ADMIN_MAP_USERNAME } = require('../../mapsPolicy')

const MAP_STATUS_PENDING = 'pending'
const MAP_STATUS_APPROVED = 'approved'
const MAP_STATUS_REJECTED = 'rejected'
let mapStatusSupportPromise = null

async function userFromReq(req) {
  const token = getTokenFromRequest(req)
  if (!token) return null
  return verifyToken(token)
}

async function hasMapStatusColumn() {
  if (!mapStatusSupportPromise) {
    mapStatusSupportPromise = pool
      .query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'saved_map'
             AND column_name = 'map_status'
         ) AS ok`,
      )
      .then((r) => Boolean(r.rows?.[0]?.ok))
      .catch((err) => {
        console.error('maps hasMapStatusColumn:', err.message)
        return false
      })
  }
  return mapStatusSupportPromise
}

function accessDeniedFromMapRow(row, user) {
  if (!row) return { denied: true, status: 404, error: 'Карта не найдена' }
  const oid = row.owner_user_id
  const status = row.map_status != null ? String(row.map_status).trim().toLowerCase() : null
  if (oid == null) return { denied: true, status: 403, error: 'Карта недоступна' }
  if (isMapAdminUser(user)) {
    return { denied: false }
  }
  if (Number(oid) === Number(user.id)) {
    return { denied: false }
  }
  if (status === MAP_STATUS_APPROVED) {
    return { denied: false }
  }
  if (status == null) {
    return { denied: true, status: 403, error: 'Это чужая карта' }
  }
  return { denied: true, status: 403, error: 'Карта на проверке и пока недоступна' }
}

module.exports = {
  pool,
  isMapAdminUser,
  ADMIN_MAP_USERNAME,
  MAP_STATUS_PENDING,
  MAP_STATUS_APPROVED,
  MAP_STATUS_REJECTED,
  userFromReq,
  hasMapStatusColumn,
  accessDeniedFromMapRow,
}

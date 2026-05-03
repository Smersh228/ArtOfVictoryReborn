
const ADMIN_MAP_USERNAME = 'mstislaw'

function isMapAdminUser(user) {
  if (!user || user.username == null) return false
  return String(user.username).trim().toLowerCase() === ADMIN_MAP_USERNAME
}

module.exports = {
  ADMIN_MAP_USERNAME,
  isMapAdminUser,
}

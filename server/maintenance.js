'use strict'

const { pool } = require('./db')
const { isMapAdminUser } = require('./mapsPolicy')

const MAINTENANCE_MESSAGE = 'Идут технические работы. Зайдите позже.'

let schemaReady = false

function normUsername(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

async function ensureMaintenanceSchema() {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_setting (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      maintenance_enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO site_setting (id, maintenance_enabled)
    VALUES (1, false)
    ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS maintenance_allowlist (
      username TEXT PRIMARY KEY,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  schemaReady = true
}

async function isMaintenanceEnabled() {
  await ensureMaintenanceSchema()
  const r = await pool.query('SELECT maintenance_enabled FROM site_setting WHERE id = 1')
  return r.rows[0]?.maintenance_enabled === true
}

async function setMaintenanceEnabled(enabled) {
  await ensureMaintenanceSchema()
  await pool.query(
    'UPDATE site_setting SET maintenance_enabled = $1, updated_at = NOW() WHERE id = 1',
    [!!enabled],
  )
  return !!enabled
}

async function listAllowlistUsernames() {
  await ensureMaintenanceSchema()
  const r = await pool.query(
    'SELECT username, added_at FROM maintenance_allowlist ORDER BY LOWER(username)',
  )
  return r.rows.map((row) => ({
    username: String(row.username),
    addedAt: row.added_at,
  }))
}

async function isUsernameOnAllowlist(username) {
  const key = normUsername(username)
  if (!key) return false
  await ensureMaintenanceSchema()
  const r = await pool.query(
    'SELECT 1 FROM maintenance_allowlist WHERE LOWER(TRIM(username)) = $1 LIMIT 1',
    [key],
  )
  return r.rows.length > 0
}

async function addAllowlistUsername(rawUsername) {
  const key = normUsername(rawUsername)
  if (!key) return { ok: false, error: 'Укажите логин' }
  if (key.length > 13) return { ok: false, error: 'Логин не длиннее 13 символов' }
  await ensureMaintenanceSchema()
  await pool.query(
    `INSERT INTO maintenance_allowlist (username) VALUES ($1)
     ON CONFLICT (username) DO NOTHING`,
    [key],
  )
  return { ok: true, username: key }
}

async function removeAllowlistUsername(rawUsername) {
  const key = normUsername(rawUsername)
  if (!key) return { ok: false, error: 'Укажите логин' }
  await ensureMaintenanceSchema()
  const r = await pool.query(
    'DELETE FROM maintenance_allowlist WHERE LOWER(TRIM(username)) = $1 RETURNING username',
    [key],
  )
  if (!r.rows.length) return { ok: false, error: 'Логина нет в списке' }
  return { ok: true, username: String(r.rows[0].username) }
}

/** true = пользователь заблокирован техработами */
async function isMaintenanceBlockedForUser(user) {
  if (!(await isMaintenanceEnabled())) return false
  if (!user) return true
  if (isMapAdminUser(user)) return false
  return !(await isUsernameOnAllowlist(user.username))
}

async function getMaintenancePublicStatus() {
  const enabled = await isMaintenanceEnabled()
  return {
    enabled,
    message: MAINTENANCE_MESSAGE,
  }
}

async function getMaintenanceAdminState() {
  const enabled = await isMaintenanceEnabled()
  const allowlist = await listAllowlistUsernames()
  return { enabled, allowlist, message: MAINTENANCE_MESSAGE }
}

async function listRegisteredUsersForAdmin() {
  await ensureMaintenanceSchema()
  const r = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.created_at,
      EXISTS (
        SELECT 1 FROM maintenance_allowlist a
        WHERE LOWER(TRIM(a.username)) = LOWER(TRIM(u.username))
      ) AS on_allowlist
    FROM users u
    ORDER BY LOWER(TRIM(u.username))
  `)
  return r.rows.map((row) => {
    const username = String(row.username ?? '').trim()
    const user = { id: Number(row.id), username }
    return {
      id: Number(row.id),
      username,
      email: String(row.email ?? ''),
      createdAt: row.created_at,
      onAllowlist: row.on_allowlist === true,
      isAdmin: isMapAdminUser(user),
    }
  })
}

module.exports = {
  MAINTENANCE_MESSAGE,
  isMaintenanceEnabled,
  setMaintenanceEnabled,
  listAllowlistUsernames,
  isUsernameOnAllowlist,
  addAllowlistUsername,
  removeAllowlistUsername,
  isMaintenanceBlockedForUser,
  getMaintenancePublicStatus,
  getMaintenanceAdminState,
  listRegisteredUsersForAdmin,
  ensureMaintenanceSchema,
}

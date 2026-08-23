'use strict'

const { pool } = require('./db')
const { readProfileStats } = require('./playerStats')

const HIGHLIGHT_USERNAME = 'mstislaw'

const MUTE_DURATIONS_MOD = ['10m', '1h', '6h', '1d', '7d']
const MUTE_DURATIONS_ADMIN = [...MUTE_DURATIONS_MOD, 'forever']
const BAN_DURATIONS = ['1d', '7d', '30d', 'forever']

const DURATION_MS = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  forever: null,
}

const roleCache = new Map()
const muted = new Map()
const banned = new Map()
let schemaReady = false

function isAdminUsername(username) {
  return String(username || '').trim().toLowerCase() === HIGHLIGHT_USERNAME
}

function durationMs(key) {
  if (!Object.prototype.hasOwnProperty.call(DURATION_MS, key)) return undefined
  return DURATION_MS[key]
}

function pruneTimed(map, now = Date.now()) {
  for (const [id, row] of map) {
    if (row && row.expiresAt != null && Number(row.expiresAt) <= now) map.delete(id)
  }
}

function isAdminRole(roleKey) {
  return roleKey === 'admin'
}

function canMuteRole(actorRole) {
  return actorRole === 'admin' || actorRole === 'moderator' || actorRole === 'veteran_moderator'
}

function canBanRole(actorRole) {
  return actorRole === 'admin'
}

function canMuteTarget(actorRole, targetRole) {
  if (isAdminRole(targetRole)) return false
  if (actorRole === 'admin') return true
  return targetRole === 'player' || targetRole === 'veteran'
}

async function ensureModerationSchema() {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_mutes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      muted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(`ALTER TABLE chat_mutes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`)
  await pool.query(`ALTER TABLE chat_mutes ADD COLUMN IF NOT EXISTS muted_by INTEGER`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_bans (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      banned_by INTEGER,
      banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
  `)
  muted.clear()
  banned.clear()
  const mutes = await pool.query('SELECT user_id, expires_at FROM chat_mutes')
  for (const row of mutes.rows) {
    const id = Number(row.user_id)
    if (!Number.isFinite(id)) continue
    muted.set(id, { expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null })
  }
  const bans = await pool.query('SELECT user_id, expires_at FROM user_bans')
  for (const row of bans.rows) {
    const id = Number(row.user_id)
    if (!Number.isFinite(id)) continue
    banned.set(id, { expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null })
  }
  schemaReady = true
}

async function resolveRoleKey(user) {
  const id = Number(user && user.id)
  const username = user && user.username
  if (isAdminUsername(username)) {
    if (Number.isFinite(id)) roleCache.set(id, 'admin')
    return 'admin'
  }
  if (!Number.isFinite(id) || id <= 0) return 'player'
  const stats = await readProfileStats(id)
  roleCache.set(id, stats.role)
  return stats.role
}

function peekRoleKey(userId, username) {
  if (isAdminUsername(username)) return 'admin'
  return roleCache.get(Number(userId)) || 'player'
}

function rememberRole(userId, roleKey) {
  const id = Number(userId)
  if (Number.isFinite(id) && id > 0) roleCache.set(id, roleKey)
}

function isMuted(userId) {
  pruneTimed(muted)
  return muted.has(Number(userId))
}

function isBanned(userId) {
  pruneTimed(banned)
  return banned.has(Number(userId))
}

function sanctionUntil(map, userId) {
  pruneTimed(map)
  const row = map.get(Number(userId))
  if (!row) return { active: false, until: null }
  return { active: true, until: row.expiresAt }
}

function formatUntil(expiresAt) {
  if (expiresAt == null) return 'навсегда'
  return new Date(expiresAt).toLocaleString('ru-RU')
}

async function getActiveBan(userId) {
  await ensureModerationSchema()
  const info = sanctionUntil(banned, userId)
  if (!info.active) return null
  return { until: info.until }
}

async function muteUser(user, { duration, reason, by } = {}) {
  const id = Number(user && user.id)
  const username = String(user && user.username ? user.username : '').trim()
  if (!Number.isFinite(id) || id <= 0) return
  const expiresAt = duration === undefined ? null : duration
  muted.set(id, { expiresAt })
  await ensureModerationSchema()
  await pool.query(
    `INSERT INTO chat_mutes (user_id, reason, muted_by, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       reason = EXCLUDED.reason,
       muted_by = EXCLUDED.muted_by,
       expires_at = EXCLUDED.expires_at,
       muted_at = NOW()`,
    [id, reason || 'mute', by || null, expiresAt == null ? null : new Date(expiresAt)],
  )
  return username
}

async function unmuteUser(userId) {
  const id = Number(userId)
  muted.delete(id)
  await ensureModerationSchema()
  await pool.query('DELETE FROM chat_mutes WHERE user_id = $1', [id])
}

async function banUser(user, { duration, reason, by } = {}) {
  const id = Number(user && user.id)
  const username = String(user && user.username ? user.username : '').trim()
  if (!Number.isFinite(id) || id <= 0) return
  const expiresAt = duration === undefined ? null : duration
  banned.set(id, { expiresAt })
  await ensureModerationSchema()
  await pool.query(
    `INSERT INTO user_bans (user_id, reason, banned_by, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       reason = EXCLUDED.reason,
       banned_by = EXCLUDED.banned_by,
       expires_at = EXCLUDED.expires_at,
       banned_at = NOW()`,
    [id, reason || 'ban', by || null, expiresAt == null ? null : new Date(expiresAt)],
  )
  return username
}

async function unbanUser(userId) {
  const id = Number(userId)
  banned.delete(id)
  await ensureModerationSchema()
  await pool.query('DELETE FROM user_bans WHERE user_id = $1', [id])
}

function sanctionStatus(userId) {
  const mute = sanctionUntil(muted, userId)
  const ban = sanctionUntil(banned, userId)
  return {
    muted: mute.active,
    mutedUntil: mute.active ? mute.until : null,
    banned: ban.active,
    bannedUntil: ban.active ? ban.until : null,
  }
}

async function applyModeration(actor, { userId, action, duration }) {
  await ensureModerationSchema()
  const actorRole = await resolveRoleKey(actor)
  const targetId = Number(userId)
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return { ok: false, error: 'Неверный игрок' }
  }
  if (Number(actor.id) === targetId) {
    return { ok: false, error: 'Нельзя применить действие к себе' }
  }
  const targetRes = await pool.query('SELECT id, username FROM users WHERE id = $1', [targetId])
  const targetRow = targetRes.rows[0]
  if (!targetRow) return { ok: false, error: 'Игрок не найден' }
  const target = { id: Number(targetRow.id), username: String(targetRow.username || '').trim() }
  const targetRole = await resolveRoleKey(target)

  if (isAdminRole(targetRole)) {
    return { ok: false, error: 'Нельзя наказать администратора' }
  }

  if (action === 'unmute') {
    if (!canMuteRole(actorRole)) return { ok: false, error: 'Недостаточно прав' }
    if (!canMuteTarget(actorRole, targetRole)) return { ok: false, error: 'Нельзя снять мут с этого игрока' }
    await unmuteUser(target.id)
    return { ok: true, system: `${target.username} размучен` }
  }
  if (action === 'unban') {
    if (!canBanRole(actorRole)) return { ok: false, error: 'Недостаточно прав' }
    await unbanUser(target.id)
    return { ok: true, system: `${target.username} разбанен` }
  }
  if (action === 'mute') {
    if (!canMuteRole(actorRole)) return { ok: false, error: 'Недостаточно прав' }
    if (!canMuteTarget(actorRole, targetRole)) return { ok: false, error: 'Нельзя замутить этого игрока' }
    const allowed = actorRole === 'admin' ? MUTE_DURATIONS_ADMIN : MUTE_DURATIONS_MOD
    if (!allowed.includes(duration)) return { ok: false, error: 'Неверное время мута' }
    const ms = durationMs(duration)
    const until = ms == null ? null : Date.now() + ms
    await muteUser(target, { duration: until, reason: 'staff', by: actor.id })
    return {
      ok: true,
      system: `${target.username} получил мут (${formatUntil(until)})`,
    }
  }
  if (action === 'ban') {
    if (!canBanRole(actorRole)) return { ok: false, error: 'Недостаточно прав' }
    if (!BAN_DURATIONS.includes(duration)) return { ok: false, error: 'Неверное время бана' }
    const ms = durationMs(duration)
    const until = ms == null ? null : Date.now() + ms
    await banUser(target, { duration: until, reason: 'staff', by: actor.id })
    return {
      ok: true,
      system: `${target.username} забанен (${formatUntil(until)})`,
    }
  }
  return { ok: false, error: 'Неизвестное действие' }
}

module.exports = {
  MUTE_DURATIONS_MOD,
  MUTE_DURATIONS_ADMIN,
  BAN_DURATIONS,
  isAdminUsername,
  canMuteRole,
  canBanRole,
  ensureModerationSchema,
  resolveRoleKey,
  peekRoleKey,
  rememberRole,
  isMuted,
  isBanned,
  getActiveBan,
  muteUser,
  unmuteUser,
  sanctionStatus,
  applyModeration,
  formatUntil,
}

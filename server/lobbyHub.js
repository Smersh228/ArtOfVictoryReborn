'use strict'

const { pool } = require('./db')
const { readProfileStats, roleLabel } = require('./playerStats')
const {
  ensureModerationSchema,
  resolveRoleKey,
  peekRoleKey,
  isMuted,
  muteUser,
  sanctionStatus,
  isAdminUsername,
} = require('./playerModeration')
const { isMapAdminUser } = require('./mapsPolicy')
const { ensureMaintenanceSchema, getOnlineBoostCached } = require('./maintenance')

const PRESENCE_TTL_MS = 20_000
const MAX_CHAT = 80
const MAX_TEXT = 240
const CHAT_COOLDOWN_MS = 5_000
const SPAM_REPEAT_LIMIT = 3
const SPAM_WINDOW_MS = 8_000
const presence = new Map()
const chat = []
const lastChat = new Map()
let nextMsgId = 1

function isHighlightUsername(username) {
  return isAdminUsername(username)
}

function prunePresence(now = Date.now()) {
  for (const [id, row] of presence) {
    if (!row || now - Number(row.lastSeen) > PRESENCE_TTL_MS) {
      presence.delete(id)
    }
  }
}

function touchPresence(user) {
  const id = Number(user && user.id)
  const username = String(user && user.username ? user.username : '').trim()
  if (!Number.isFinite(id) || id <= 0 || !username) return
  presence.set(id, { id, username, lastSeen: Date.now() })
}

function dropPresence(user) {
  const id = Number(user && user.id != null ? user.id : user)
  if (!Number.isFinite(id) || id <= 0) return
  presence.delete(id)
}

function isUserOnline(userId) {
  prunePresence()
  return presence.has(Number(userId))
}

function onlineCount() {
  prunePresence()
  return presence.size
}

function inBattleCount() {
  try {
    const { rooms } = require('./routes/rooms/state')
    const keys = new Set()
    for (const room of rooms.values()) {
      if (room.battleStartedAt == null) continue
      for (const m of room.members || []) {
        if (m && m.key) keys.add(m.key)
      }
    }
    return keys.size
  } catch {
    return 0
  }
}

function listMessages() {
  return chat.map((m) => ({
    id: m.id,
    userId: m.userId,
    username: m.username,
    text: m.text,
    ts: m.ts,
    system: !!m.system,
    highlight: !m.system && isHighlightUsername(m.username),
    roleKey: m.system ? undefined : m.roleKey || peekRoleKey(m.userId, m.username),
  }))
}

function sanitizeChatText(raw) {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text
}

function pushSystem(text) {
  const msg = {
    id: nextMsgId++,
    userId: 0,
    username: 'Система',
    text,
    ts: Date.now(),
    system: true,
  }
  chat.push(msg)
  if (chat.length > MAX_CHAT) chat.splice(0, chat.length - MAX_CHAT)
  return msg
}

async function ensureChatMuteSchema() {
  await ensureModerationSchema()
}

async function muteUserPermanent(user, reason) {
  const username = await muteUser(user, { duration: null, reason: reason || 'spam_repeat', by: 0 })
  if (username) pushSystem(`${username} получил системный мут за спам`)
}

async function addChatMessage(user, rawText) {
  const id = Number(user && user.id)
  const username = String(user && user.username ? user.username : '').trim()
  const text = sanitizeChatText(rawText)
  if (!Number.isFinite(id) || id <= 0 || !username) {
    return { ok: false, error: 'Нужна авторизация' }
  }
  if (!text) return { ok: false, error: 'Пустое сообщение' }
  await ensureChatMuteSchema()
  if (isMuted(id)) {
    return { ok: false, error: 'Вы получили системный мут' }
  }
  const now = Date.now()
  const prev = lastChat.get(id)
  if (!isHighlightUsername(username) && prev && now - Number(prev.at) < CHAT_COOLDOWN_MS) {
    const left = Math.ceil((CHAT_COOLDOWN_MS - (now - Number(prev.at))) / 1000)
    return { ok: false, error: `Подождите ${left} сек.` }
  }
  let streak = 1
  if (prev && prev.text === text && now - Number(prev.at) <= SPAM_WINDOW_MS) {
    streak = Number(prev.streak || 1) + 1
  }
  if (streak >= SPAM_REPEAT_LIMIT) {
    await muteUserPermanent(user, 'spam_repeat')
    return { ok: false, error: 'Системный мут за спам одинаковыми сообщениями' }
  }
  lastChat.set(id, { at: now, text, streak })
  const roleKey = await resolveRoleKey(user)
  const msg = { id: nextMsgId++, userId: id, username, text, ts: now, roleKey }
  chat.push(msg)
  if (chat.length > MAX_CHAT) chat.splice(0, chat.length - MAX_CHAT)
  return { ok: true, message: msg }
}

async function snapshot(user) {
  await ensureMaintenanceSchema()
  const uid = user ? Number(user.id) : NaN
  const roleKey = user ? await resolveRoleKey(user) : 'player'
  const realOnline = onlineCount()
  const onlineBoost = getOnlineBoostCached()
  const out = {
    online: realOnline + onlineBoost,
    inBattle: inBattleCount(),
    messages: listMessages(),
    muted: Number.isFinite(uid) ? isMuted(uid) : false,
    roleKey,
    cooldownMs: isHighlightUsername(user && user.username) ? 0 : CHAT_COOLDOWN_MS,
  }
  if (isMapAdminUser(user)) {
    out.onlineReal = realOnline
    out.onlineBoost = onlineBoost
  }
  return out
}

async function getPublicProfile(userId) {
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return null
  const r = await pool.query('SELECT id, username, created_at FROM users WHERE id = $1', [id])
  const row = r.rows[0]
  if (!row) return null
  const username = String(row.username || '').trim()
  const stats = await readProfileStats(row.id)
  const sanctions = sanctionStatus(row.id)
  return {
    id: Number(row.id),
    username,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    online: isUserOnline(row.id),
    highlight: isHighlightUsername(username),
    roleKey: isHighlightUsername(username) ? 'admin' : stats.role,
    role: isHighlightUsername(username) ? 'Администратор' : roleLabel(stats.role),
    wins: stats.wins,
    losses: stats.losses,
    kills: stats.kills,
    avatarPath: stats.avatarPath,
    muted: sanctions.muted,
    mutedUntil: sanctions.mutedUntil,
    banned: sanctions.banned,
    bannedUntil: sanctions.bannedUntil,
  }
}

module.exports = {
  touchPresence,
  dropPresence,
  addChatMessage,
  pushSystem,
  snapshot,
  ensureChatMuteSchema,
  getPublicProfile,
  PRESENCE_TTL_MS,
  CHAT_COOLDOWN_MS,
}

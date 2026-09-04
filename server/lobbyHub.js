'use strict'

const { pool } = require('./db')
const { readProfileStats, roleLabel, touchLastSeen } = require('./playerStats')
const {
  ensureModerationSchema,
  resolveRoleKey,
  peekRoleKey,
  isMuted,
  muteUser,
  unmuteUser,
  sanctionStatus,
  isAdminUsername,
} = require('./playerModeration')
const { isMapAdminUser } = require('./mapsPolicy')
const { ensureMaintenanceSchema, getOnlineBoostCached } = require('./maintenance')

const PRESENCE_TTL_MS = 20_000
const LAST_SEEN_FLUSH_MS = 30_000
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

function flushLastSeen(id, at) {
  void touchLastSeen(id, at).catch(() => {})
}

function prunePresence(now = Date.now()) {
  for (const [id, row] of presence) {
    if (!row || now - Number(row.lastSeen) > PRESENCE_TTL_MS) {
      if (row && Number(row.lastSeen) > 0) flushLastSeen(id, row.lastSeen)
      presence.delete(id)
    }
  }
}

function touchPresence(user) {
  const id = Number(user && user.id)
  const username = String(user && user.username ? user.username : '').trim()
  if (!Number.isFinite(id) || id <= 0 || !username) return
  const now = Date.now()
  const prev = presence.get(id)
  const lastFlushed = prev && Number(prev.lastFlushed) > 0 ? Number(prev.lastFlushed) : 0
  const shouldFlush = lastFlushed <= 0 || now - lastFlushed >= LAST_SEEN_FLUSH_MS
  presence.set(id, { id, username, lastSeen: now, lastFlushed: shouldFlush ? now : lastFlushed })
  if (shouldFlush) flushLastSeen(id, now)
}

function dropPresence(user) {
  const id = Number(user && user.id != null ? user.id : user)
  if (!Number.isFinite(id) || id <= 0) return
  const prev = presence.get(id)
  flushLastSeen(id, prev && Number(prev.lastSeen) > 0 ? prev.lastSeen : Date.now())
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

function userIdFromMemberKey(key) {
  if (typeof key !== 'string' || !key.startsWith('u:')) return null
  const n = Number(key.slice(2))
  return Number.isFinite(n) && n > 0 ? n : null
}

function activityByUserId() {
  const map = new Map()
  try {
    const { rooms } = require('./routes/rooms/state')
    for (const room of rooms.values()) {
      const inBattle = room.battleStartedAt != null
      const roomName = String(room.name || '').trim()
      const roomId = Number(room.id)
      for (const m of room.members || []) {
        const id = userIdFromMemberKey(m && m.key)
        if (!id) continue
        map.set(id, {
          where: inBattle ? 'battle' : 'lobby',
          roomName,
          roomId: Number.isFinite(roomId) ? roomId : null,
        })
      }
    }
  } catch {
    /* комнаты недоступны */
  }
  return map
}

function listOnlinePlayers() {
  prunePresence()
  const activity = activityByUserId()
  const rows = []
  for (const row of presence.values()) {
    const id = Number(row && row.id)
    const username = String(row && row.username ? row.username : '').trim()
    if (!Number.isFinite(id) || id <= 0 || !username) continue
    const act = activity.get(id)
    rows.push({
      id,
      username,
      lastSeen: Number(row.lastSeen) || Date.now(),
      where: act && act.where ? act.where : 'site',
      roomName: act && act.roomName ? act.roomName : null,
      roomId: act && act.roomId != null ? act.roomId : null,
      highlight: isHighlightUsername(username),
      roleKey: isHighlightUsername(username) ? 'admin' : peekRoleKey(id, username),
    })
  }
  rows.sort((a, b) => {
    const byName = String(a.username).localeCompare(String(b.username), 'ru')
    if (byName !== 0) return byName
    return a.id - b.id
  })
  return rows
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
  if (isHighlightUsername(user && user.username)) return
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
  if (isHighlightUsername(username)) {
    if (isMuted(id)) await unmuteUser(id)
  } else if (isMuted(id, username)) {
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
  if (streak >= SPAM_REPEAT_LIMIT && !isHighlightUsername(username)) {
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
    muted: Number.isFinite(uid) && !isHighlightUsername(user && user.username) ? isMuted(uid, user && user.username) : false,
    roleKey,
    cooldownMs: isHighlightUsername(user && user.username) ? 0 : CHAT_COOLDOWN_MS,
  }
  if (isMapAdminUser(user)) {
    out.onlineReal = realOnline
    out.onlineBoost = onlineBoost
    out.onlinePlayers = listOnlinePlayers()
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
  const sanctions = sanctionStatus(row.id, username)
  const online = isUserOnline(row.id)
  const live = presence.get(Number(row.id))
  let lastSeenAt = stats.lastSeenAt
  if (online && live && Number(live.lastSeen) > 0) {
    lastSeenAt = new Date(Number(live.lastSeen)).toISOString()
  }
  return {
    id: Number(row.id),
    username,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    online,
    lastSeenAt,
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
  listOnlinePlayers,
  PRESENCE_TTL_MS,
  CHAT_COOLDOWN_MS,
}

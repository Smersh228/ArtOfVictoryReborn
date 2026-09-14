'use strict'

const { pool } = require('./db')

const UNIT_TYPES = [
  'infantry',
  'artillery',
  'tech',
  'armor',
  'lighttank',
  'mediumtank',
  'heavytank',
  'lightair',
  'heavyair',
]

const UNIT_TYPE_ALIASES = {
  lightair: 'lightair',
  light_air: 'lightair',
  lighttank: 'lighttank',
  light_tank: 'lighttank',
  mediumtank: 'mediumtank',
  medium_tank: 'mediumtank',
  heavytank: 'heavytank',
  heavy_tank: 'heavytank',
  heavyair: 'heavyair',
  heavy_air: 'heavyair',
  build: 'other',
  building: 'other',
  sooruzhenie: 'other',
}

const ROLE_KEYS = ['player', 'moderator', 'veteran', 'veteran_moderator']
const ROLE_LABELS = {
  player: 'Игрок',
  moderator: 'Модератор',
  veteran: 'Ветеран',
  veteran_moderator: 'Ветеран-модератор',
  admin: 'Администратор',
}

let schemaReady = false

function normalizeRole(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
  if (t === 'moderator' || t === 'модератор') return 'moderator'
  if (t === 'veteran_moderator' || t === 'veteran-moderator' || t === 'ветеран-модератор' || t === 'ветеран модератор') {
    return 'veteran_moderator'
  }
  if (t === 'veteran' || t === 'ветеран') return 'veteran'
  if (t === 'player' || t === 'игрок') return 'player'
  return 'player'
}

function roleLabel(roleKey) {
  return ROLE_LABELS[roleKey] || ROLE_LABELS.player
}

function normalizeUnitType(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '')
  if (UNIT_TYPE_ALIASES[t]) return UNIT_TYPE_ALIASES[t]
  if (UNIT_TYPES.includes(t)) return t
  return 'other'
}

function emptyKills() {
  const o = { other: 0 }
  for (const k of UNIT_TYPES) o[k] = 0
  return o
}

function mergeKills(raw) {
  const out = emptyKills()
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeUnitType(k)
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) out[key] = (out[key] || 0) + Math.floor(n)
  }
  return out
}

function userIdFromMemberKey(key) {
  if (typeof key !== 'string' || !key.startsWith('u:')) return null
  const n = Number(key.slice(2))
  return Number.isFinite(n) && n > 0 ? n : null
}

function fighterMembers(room) {
  const out = []
  for (const m of room.members || []) {
    if (m.faction !== 'rkka' && m.faction !== 'wehrmacht') continue
    const id = userIdFromMemberKey(m.key)
    if (!id) continue
    out.push({ id, faction: m.faction, key: m.key })
  }
  return out
}

function isVsBotRoom(room) {
  if (!room) return false
  if (room.solo) return true
  for (const m of room.members || []) {
    if (m && (m.isBot || String(m.key || '').startsWith('bot:'))) return true
  }
  return false
}

function emptyBucket() {
  return { wins: 0, losses: 0, kills: emptyKills(), casualties: emptyKills() }
}

async function ensurePlayerStatsSchema() {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      kills JSONB NOT NULL DEFAULT '{}'::jsonb,
      casualties JSONB NOT NULL DEFAULT '{}'::jsonb,
      avatar_path TEXT,
      role TEXT NOT NULL DEFAULT 'player',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS casualties JSONB NOT NULL DEFAULT '{}'::jsonb`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS wins_bot INTEGER NOT NULL DEFAULT 0`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS losses_bot INTEGER NOT NULL DEFAULT 0`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS kills_bot JSONB NOT NULL DEFAULT '{}'::jsonb`)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS casualties_bot JSONB NOT NULL DEFAULT '{}'::jsonb`)
  schemaReady = true
}

async function ensureRow(userId) {
  await ensurePlayerStatsSchema()
  await pool.query(
    `INSERT INTO player_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
}

async function addWin(userId, vsBot) {
  await ensureRow(userId)
  const col = vsBot ? 'wins_bot' : 'wins'
  await pool.query(
    `UPDATE player_profiles SET ${col} = ${col} + 1, updated_at = NOW() WHERE user_id = $1`,
    [userId],
  )
}

async function addLoss(userId, vsBot) {
  await ensureRow(userId)
  const col = vsBot ? 'losses_bot' : 'losses'
  await pool.query(
    `UPDATE player_profiles SET ${col} = ${col} + 1, updated_at = NOW() WHERE user_id = $1`,
    [userId],
  )
}

async function bumpUnitJsonCount(userId, column, unitType) {
  const key = normalizeUnitType(unitType)
  const cols = { kills: 'kills', casualties: 'casualties', kills_bot: 'kills_bot', casualties_bot: 'casualties_bot' }
  const col = cols[column]
  if (!col) return
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles
     SET ${col} = jsonb_set(
       COALESCE(${col}, '{}'::jsonb),
       ARRAY[$1]::text[],
       to_jsonb(COALESCE((${col}->>$1)::int, 0) + 1),
       true
     ),
     updated_at = NOW()
     WHERE user_id = $2`,
    [key, userId],
  )
}

async function addKill(userId, unitType, vsBot) {
  await bumpUnitJsonCount(userId, vsBot ? 'kills_bot' : 'kills', unitType)
}

async function addCasualty(userId, unitType, vsBot) {
  await bumpUnitJsonCount(userId, vsBot ? 'casualties_bot' : 'casualties', unitType)
}

async function setAvatarPath(userId, avatarPath) {
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles SET avatar_path = $1, updated_at = NOW() WHERE user_id = $2`,
    [avatarPath, userId],
  )
}

async function setPlayerRole(userId, role) {
  const key = normalizeRole(role)
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles SET role = $1, updated_at = NOW() WHERE user_id = $2`,
    [key, userId],
  )
  return key
}

function isoFromDbDate(raw) {
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

async function touchLastSeen(userId, atMs) {
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return
  const at = new Date(Number(atMs) || Date.now())
  if (!Number.isFinite(at.getTime())) return
  await ensureRow(id)
  await pool.query(
    `UPDATE player_profiles
     SET last_seen_at = GREATEST(COALESCE(last_seen_at, to_timestamp(0)), $2::timestamptz),
         updated_at = NOW()
     WHERE user_id = $1`,
    [id, at.toISOString()],
  )
}

function jsonCountTotalSql(column) {
  return `(
    SELECT COALESCE(SUM((value)::int), 0)
    FROM jsonb_each_text(COALESCE(${column}, '{}'::jsonb))
    WHERE value ~ '^[0-9]+$'
  )`
}

async function listLeaderboard(sortKey, limit, vsKey) {
  await ensurePlayerStatsSchema()
  const sort = String(sortKey || 'kills').trim()
  const vsBot = String(vsKey || 'player').trim() === 'bot'
  const winsCol = vsBot ? 'COALESCE(p.wins_bot, 0)' : 'COALESCE(p.wins, 0)'
  const lossesCol = vsBot ? 'COALESCE(p.losses_bot, 0)' : 'COALESCE(p.losses, 0)'
  const killsCol = vsBot ? 'p.kills_bot' : 'p.kills'
  const casCol = vsBot ? 'p.casualties_bot' : 'p.casualties'
  const orderExpr =
    sort === 'wins'
      ? 'wins DESC, kills_total DESC, losses ASC'
      : sort === 'losses'
        ? 'losses DESC, casualties_total DESC, wins ASC'
        : sort === 'casualties'
          ? 'casualties_total DESC, losses DESC, kills_total DESC'
          : 'kills_total DESC, wins DESC, casualties_total ASC'
  const cap = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)))
  const r = await pool.query(
    `SELECT
       u.id,
       u.username,
       ${winsCol} AS wins,
       ${lossesCol} AS losses,
       COALESCE(${killsCol}, '{}'::jsonb) AS kills,
       COALESCE(${casCol}, '{}'::jsonb) AS casualties,
       COALESCE(p.role, 'player') AS role,
       ${jsonCountTotalSql(killsCol)} AS kills_total,
       ${jsonCountTotalSql(casCol)} AS casualties_total
     FROM player_profiles p
     JOIN users u ON u.id = p.user_id
     ORDER BY ${orderExpr}, u.username ASC
     LIMIT $1`,
    [cap],
  )
  return r.rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username || '').trim(),
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    kills: mergeKills(row.kills),
    casualties: mergeKills(row.casualties),
    killsTotal: Number(row.kills_total) || 0,
    casualtiesTotal: Number(row.casualties_total) || 0,
    role: normalizeRole(row.role),
    vs: vsBot ? 'bot' : 'player',
  }))
}

async function readProfileStats(userId) {
  await ensurePlayerStatsSchema()
  const r = await pool.query(
    `SELECT wins, losses, kills, casualties, wins_bot, losses_bot, kills_bot, casualties_bot,
            avatar_path, role, last_seen_at
     FROM player_profiles WHERE user_id = $1`,
    [userId],
  )
  const row = r.rows[0]
  if (!row) {
    const empty = emptyBucket()
    return {
      ...empty,
      vsPlayer: emptyBucket(),
      vsBot: emptyBucket(),
      avatarPath: null,
      role: 'player',
      lastSeenAt: null,
    }
  }
  const vsPlayer = {
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    kills: mergeKills(row.kills),
    casualties: mergeKills(row.casualties),
  }
  const vsBot = {
    wins: Number(row.wins_bot) || 0,
    losses: Number(row.losses_bot) || 0,
    kills: mergeKills(row.kills_bot),
    casualties: mergeKills(row.casualties_bot),
  }
  return {
    wins: vsPlayer.wins,
    losses: vsPlayer.losses,
    kills: vsPlayer.kills,
    casualties: vsPlayer.casualties,
    vsPlayer,
    vsBot,
    avatarPath: row.avatar_path ? String(row.avatar_path) : null,
    role: normalizeRole(row.role),
    lastSeenAt: isoFromDbDate(row.last_seen_at),
  }
}

async function creditKillsFromLog(room, log) {
  if (!room || !Array.isArray(log) || !log.length) return
  const fighters = fighterMembers(room)
  if (!fighters.length) return
  const vsBot = isVsBotRoom(room)
  const seen = new Set()
  for (const e of log) {
    const meta = e && e.meta && typeof e.meta === 'object' ? e.meta : e
    if (!meta || !meta.destroyed) continue
    const deadFaction = String(meta.unitFaction || '').trim().toLowerCase()
    if (deadFaction !== 'rkka' && deadFaction !== 'wehrmacht') continue
    const uid = Number(meta.unitInstanceId)
    const dedupe = Number.isFinite(uid)
      ? `${uid}:${e.turn ?? ''}`
      : `${deadFaction}:${meta.unitType || ''}:${e.t || ''}:${e.text || ''}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const type = normalizeUnitType(meta.unitType)
    const opp = deadFaction === 'rkka' ? 'wehrmacht' : 'rkka'
    for (const p of fighters) {
      if (p.faction === opp) await addKill(p.id, type, vsBot)
      else if (p.faction === deadFaction) await addCasualty(p.id, type, vsBot)
    }
  }
}

async function applyRoomOutcomeIfNeeded(room) {
  if (!room || room.playerStatsApplied) return
  const vsBot = isVsBotRoom(room)
  const scenarioWinner = room.battleScenarioWinnerFaction
  const surrendered = (room.battleSurrenderSeq ?? 0) > 0 && room.battleSurrenderBy
  if ((room.battleScenarioEndSeq ?? 0) > 0 && (scenarioWinner === 'rkka' || scenarioWinner === 'wehrmacht')) {
    room.playerStatsApplied = true
    const fighters = fighterMembers(room)
    for (const p of fighters) {
      if (p.faction === scenarioWinner) await addWin(p.id, vsBot)
      else await addLoss(p.id, vsBot)
    }
    return
  }
  if (surrendered) {
    room.playerStatsApplied = true
    const loserId = userIdFromMemberKey(room.battleSurrenderBy)
    const fighters = fighterMembers(room)
    for (const p of fighters) {
      if (p.key === room.battleSurrenderBy || p.id === loserId) await addLoss(p.id, vsBot)
      else await addWin(p.id, vsBot)
    }
  }
}

module.exports = {
  UNIT_TYPES,
  ROLE_KEYS,
  ROLE_LABELS,
  normalizeRole,
  roleLabel,
  ensurePlayerStatsSchema,
  readProfileStats,
  listLeaderboard,
  touchLastSeen,
  setAvatarPath,
  setPlayerRole,
  creditKillsFromLog,
  applyRoomOutcomeIfNeeded,
  emptyKills,
}

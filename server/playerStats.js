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

async function ensurePlayerStatsSchema() {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      kills JSONB NOT NULL DEFAULT '{}'::jsonb,
      avatar_path TEXT,
      role TEXT NOT NULL DEFAULT 'player',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'`)
  schemaReady = true
}

async function ensureRow(userId) {
  await ensurePlayerStatsSchema()
  await pool.query(
    `INSERT INTO player_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
}

async function addWin(userId) {
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles SET wins = wins + 1, updated_at = NOW() WHERE user_id = $1`,
    [userId],
  )
}

async function addLoss(userId) {
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles SET losses = losses + 1, updated_at = NOW() WHERE user_id = $1`,
    [userId],
  )
}

async function addKill(userId, unitType) {
  const key = normalizeUnitType(unitType)
  await ensureRow(userId)
  await pool.query(
    `UPDATE player_profiles
     SET kills = jsonb_set(
       COALESCE(kills, '{}'::jsonb),
       ARRAY[$1]::text[],
       to_jsonb(COALESCE((kills->>$1)::int, 0) + 1),
       true
     ),
     updated_at = NOW()
     WHERE user_id = $2`,
    [key, userId],
  )
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

async function readProfileStats(userId) {
  await ensurePlayerStatsSchema()
  const r = await pool.query(
    'SELECT wins, losses, kills, avatar_path, role FROM player_profiles WHERE user_id = $1',
    [userId],
  )
  const row = r.rows[0]
  if (!row) {
    return { wins: 0, losses: 0, kills: emptyKills(), avatarPath: null, role: 'player' }
  }
  return {
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    kills: mergeKills(row.kills),
    avatarPath: row.avatar_path ? String(row.avatar_path) : null,
    role: normalizeRole(row.role),
  }
}

async function creditKillsFromLog(room, log) {
  if (!room || !Array.isArray(log) || !log.length) return
  const fighters = fighterMembers(room)
  if (!fighters.length) return
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
      if (p.faction === opp) await addKill(p.id, type)
    }
  }
}

async function applyRoomOutcomeIfNeeded(room) {
  if (!room || room.playerStatsApplied) return
  const scenarioWinner = room.battleScenarioWinnerFaction
  const surrendered = (room.battleSurrenderSeq ?? 0) > 0 && room.battleSurrenderBy
  if ((room.battleScenarioEndSeq ?? 0) > 0 && (scenarioWinner === 'rkka' || scenarioWinner === 'wehrmacht')) {
    room.playerStatsApplied = true
    const fighters = fighterMembers(room)
    for (const p of fighters) {
      if (p.faction === scenarioWinner) await addWin(p.id)
      else await addLoss(p.id)
    }
    return
  }
  if (surrendered) {
    room.playerStatsApplied = true
    const loserId = userIdFromMemberKey(room.battleSurrenderBy)
    const fighters = fighterMembers(room)
    for (const p of fighters) {
      if (p.key === room.battleSurrenderBy || p.id === loserId) await addLoss(p.id)
      else await addWin(p.id)
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
  setAvatarPath,
  setPlayerRole,
  creditKillsFromLog,
  applyRoomOutcomeIfNeeded,
  emptyKills,
}

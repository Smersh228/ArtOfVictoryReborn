const { verifyToken, pool } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')

const FACTIONS = ['none', 'rkka', 'wehrmacht']

function battleLogMeta(turnIndex, text) {
  return { phase: -1, turn: turnIndex, text, t: Date.now() }
}

function formatSubmittedOrderLine(unitInstanceId, spec) {
  const id = Number(unitInstanceId)
  const k = String(spec.orderKey || '').trim()
  const tid = spec.targetUnitInstanceId
  const cid = spec.targetCellId
  if (k === 'defend' || k === 'ambush') {
    const label = k === 'ambush' ? 'засада' : 'оборона'
    const fid = spec.defendFacingCellId
    const dr = spec.defendMaxRangeSteps
    if (fid != null && Number.isFinite(Number(fid)) && dr != null && Number.isFinite(Number(dr))) {
      return `Юнит ${id}: ${label} → напр. ${fid}, дист. ${dr}`
    }
    return fid != null && Number.isFinite(Number(fid))
      ? `Юнит ${id}: ${label} → напр. клетка ${fid}`
      : `Юнит ${id}: ${label}`
  }
  if (k === 'fire') {
    if (cid != null && Number.isFinite(Number(cid)) && (tid == null || !Number.isFinite(Number(tid)))) {
      return `Юнит ${id}: огонь по площади → кл. ${cid}`
    }
    return `Юнит ${id}: огонь → юнит ${tid}`
  }
  if (k === 'fireHard') {
    if (cid != null && Number.isFinite(Number(cid)) && (tid == null || !Number.isFinite(Number(tid)))) {
      return `Юнит ${id}: огонь на подавление по площади → кл. ${cid}`
    }
    return `Юнит ${id}: огонь на подавление → юнит ${tid}`
  }
  if (k === 'attack') return `Юнит ${id}: атака → юнит ${tid}`
  if (k === 'move') return `Юнит ${id}: походное положение → клетка ${cid}`
  if (k === 'moveWar') return `Юнит ${id}: боевое положение → клетка ${cid}`
  if (k === 'getSup') {
    const r = spec.transferAmmo
    return `Юнит ${id}: передача БК → юнит ${tid}, до ${r} шт.`
  }
  if (k === 'loading') return `Юнит ${id}: погрузка пехоты → юнит ${tid}`
  if (k === 'unloading') return `Юнит ${id}: выгрузка юнит ${tid} → клетка ${cid}`
  if (k === 'tow') return `Юнит ${id}: буксир → орудие ${tid}`
  if (k === 'clotting') return `Юнит ${id}: свёртывание (походное положение)`
  if (k === 'deploy') {
    const fid = spec.defendFacingCellId
    const dr = spec.defendMaxRangeSteps
    if (fid != null && Number.isFinite(Number(fid)) && dr != null && Number.isFinite(Number(dr))) {
      return `Юнит ${id}: развёртывание → напр. ${fid}, дист. ${dr}`
    }
    return `Юнит ${id}: развёртывание (огневая позиция)`
  }
  if (k === 'changeSector') {
    const fid = spec.defendFacingCellId
    const dr = spec.defendMaxRangeSteps
    if (fid != null && Number.isFinite(Number(fid)) && dr != null && Number.isFinite(Number(dr))) {
      return `Юнит ${id}: смена сектора → напр. ${fid}, дист. ${dr}`
    }
    return `Юнит ${id}: смена сектора обстрела`
  }
  return `Юнит ${id}: «${k || '?'}»`
}

function syncHostReady(room) {
  if (!room.hostKey) return
  const hostMem = room.members.find((m) => m.key === room.hostKey)
  if (hostMem) hostMem.ready = true
}

function ensureMemberSlots(room) {
  room.members = room.members.map((m) =>
    typeof m === 'string' ? { key: m, faction: 'none', ready: false } : { ...m },
  )
  for (const m of room.members) {
    if (!FACTIONS.includes(m.faction)) m.faction = 'none'
    if (typeof m.ready !== 'boolean') m.ready = false
  }
  if (!room.hostKey && room.members[0]) room.hostKey = room.members[0].key
  syncHostReady(room)
}

function battleMembersNeedingTurnAck(room) {
  ensureMemberSlots(room)
  return room.members.filter((m) => m.faction === 'rkka' || m.faction === 'wehrmacht')
}

function getBattlePresenceTimeoutMs() {
  const raw = process.env.BATTLE_PRESENCE_TIMEOUT_MS
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 10_000 && n <= 3_600_000) return Math.floor(n)
  }
  return 10 * 60 * 1000
}

const BATTLE_PRESENCE_TIMEOUT_MS = getBattlePresenceTimeoutMs()

function isBattleRequestTabActive(req) {
  if (!req || !req.headers) return true
  const h = req.headers['x-battle-tab-visible']
  if (h === undefined || h === null) return true
  const s = String(h).toLowerCase().trim()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function touchBattlePresenceFromPoll(room, selfKey, req) {
  if (room.battleStartedAt == null || !selfKey) return
  const mem = room.members.find((m) => m.key === selfKey)
  if (!mem) return
  if (mem.faction !== 'rkka' && mem.faction !== 'wehrmacht') return
  if (req && !isBattleRequestTabActive(req)) return
  mem.battleLastSeenAt = Date.now()
}

function initBattlePresenceForFighters(room) {
  const t = Date.now()
  for (const m of room.members) {
    if (m.faction === 'rkka' || m.faction === 'wehrmacht') m.battleLastSeenAt = t
  }
}

function maybeForfeitDisconnectedBattleFighter(room) {
  if (room.battleStartedAt == null) return
  if ((room.battleSurrenderSeq ?? 0) > 0) return
  if ((room.battleScenarioEndSeq ?? 0) > 0) return
  const fighters = room.members.filter((m) => m.faction === 'rkka' || m.faction === 'wehrmacht')
  if (fighters.length < 2) return
  const now = Date.now()
  let staleKey = null
  for (const m of fighters) {
    const last = m.battleLastSeenAt
    if (last == null) continue
    if (now - last > BATTLE_PRESENCE_TIMEOUT_MS) {
      staleKey = m.key
      break
    }
  }
  if (!staleKey) return
  if (room.battleSurrenderSeq == null) room.battleSurrenderSeq = 0
  room.battleSurrenderSeq += 1
  room.battleSurrenderBy = staleKey
  const turnIdx = room.battleTurnIndex ?? 0
  if (!Array.isArray(room.battleLog)) room.battleLog = []
  room.battleLog.push(battleLogMeta(turnIdx, 'Противник покинул поле боя — засчитана сдача.'))
  if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
}

function validateBattleStart(room) {
  ensureMemberSlots(room)
  syncHostReady(room)
  const { members, hostKey } = room
  if (members.length < 2) {
    return { ok: false, error: 'Для начала боя нужно минимум два игрока в комнате' }
  }
  for (const m of members) {
    if (m.faction === 'none') {
      return { ok: false, error: 'Все игроки должны выбрать фракцию' }
    }
    const effectiveReady = m.key === hostKey ? true : m.ready
    if (!effectiveReady) {
      return { ok: false, error: 'Все игроки должны быть готовы' }
    }
  }
  const facs = members.map((m) => m.faction)
  if (new Set(facs).size !== facs.length) {
    return { ok: false, error: 'Нельзя начать бой: совпадают фракции игроков' }
  }
  return { ok: true }
}

function roomToPublic(r) {
  return {
    id: r.id,
    name: r.name,
    map: r.map,
    mapId: r.mapId != null ? r.mapId : null,
    maxPlayers: r.maxPlayers,
    players: r.members.length,
    battleStartedAt: r.battleStartedAt != null ? r.battleStartedAt : null,
  }
}

function memberOwnsUnit(mem, unit) {
  if (!mem || !unit) return false
  if (mem.faction === 'none') return true
  const f = String(unit.faction || '').toLowerCase()
  if (mem.faction === 'rkka') return f === 'ussr' || f === 'rkka'
  if (mem.faction === 'wehrmacht') return f === 'germany' || f === 'wehrmacht'
  return false
}

function normalizeSubmittedOrderKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return s
  const compact = s.replace(/_/g, '').toLowerCase()
  if (compact === 'changesector') return 'changeSector'
  return s
}

const SUBMITTABLE_ORDER_KEYS = new Set([
  'defend',
  'ambush',
  'fire',
  'fireHard',
  'attack',
  'move',
  'moveWar',
  'getSup',
  'loading',
  'unloading',
  'tow',
  'clotting',
  'deploy',
  'changeSector',
])

async function resolveMemberLabels(keys) {
  const userIds = []
  for (const k of keys) {
    if (k.startsWith('u:')) {
      const id = Number(k.slice(2))
      if (Number.isFinite(id)) userIds.push(id)
    }
  }
  const idToName = new Map()
  if (userIds.length > 0) {
    let client
    try {
      client = await pool.connect()
      const result = await client.query('SELECT id, username FROM users WHERE id = ANY($1::int[])', [userIds])
      for (const row of result.rows) idToName.set(row.id, row.username)
    } catch (err) {
      console.error('rooms resolveMemberLabels:', err.message)
    } finally {
      if (client) client.release()
    }
  }
  let guestN = 0
  return keys.map((k) => {
    if (k.startsWith('u:')) {
      const id = Number(k.slice(2))
      return idToName.get(id) || `Игрок #${id}`
    }
    guestN += 1
    return `Гость ${guestN}`
  })
}

async function memberKeyFromRequest(req) {
  const token = getTokenFromRequest(req)
  if (token) {
    const user = await verifyToken(token)
    if (user) return `u:${user.id}`
  }
  const cid = req.headers['x-client-id']
  if (typeof cid === 'string' && cid.trim().length >= 8) return `c:${cid.trim().slice(0, 64)}`
  return null
}

async function memberKeyForRoom(req, room) {
  if (!room) return memberKeyFromRequest(req)
  ensureMemberSlots(room)
  const token = getTokenFromRequest(req)
  let uKey = null
  if (token) {
    const user = await verifyToken(token)
    if (user) uKey = `u:${user.id}`
  }
  const raw = req.headers['x-client-id']
  const cKey =
    typeof raw === 'string' && raw.trim().length >= 8 ? `c:${raw.trim().slice(0, 64)}` : null
  const keys = new Set(room.members.map((m) => m.key))
  if (uKey && keys.has(uKey)) return uKey
  if (cKey && keys.has(cKey)) return cKey
  return uKey || cKey
}

async function roomDetailPayload(room, selfKey) {
  ensureMemberSlots(room)
  const needAck = battleMembersNeedingTurnAck(room)
  const ackCount = room.battleTurnAck && typeof room.battleTurnAck.size === 'number' ? room.battleTurnAck.size : 0
  const labels = await resolveMemberLabels(room.members.map((m) => m.key))
  const hk = room.hostKey
  const members = room.members.map((m, i) => ({
    key: m.key,
    label: labels[i],
    faction: m.faction,
    ready: m.key === hk ? true : m.ready,
    isYou: Boolean(selfKey && m.key === selfKey),
    isHost: m.key === hk,
  }))
  return {
    room: roomToPublic(room),
    members,
    youAreHost: Boolean(selfKey && selfKey === hk),
    battleStartedAt: room.battleStartedAt,
    battleSurrenderSeq: room.battleSurrenderSeq ?? 0,
    battleSurrenderBy: room.battleSurrenderBy ?? null,
    battleScenarioEndSeq: room.battleScenarioEndSeq ?? 0,
    battleScenarioWinnerFaction: room.battleScenarioWinnerFaction ?? null,
    battleScenarioReason: room.battleScenarioReason ?? null,
    battleTurnIndex: room.battleTurnIndex ?? 0,
    battleFieldRevision: room.battleFieldRevision ?? 0,
    battleTurnAckCount: ackCount,
    battleTurnAckNeed: needAck.length,
    battleCells: room.battleStartedAt != null && Array.isArray(room.battleCells) ? room.battleCells : undefined,
    battleLog: room.battleStartedAt != null && Array.isArray(room.battleLog) ? room.battleLog.slice(-120) : undefined,
  }
}

async function sendRoomDetailOr500(res, room, selfKey) {
  try {
    res.json(await roomDetailPayload(room, selfKey))
  } catch (err) {
    console.error('rooms roomDetailPayload:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Не удалось сформировать состояние комнаты' })
    }
  }
}

module.exports = {
  battleLogMeta,
  formatSubmittedOrderLine,
  battleMembersNeedingTurnAck,
  BATTLE_PRESENCE_TIMEOUT_MS,
  touchBattlePresenceFromPoll,
  initBattlePresenceForFighters,
  maybeForfeitDisconnectedBattleFighter,
  ensureMemberSlots,
  validateBattleStart,
  roomToPublic,
  memberOwnsUnit,
  normalizeSubmittedOrderKey,
  SUBMITTABLE_ORDER_KEYS,
  memberKeyFromRequest,
  memberKeyForRoom,
  roomDetailPayload,
  sendRoomDetailOr500,
}

const { verifyToken, pool } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')
const { applyRoomOutcomeIfNeeded } = require('../../playerStats')
const { isMuted } = require('../../playerModeration')

const ROOM_CHAT_MAX = 80
const ROOM_CHAT_MAX_TEXT = 240
const ROOM_CHAT_COOLDOWN_MS = 1500

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
    const adj = spec.useFireAdjustment ? ', корректировка огня' : ''
    if (cid != null && Number.isFinite(Number(cid)) && (tid == null || !Number.isFinite(Number(tid)))) {
      return `Юнит ${id}: огонь по площади → кл. ${cid}${adj}`
    }
    return `Юнит ${id}: огонь → юнит ${tid}${adj}`
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
    return `Юнит ${id}: загрузка припасов (передача БК) → юнит ${tid}, до ${r} шт.`
  }
  if (k === 'loadingSup') {
    const r = spec.transferAmmo
    return `Юнит ${id}: загрузка припасов со склада → кл. ${cid}, до ${r} шт.`
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
  const AIR_HEX_LOG_KEYS = new Set([
    'intelligenceAir',
    'airSupply',
    'accompaniment',
    'attackAir',
    'bombardment',
    'desant',
    'interception',
    'patrol',
  ])
  if (AIR_HEX_LOG_KEYS.has(k)) {
    const fp = spec.flightPathCellIds
    const pathSuffix =
      Array.isArray(fp) && fp.length ? `; траектория: ${fp.join(' → ')}` : ''
    return `Юнит ${id}: «${k}» → клетка ${cid}${pathSuffix}`
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
  void applyRoomOutcomeIfNeeded(room).catch((e) => console.error('player outcome:', e.message))
}

function validateBattleStart(room) {
  ensureMemberSlots(room)
  syncHostReady(room)
  const { members, hostKey } = room
  const cap = room.maxPlayers === 4 || room.maxPlayers === 6 ? room.maxPlayers : 2
  const perTeam = cap / 2
  if (members.length !== cap) {
    return { ok: false, error: `Для начала боя нужно ${cap} игроков` }
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
  const rkka = members.filter((m) => m.faction === 'rkka').length
  const wehr = members.filter((m) => m.faction === 'wehrmacht').length
  if (rkka !== perTeam || wehr !== perTeam) {
    return { ok: false, error: `Нужно по ${perTeam} игрока на команду` }
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
  const unitTeam = Number(unit.team)
  const memTeam = Number(mem.team)
  if (Number.isFinite(unitTeam) && unitTeam > 0 && Number.isFinite(memTeam) && memTeam > 0) {
    return unitTeam === memTeam
  }
  const f = String(unit.faction || '').toLowerCase()
  if (mem.faction === 'rkka') return f === 'ussr' || f === 'rkka'
  if (mem.faction === 'wehrmacht') return f === 'germany' || f === 'wehrmacht'
  return false
}

function assignMemberTeam(room, mem, faction) {
  const cap = room.maxPlayers === 4 || room.maxPlayers === 6 ? room.maxPlayers : 2
  const slots = []
  for (let t = 1; t <= cap; t++) {
    if (faction === 'rkka' && t % 2 === 1) slots.push(t)
    if (faction === 'wehrmacht' && t % 2 === 0) slots.push(t)
  }
  const taken = new Set(
    (room.members || [])
      .filter((m) => m.key !== mem.key && m.faction === faction)
      .map((m) => Number(m.team))
      .filter((n) => Number.isFinite(n) && n > 0),
  )
  mem.team = slots.find((t) => !taken.has(t)) || slots[0] || null
  if (faction === 'none') mem.team = null
}

function normalizeSubmittedOrderKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return s
  const compact = s.replace(/[_\-\s]/g, '').toLowerCase()
  if (compact === 'changesector') return 'changeSector'
  if (compact === 'enterdot' || compact === 'занятьдот') return 'enterDot'
  if (compact === 'exitdot' || compact === 'покинутьдот' || compact === 'выйтидот') return 'exitDot'
  if (compact === 'firehard') return 'fireHard'
  if (compact === 'movewar') return 'moveWar'
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
  'loadingSup',
  'loading',
  'unloading',
  'tow',
  'clotting',
  'deploy',
  'changeSector',
  'accompaniment',
  'airSupply',
  'attackAir',
  'bombardment',
  'desant',
  'intelligenceAir',
  'interception',
  'patrol',
  'airRecall',
  'hardMove',
  'explomost',
  'fireMove',
  'razvedka',
  'svzy',
  'buildPonton',
  'cutEj',
  'cutWire',
  'enterDot',
  'exitDot',
  'demining',
  'mining',
  'trenches',
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

function sanitizeRoomChatText(raw) {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > ROOM_CHAT_MAX_TEXT ? text.slice(0, ROOM_CHAT_MAX_TEXT) : text
}

function ensureRoomChat(room) {
  if (!room.lobbyChat || typeof room.lobbyChat !== 'object') {
    room.lobbyChat = { nextId: 1, messages: [], lastAt: new Map() }
  }
  if (!Array.isArray(room.lobbyChat.messages)) room.lobbyChat.messages = []
  if (!(room.lobbyChat.lastAt instanceof Map)) room.lobbyChat.lastAt = new Map()
  if (!Number.isFinite(Number(room.lobbyChat.nextId)) || Number(room.lobbyChat.nextId) < 1) {
    room.lobbyChat.nextId = 1
  }
}

function memberChatTeam(mem) {
  if (!mem) return null
  if (mem.faction === 'rkka' || mem.faction === 'wehrmacht') return mem.faction
  return null
}

function isBattleSpectator(room, selfMem) {
  if (!selfMem) return Boolean(room && room.battleStartedAt != null)
  if (room.battleStartedAt == null) return false
  return selfMem.faction !== 'rkka' && selfMem.faction !== 'wehrmacht'
}

function publicRoomChat(room, selfMem) {
  ensureRoomChat(room)
  const spectator = isBattleSpectator(room, selfMem)
  const selfTeam = memberChatTeam(selfMem)
  return room.lobbyChat.messages
    .filter((m) => {
      const channel = m.channel === 'team' ? 'team' : 'all'
      if (channel === 'all') return true
      if (spectator) return true
      return Boolean(selfTeam && m.teamKey === selfTeam)
    })
    .slice(-ROOM_CHAT_MAX)
    .map((m) => ({
      id: Number(m.id),
      userId: Number(m.userId) || 0,
      username: String(m.username || 'Игрок'),
      text: String(m.text || ''),
      ts: Number(m.ts) || Date.now(),
      channel: m.channel === 'team' ? 'team' : 'all',
      teamKey: m.channel === 'team' && (m.teamKey === 'rkka' || m.teamKey === 'wehrmacht') ? m.teamKey : null,
    }))
}

async function addRoomChatMessage(room, mem, memKey, rawText, rawChannel) {
  ensureRoomChat(room)
  const text = sanitizeRoomChatText(rawText)
  if (!text) return { ok: false, error: 'Пустое сообщение' }
  if (isBattleSpectator(room, mem)) {
    return { ok: false, error: 'Наблюдатель не может писать в чат' }
  }
  const channel = rawChannel === 'team' ? 'team' : 'all'
  const teamKey = memberChatTeam(mem)
  if (channel === 'team' && !teamKey) {
    return { ok: false, error: 'Сначала выберите фракцию' }
  }
  const userId = String(memKey || '').startsWith('u:') ? Number(String(memKey).slice(2)) : 0
  if (userId > 0 && isMuted(userId)) {
    return { ok: false, error: 'Вы получили системный мут' }
  }
  const now = Date.now()
  const prev = Number(room.lobbyChat.lastAt.get(memKey) || 0)
  if (now - prev < ROOM_CHAT_COOLDOWN_MS) {
    return { ok: false, error: 'Подождите секунду' }
  }
  const labels = await resolveMemberLabels([memKey])
  const username = labels[0] || 'Игрок'
  room.lobbyChat.lastAt.set(memKey, now)
  const msg = {
    id: room.lobbyChat.nextId++,
    userId: Number.isFinite(userId) ? userId : 0,
    username,
    text,
    ts: now,
    channel,
    teamKey: channel === 'team' ? teamKey : null,
  }
  room.lobbyChat.messages.push(msg)
  if (room.lobbyChat.messages.length > ROOM_CHAT_MAX) {
    room.lobbyChat.messages.splice(0, room.lobbyChat.messages.length - ROOM_CHAT_MAX)
  }
  return { ok: true, message: msg }
}

async function roomDetailPayload(room, selfKey) {
  ensureMemberSlots(room)
  const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
  return withBattleEnv(room, async () => {
  const needAck = battleMembersNeedingTurnAck(room)
  const ackCount = room.battleTurnAck && typeof room.battleTurnAck.size === 'number' ? room.battleTurnAck.size : 0
  const labels = await resolveMemberLabels(room.members.map((m) => m.key))
  const hk = room.hostKey
  const members = room.members.map((m, i) => ({
    key: m.key,
    label: labels[i],
    faction: m.faction,
    team: Number.isFinite(Number(m.team)) && Number(m.team) > 0 ? Number(m.team) : null,
    ready: m.key === hk ? true : m.ready,
    isYou: Boolean(selfKey && m.key === selfKey),
    isHost: m.key === hk,
  }))
  if (
    room.battleStartedAt != null &&
    Array.isArray(room.battleCells) &&
    (!room.battleReconByFaction || typeof room.battleReconByFaction !== 'object')
  ) {
    const { syncBattleReconByFaction } = require('../../game/lib/recon/battleReconResolve')
    syncBattleReconByFaction(room, room.battleCells)
  }
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
    battleReconByFaction:
      room.battleStartedAt != null && room.battleReconByFaction && typeof room.battleReconByFaction === 'object'
        ? room.battleReconByFaction
        : undefined,
    battleLog: room.battleStartedAt != null && Array.isArray(room.battleLog) ? room.battleLog.slice(-120) : undefined,
    lobbyChat: publicRoomChat(
      room,
      room.members.find((m) => selfKey && m.key === selfKey) || null,
    ),
    battleEnvironment:
      room.battleStartedAt != null
        ? require('../../game/lib/scenario/battleEnvironment').publicSnapshot(room)
        : undefined,
  }
  })
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
  assignMemberTeam,
  normalizeSubmittedOrderKey,
  SUBMITTABLE_ORDER_KEYS,
  memberKeyFromRequest,
  memberKeyForRoom,
  roomDetailPayload,
  sendRoomDetailOr500,
  addRoomChatMessage,
}

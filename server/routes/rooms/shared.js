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
    const reactive = spec.useReactiveFire ? ', реактивный' : ''
    if (cid != null && Number.isFinite(Number(cid)) && (tid == null || !Number.isFinite(Number(tid)))) {
      return `Юнит ${id}: огонь по площади → кл. ${cid}${adj}${reactive}`
    }
    return `Юнит ${id}: огонь → юнит ${tid}${adj}${reactive}`
  }
  if (k === 'fireHard') {
    const reactiveH = spec.useReactiveFire ? ', реактивный' : ''
    if (cid != null && Number.isFinite(Number(cid)) && (tid == null || !Number.isFinite(Number(tid)))) {
      return `Юнит ${id}: огонь на подавление по площади → кл. ${cid}${reactiveH}`
    }
    return `Юнит ${id}: огонь на подавление → юнит ${tid}${reactiveH}`
  }
  if (k === 'attack' || k === 'hardMove') return `Юнит ${id}: ${k === 'hardMove' ? 'мощная атака' : 'атака'} → юнит ${tid}`
  if (k === 'fireMove') return `Юнит ${id}: стрельба в движении → юнит ${tid}, кл. ${cid}`
  if (k === 'medical') {
    return tid != null && Number.isFinite(Number(tid))
      ? `Юнит ${id}: лечение → юнит ${tid}`
      : `Юнит ${id}: лечение`
  }
  if (k === 'fireAdjustment') {
    return tid != null && Number.isFinite(Number(tid))
      ? `Юнит ${id}: корректировка огня артиллерии → юнит ${tid}`
      : `Юнит ${id}: корректировка огня артиллерии`
  }
  if (k === 'move') return `Юнит ${id}: походное положение → клетка ${cid}`
  if (k === 'moveWar') return `Юнит ${id}: боевое положение → клетка ${cid}`
  if (k === 'getSup') {
    const parts = []
    const a = Math.floor(Number(spec.transferAmmo))
    const m = Math.floor(Number(spec.transferMines))
    const e = Math.floor(Number(spec.transferExplosives))
    const s = Math.floor(Number(spec.transferSmoke))
    if (Number.isFinite(a) && a > 0) parts.push(`${a} БК`)
    if (Number.isFinite(m) && m > 0) parts.push(`${m} мин`)
    if (Number.isFinite(e) && e > 0) parts.push(`${e} взр.`)
    if (Number.isFinite(s) && s > 0) parts.push(`${s} дым`)
    const r = parts.length ? parts.join(', ') : 'припасы'
    return `Юнит ${id}: загрузка припасов (передача) → юнит ${tid}, ${r}`
  }
  if (k === 'loadingSup') {
    const parts = []
    const a = Math.floor(Number(spec.transferAmmo))
    const m = Math.floor(Number(spec.transferMines))
    const e = Math.floor(Number(spec.transferExplosives))
    const s = Math.floor(Number(spec.transferSmoke))
    if (Number.isFinite(a) && a > 0) parts.push(`${a} БК`)
    if (Number.isFinite(m) && m > 0) parts.push(`${m} мин`)
    if (Number.isFinite(e) && e > 0) parts.push(`${e} взр.`)
    if (Number.isFinite(s) && s > 0) parts.push(`${s} дым`)
    const r = parts.length ? parts.join(', ') : 'припасы'
    return `Юнит ${id}: загрузка припасов со склада → кл. ${cid}, ${r}`
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
  if (k === 'razvedka') {
    const r = spec.reconRangeSteps
    return Number.isFinite(Number(r))
      ? `Юнит ${id}: разведка, радиус ${r}`
      : `Юнит ${id}: разведка`
  }
  if (k === 'svzy') {
    const r = spec.reconRangeSteps
    return Number.isFinite(Number(r))
      ? `Юнит ${id}: радиоперехват, зона ${r}`
      : `Юнит ${id}: радиоперехват`
  }
  if (k === 'cutWire') return `Юнит ${id}: снятие проволоки → клетка ${cid}`
  if (k === 'explomost' || k === 'demolition') return `Юнит ${id}: подрыв сооружения → клетка ${cid}`
  if (k === 'repairRailway') return `Юнит ${id}: ремонт ЖД`
  if (k === 'arson') return `Юнит ${id}: поджог`
  if (k === 'mining') {
    const kind = spec.mineKind === 'tank' ? 'танковая' : 'пехотная'
    return `Юнит ${id}: минирование (${kind})`
  }
  if (k === 'trenches') {
    const ed = spec.trenchEdgeDir
    return `Юнит ${id}: окопаться → клетка ${cid}, сторона ${ed}`
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
    if (String(m.key || '').startsWith('bot:')) m.isBot = true
    if (m.isBot) m.ready = true
  }
  if (!room.hostKey && room.members[0]) room.hostKey = room.members[0].key
  syncHostReady(room)
}

function battleMembersNeedingTurnAck(room) {
  ensureMemberSlots(room)
  return room.members.filter((m) => m.faction === 'rkka' || m.faction === 'wehrmacht')
}

function battleTurnAckSet(room) {
  if (room.battleTurnAck && typeof room.battleTurnAck.has === 'function') return room.battleTurnAck
  return new Set()
}

function publicBattleTurnMembers(needAck, ackSet, labels, selfKey) {
  return (needAck || []).map((m, i) => ({
    key: m.key,
    label: labels[i] || 'Игрок',
    faction: m.faction,
    team: Number.isFinite(Number(m.team)) && Number(m.team) > 0 ? Number(m.team) : null,
    isYou: Boolean(selfKey && m.key === selfKey),
    isBot: Boolean(m.isBot || String(m.key || '').startsWith('bot:')),
    ready: ackSet.has(m.key),
  }))
}

function publicHqRewritePayload(room, selfKey) {
  const s = room.battleHqRewriteSession
  if (!s || s.turn !== (room.battleTurnIndex ?? 0)) return null
  const mem = (room.members || []).find((m) => selfKey && m.key === selfKey) || null
  const fac = mem && mem.faction
  const info = fac && s.byFaction ? s.byFaction[fac] : null
  const youNeed = Boolean(selfKey && Array.isArray(s.needKeys) && s.needKeys.includes(selfKey))
  const acked = Boolean(selfKey && s.ack && typeof s.ack.has === 'function' && s.ack.has(selfKey))
  const youCanRewrite = Boolean(youNeed && !acked && info && Number(info.rewriteMax) > 0)
  const draft =
    youCanRewrite && s.originalDrafts && s.originalDrafts[selfKey]
      ? s.originalDrafts[selfKey].orders
      : undefined
  return {
    pending: true,
    seq: room.battleHqRewriteSeq || 0,
    youCanRewrite,
    rewriteMax: youCanRewrite ? Number(info.rewriteMax) : 0,
    revealedOrders: youCanRewrite ? info.revealed || [] : [],
    yourDraftOrders: youCanRewrite ? draft : undefined,
    hqUnitInstanceId: youCanRewrite ? info.hqUnitInstanceId : undefined,
    hqRoll: youCanRewrite ? info.hqRoll : undefined,
  }
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
const LOBBY_PRESENCE_TIMEOUT_MS = 3 * 60 * 1000

function isBotMem(m) {
  return Boolean(m && (m.isBot || String(m.key || '').startsWith('bot:')))
}

function touchLobbyPresenceFromPoll(room, selfKey) {
  if (!room || room.battleStartedAt != null || !selfKey) return
  const mem = (room.members || []).find((m) => m.key === selfKey)
  if (!mem || isBotMem(mem)) return
  mem.lobbyLastSeenAt = Date.now()
}

function dropWaitingLobbyMember(room, key) {
  const { rooms } = require('./state')
  if (!room || room.battleStartedAt != null) return 'skip'
  if (!rooms.has(room.id)) return 'closed'
  if (key === room.hostKey) {
    rooms.delete(room.id)
    return 'closed'
  }
  room.members = (room.members || []).filter((m) => m.key !== key)
  const humans = room.members.filter((m) => !isBotMem(m))
  if (humans.length === 0) {
    rooms.delete(room.id)
    return 'closed'
  }
  return 'left'
}

function sweepStaleLobbyMembers(room) {
  if (!room || room.battleStartedAt != null) return
  const now = Date.now()
  const stale = []
  for (const m of room.members || []) {
    if (isBotMem(m)) continue
    const last = Number(m.lobbyLastSeenAt) || Number(room.createdAt) || 0
    if (!last || now - last > LOBBY_PRESENCE_TIMEOUT_MS) stale.push(m.key)
  }
  if (!stale.length) return
  if (stale.includes(room.hostKey)) {
    dropWaitingLobbyMember(room, room.hostKey)
    return
  }
  for (const key of stale) dropWaitingLobbyMember(room, key)
}

function sweepAllWaitingLobbies() {
  const { rooms } = require('./state')
  for (const room of Array.from(rooms.values())) {
    sweepStaleLobbyMembers(room)
  }
}

const SOLO_BATTLE_PRESENCE_TIMEOUT_MS = 2 * 60 * 1000

function closeHostSoloRooms(hostKey, exceptId) {
  if (!hostKey) return
  const { rooms } = require('./state')
  for (const room of Array.from(rooms.values())) {
    if (!room.solo) continue
    if (exceptId != null && Number(room.id) === Number(exceptId)) continue
    if (room.hostKey === hostKey) rooms.delete(room.id)
  }
}

function closeAbandonedSoloRoom(room) {
  if (!room || !room.solo) return false
  const { rooms } = require('./state')
  const humans = (room.members || []).filter((m) => !isBotMem(m))
  if (!humans.length) {
    rooms.delete(room.id)
    return true
  }
  if (room.battleStartedAt == null) return false
  const now = Date.now()
  for (const m of humans) {
    const last = Number(m.battleLastSeenAt) || Number(room.createdAt) || 0
    if (now - last <= SOLO_BATTLE_PRESENCE_TIMEOUT_MS) return false
  }
  rooms.delete(room.id)
  return true
}

function sweepAbandonedBattles() {
  const { rooms } = require('./state')
  for (const room of Array.from(rooms.values())) {
    if (closeAbandonedSoloRoom(room)) continue
    maybeForfeitDisconnectedBattleFighter(room)
  }
}

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
  if (req && !isBattleRequestTabActive(req) && !room.solo) return
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
  const humans = []
  let botFighters = 0
  for (const m of room.members || []) {
    if (m.faction !== 'rkka' && m.faction !== 'wehrmacht') continue
    if (m.isBot || String(m.key || '').startsWith('bot:')) {
      botFighters += 1
      continue
    }
    humans.push(m)
  }
  if (!humans.length) return
  if (humans.length + botFighters < 2) return
  const now = Date.now()
  let staleKey = null
  for (const m of humans) {
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
    solo: Boolean(r.solo),
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
      .filter((m) => m.key !== mem.key)
      .map((m) => Number(m.team))
      .filter((n) => Number.isFinite(n) && n > 0),
  )
  mem.team = slots.find((t) => !taken.has(t)) || null
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
  'medical',
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
  'smoke',
  'railLoading',
  'railUnloading',
  'repairRailway',
  'arson',
  'fireAdjustment',
  'demolition',
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
    if (String(k || '').startsWith('bot:')) {
      const team = Number(String(k).slice(4))
      return Number.isFinite(team) && team > 0 ? `Бот ${team}` : 'Бот'
    }
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
  const now = Date.now()
  const prev = Number(room.lobbyChat.lastAt.get(memKey) || 0)
  if (now - prev < ROOM_CHAT_COOLDOWN_MS) {
    return { ok: false, error: 'Подождите секунду' }
  }
  const labels = await resolveMemberLabels([memKey])
  const username = labels[0] || 'Игрок'
  if (userId > 0 && isMuted(userId, username)) {
    return { ok: false, error: 'Вы получили системный мут' }
  }
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

async function roomDetailPayload(room, selfKey, opts) {
  ensureMemberSlots(room)
  const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
  return withBattleEnv(room, async () => {
  const needAck = battleMembersNeedingTurnAck(room)
  const ackSet = battleTurnAckSet(room)
  const ackCount = ackSet.size
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
    isBot: Boolean(m.isBot || String(m.key || '').startsWith('bot:')),
  }))
  const battleTurnMembers = publicBattleTurnMembers(needAck, ackSet, needAck.map((m) => {
    const i = room.members.findIndex((x) => x.key === m.key)
    return i >= 0 ? labels[i] : 'Игрок'
  }), selfKey)
  if (
    room.battleStartedAt != null &&
    Array.isArray(room.battleCells) &&
    (!room.battleReconByFaction || typeof room.battleReconByFaction !== 'object')
  ) {
    const { syncBattleReconByFaction } = require('../../game/lib/recon/battleReconResolve')
    syncBattleReconByFaction(room, room.battleCells)
  }
  const selfMem = room.members.find((m) => selfKey && m.key === selfKey) || null
  const omitBattleCells = Boolean(opts && opts.omitBattleCells)
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
    battleTurnYouReady: Boolean(selfKey && ackSet.has(selfKey)),
    battleTurnMembers,
    battleCellsUnchanged: omitBattleCells || undefined,
    battleCells:
      omitBattleCells
        ? undefined
        : room.battleStartedAt != null && Array.isArray(room.battleCells)
          ? require('../../game/lib/map/battleMines').maskUnrevealedMines(
              room.battleCells,
              selfMem && selfMem.faction,
            )
          : undefined,
    battleReconByFaction:
      omitBattleCells
        ? undefined
        : room.battleStartedAt != null && room.battleReconByFaction && typeof room.battleReconByFaction === 'object'
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
    battleHqRewrite: publicHqRewritePayload(room, selfKey),
    battleDeploy: require('../../game/lib/map/battleDeployPhase').publicBattleDeploy(room, selfKey),
    battleTurnBusy: Boolean(room.battleTurnBusy),
  }
  })
}

async function sendRoomDetailOr500(res, room, selfKey, req) {
  try {
    if (room.battleTurnBusy) {
      res.json(await roomDetailPayload(room, selfKey, { omitBattleCells: true }))
      return
    }
    if (room.battleStartedAt != null && Array.isArray(room.battleCells) && !room.battleHexCatalogSynced) {
      try {
        const { pool } = require('../../db')
        const { enrichBattleHexExtras } = require('../../game/lib/support/battleEnrich')
        await enrichBattleHexExtras(pool, room.battleCells)
        room.battleHexCatalogSynced = true
      } catch (e) {
        console.error('enrichBattleHexExtras on detail:', e.message)
      }
    }
    const knownRev = Number(req && (req.query && req.query.fieldRev))
    const curRev = room.battleFieldRevision ?? 0
    const omitBattleCells =
      room.battleStartedAt != null && Number.isFinite(knownRev) && knownRev === curRev
    res.json(await roomDetailPayload(room, selfKey, { omitBattleCells }))
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
  battleTurnAckSet,
  publicBattleTurnMembers,
  publicHqRewritePayload,
  BATTLE_PRESENCE_TIMEOUT_MS,
  touchBattlePresenceFromPoll,
  initBattlePresenceForFighters,
  maybeForfeitDisconnectedBattleFighter,
  touchLobbyPresenceFromPoll,
  dropWaitingLobbyMember,
  sweepStaleLobbyMembers,
  sweepAllWaitingLobbies,
  closeHostSoloRooms,
  sweepAbandonedBattles,
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

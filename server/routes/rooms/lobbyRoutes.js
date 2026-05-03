const express = require('express')
const { verifyToken, pool } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')
const { enrichBattleCells, loadBattleCellsFromMapId, loadBattleMapConditionsFromMapId } = require('../../game/lib/support/battleEnrich')
const { isMapAdminUser } = require('../../mapsPolicy')
const {
  ensureMemberSlots,
  validateBattleStart,
  roomToPublic,
  memberKeyFromRequest,
  memberKeyForRoom,
  sendRoomDetailOr500,
  maybeForfeitDisconnectedBattleFighter,
  touchBattlePresenceFromPoll,
  initBattlePresenceForFighters,
} = require('./shared')
const { rooms, allocRoomId } = require('./state')

const FACTIONS = ['none', 'rkka', 'wehrmacht']

function registerLobbyRoutes(router) {
  router.get('/', (_req, res) => {
    const list = Array.from(rooms.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(roomToPublic)
    res.json({ rooms: list })
  })

  router.get('/:id/lobby-map', async (req, res) => {
    const roomId = Number(req.params.id)
    if (!Number.isFinite(roomId)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(roomId)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    try {
      ensureMemberSlots(room)
      const key = await memberKeyForRoom(req, room)
      if (!key || !room.members.some((m) => m.key === key)) {
        return res.status(403).json({ error: 'Вы не в этой комнате' })
      }
      const mid = room.mapId != null ? Number(room.mapId) : NaN
      if (!Number.isFinite(mid)) {
        return res.json({ map: null })
      }
      const r = await pool.query(
        `SELECT sm.id_map, sm.name, sm.payload, sm.updated_at
         FROM saved_map sm WHERE sm.id_map = $1`,
        [mid],
      )
      const row = r.rows[0]
      if (!row) return res.status(404).json({ error: 'Карта не найдена в базе' })
      res.json({
        map: {
          id: row.id_map,
          name: row.name,
          payload: row.payload,
          updatedAt: row.updated_at,
        },
      })
    } catch (err) {
      console.error('GET /api/rooms/:id/lobby-map', err)
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
    }
  })

  router.get('/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    try {
      ensureMemberSlots(room)
      maybeForfeitDisconnectedBattleFighter(room)
      const selfKey = await memberKeyForRoom(req, room)
      touchBattlePresenceFromPoll(room, selfKey, req)
      await sendRoomDetailOr500(res, room, selfKey)
    } catch (err) {
      console.error('GET /api/rooms/:id', err)
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
    }
  })

  router.post('/', express.json(), async (req, res) => {
    const key = await memberKeyFromRequest(req)
    if (!key) {
      return res.status(401).json({ error: 'Войдите в аккаунт или передайте заголовок X-Client-Id (uuid из localStorage)' })
    }
    const { name, maxPlayers, map, mapId } = req.body || {}
    const n = String(name || '').trim() || 'Комната'
    const mp = Math.min(8, Math.max(2, Number(maxPlayers) || 2))

    let mapLabel = String(map || '').trim()
    let resolvedMapId = null
    const mid = mapId != null ? Number(mapId) : NaN
    if (Number.isFinite(mid)) {
      const token = getTokenFromRequest(req)
      const jwtUser = token ? await verifyToken(token) : null
      const ownerId = jwtUser ? jwtUser.id : null
      if (!ownerId) {
        return res.status(403).json({
          error: 'Войдите в аккаунт, чтобы создать комнату с сохранённой картой',
        })
      }
      try {
        const row = await pool.query(
          `SELECT sm.name, sm.owner_user_id, u.username AS owner_username
           FROM saved_map sm
           LEFT JOIN users u ON u.id = sm.owner_user_id
           WHERE sm.id_map = $1`,
          [mid],
        )
        if (!row.rows[0]) {
          return res.status(400).json({ error: 'Карта не найдена' })
        }
        const o = row.rows[0].owner_user_id
        const ownerName = row.rows[0].owner_username
        if (o == null) {
          return res.status(403).json({ error: 'Карта не привязана к владельцу в БД' })
        }
        const officialMap = isMapAdminUser({ username: ownerName })
        const ownMap = Number(o) === Number(ownerId)
        const hostIsMapAdmin = isMapAdminUser(jwtUser)
        if (!ownMap && !officialMap && !hostIsMapAdmin) {
          return res.status(403).json({
            error:
              'Можно создать лобби только со своей картой или с официальной картой (автор mstislaw)',
          })
        }
        resolvedMapId = mid
        mapLabel = String(row.rows[0].name || '').trim() || mapLabel
      } catch (err) {
        console.error('rooms mapId lookup:', err.message)
        return res.status(500).json({ error: 'Не удалось проверить карту' })
      }
    }
    if (!mapLabel) mapLabel = 'Карта'

    const id = allocRoomId()
    const room = {
      id,
      name: n,
      map: mapLabel,
      mapId: resolvedMapId,
      maxPlayers: mp,
      hostKey: key,
      battleStartedAt: null,
      battleSurrenderSeq: 0,
      battleSurrenderBy: null,
      battleScenarioEndSeq: 0,
      battleScenarioWinnerFaction: null,
      battleScenarioReason: null,
      battleMapConditions: null,
      battleCaptureHoldStreak: 0,
      battleTurnIndex: 0,
      battleTurnAck: new Set(),
      battleCells: null,
      battleFieldRevision: 0,
      battleLog: [],
      battleOrdersDraft: {},
      members: [{ key, faction: 'none', ready: true }],
      createdAt: Date.now(),
    }
    rooms.set(id, room)
    res.status(201).json({ room: roomToPublic(room) })
  })

  router.post('/:id/join', async (req, res) => {
    const id = Number(req.params.id)
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    if (room.battleStartedAt != null) {
      return res.status(403).json({ error: 'Бой уже начат: вход как игрок недоступен' })
    }
    const key = await memberKeyForRoom(req, room)
    if (!key) {
      return res.status(401).json({ error: 'Войдите в аккаунт или передайте заголовок X-Client-Id' })
    }
    if (room.members.some((m) => m.key === key)) {
      return res.json({ room: roomToPublic(room), alreadyMember: true })
    }
    if (room.members.length >= room.maxPlayers) {
      return res.status(403).json({ error: 'Комната заполнена' })
    }
    room.members.push({ key, faction: 'none', ready: false })
    res.json({ room: roomToPublic(room) })
  })

  router.post('/:id/spectate', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    if (room.battleStartedAt == null) {
      return res.status(400).json({ error: 'Наблюдение доступно только во время боя' })
    }
    const key = await memberKeyFromRequest(req)
    if (!key) {
      return res.status(401).json({ error: 'Войдите в аккаунт или передайте заголовок X-Client-Id' })
    }
    return res.json({ room: roomToPublic(room), spectator: true })
  })

  router.post('/:id/me', express.json(), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })

    const { faction, ready, toggleFaction, toggleReady } = req.body || {}
    if (toggleFaction) {
      const i = FACTIONS.indexOf(mem.faction)
      mem.faction = FACTIONS[(i + 1) % FACTIONS.length]
    } else if (faction !== undefined) {
      if (!FACTIONS.includes(faction)) return res.status(400).json({ error: 'Неверная фракция' })
      mem.faction = faction
    }
    const isHost = key === room.hostKey
    if (!isHost && toggleReady) {
      mem.ready = !mem.ready
    } else if (!isHost && ready !== undefined) {
      mem.ready = Boolean(ready)
    }
    ensureMemberSlots(room)
    await sendRoomDetailOr500(res, room, key)
  })

  router.post('/:id/start-battle', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    if (key !== room.hostKey) {
      return res.status(403).json({ error: 'Только создатель комнаты может начать бой' })
    }
    if (room.battleStartedAt != null) {
      return await sendRoomDetailOr500(res, room, key)
    }
    const check = validateBattleStart(room)
    if (!check.ok) {
      return res.status(400).json({ error: check.error })
    }
    let cells = null
    let mapConditions = null
    if (room.mapId != null) {
      cells = await loadBattleCellsFromMapId(pool, room.mapId)
      if (cells && cells.length) {
        try {
          await enrichBattleCells(pool, cells)
        } catch (e) {
          console.error('start-battle enrich:', e.message)
        }
      }
      try {
        mapConditions = await loadBattleMapConditionsFromMapId(pool, room.mapId)
      } catch (e) {
        console.error('start-battle conditions:', e.message)
      }
    }
    room.battleCells = cells && cells.length ? cells : []
    room.battleFieldRevision = 1
    room.battleLog = []
    room.battleOrdersDraft = {}
    room.battleStartedAt = Date.now()
    room.battleTurnIndex = 0
    room.battleTurnAck = new Set()
    room.battleScenarioEndSeq = 0
    room.battleScenarioWinnerFaction = null
    room.battleScenarioReason = null
    room.battleMapConditions = mapConditions
    room.battleCaptureHoldStreak = 0
    initBattlePresenceForFighters(room)
    await sendRoomDetailOr500(res, room, key)
  })

  router.post('/:id/leave', async (req, res) => {
    const id = Number(req.params.id)
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    if (!room.members.some((m) => m.key === key)) {
      return res.status(403).json({ error: 'Вы не в этой комнате' })
    }
    const wasHost = key === room.hostKey
    if (wasHost) {
      rooms.delete(id)
      return res.json({ ok: true, roomClosed: true })
    }
    room.members = room.members.filter((m) => m.key !== key)
    if (room.members.length === 0) rooms.delete(id)
    res.json({ ok: true })
  })
}

module.exports = {
  registerLobbyRoutes,
}

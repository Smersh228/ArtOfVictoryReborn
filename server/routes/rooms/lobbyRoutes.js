const express = require('express')
const { verifyToken, pool } = require('../../db')
const { getTokenFromRequest } = require('../../cookieAuth')
const { enrichBattleCells, loadBattleCellsFromMapId, loadBattleMapConditionsFromMapId, loadBattleMapDeploymentFromMapId, loadBattleMapReinforcementsFromMapId } = require('../../game/lib/support/battleEnrich')
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
  touchLobbyPresenceFromPoll,
  dropWaitingLobbyMember,
  sweepStaleLobbyMembers,
  sweepAllWaitingLobbies,
  closeHostSoloRooms,
  sweepAbandonedBattles,
  assignMemberTeam,
  addRoomChatMessage,
} = require('./shared')
const { rooms, allocRoomId } = require('./state')
const { ensureRoomBots, applyBotDeploy, isSoloPlayerBotMap } = require('../../game/lib/ai/battleBots')

const FACTIONS = ['none', 'rkka', 'wehrmacht']

let lobbyPresenceSweepTimer = null

function registerLobbyRoutes(router) {
  if (!lobbyPresenceSweepTimer) {
    lobbyPresenceSweepTimer = setInterval(() => {
      try {
        sweepAllWaitingLobbies()
        sweepAbandonedBattles()
      } catch (err) {
        console.error('lobby presence sweep:', err)
      }
    }, 15_000)
    if (typeof lobbyPresenceSweepTimer.unref === 'function') lobbyPresenceSweepTimer.unref()
  }
  router.get('/', (_req, res) => {
    sweepAllWaitingLobbies()
    sweepAbandonedBattles()
    const list = Array.from(rooms.values())
      .filter((room) => !room.solo || room.battleStartedAt != null)
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
      touchLobbyPresenceFromPoll(room, selfKey)
      sweepStaleLobbyMembers(room)
      if (!rooms.get(id)) return res.status(404).json({ error: 'Комната не найдена' })
      await sendRoomDetailOr500(res, room, selfKey, req)
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
    const { name, map, mapId } = req.body || {}
    const n = String(name || '').trim() || 'Комната'
    let mp = 2

    let mapLabel = String(map || '').trim()
    let resolvedMapId = null
    let mapBots = null
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
          `SELECT sm.name, sm.owner_user_id, u.username AS owner_username,
                  (sm.payload #>> '{scenario,teamLimit}') AS team_limit,
                  sm.payload -> 'bots' AS bots
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
        const fromMap = Number(row.rows[0].team_limit)
        mp = fromMap === 4 || fromMap === 6 ? fromMap : 2
        mapBots = row.rows[0].bots
      } catch (err) {
        console.error('rooms mapId lookup:', err.message)
        return res.status(500).json({ error: 'Не удалось проверить карту' })
      }
    }
    if (!mapLabel) mapLabel = 'Карта'

    const soloMap = isSoloPlayerBotMap({ bots: mapBots }, mp)
    if (req.body && req.body.solo && !soloMap) {
      return res.status(400).json({
        error: 'Для одиночной игры нужна карта на двоих: один слот игрока и один слот бота',
      })
    }

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
      members: [{ key, faction: 'none', ready: true, lobbyLastSeenAt: Date.now() }],
      createdAt: Date.now(),
    }
    ensureRoomBots(room, { bots: mapBots })
    room.solo = soloMap || Boolean(req.body && req.body.solo)
    if (room.solo) closeHostSoloRooms(key, null)
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
    if (room.solo) {
      return res.status(403).json({ error: 'В одиночную игру нельзя присоединиться' })
    }
    if (room.members.length >= room.maxPlayers) {
      return res.status(403).json({ error: 'Комната заполнена' })
    }
    room.members.push({ key, faction: 'none', ready: false, lobbyLastSeenAt: Date.now() })
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
    touchLobbyPresenceFromPoll(room, key)

    const { faction, ready, toggleFaction, toggleReady } = req.body || {}
    if (toggleFaction) {
      const i = FACTIONS.indexOf(mem.faction)
      mem.faction = FACTIONS[(i + 1) % FACTIONS.length]
      assignMemberTeam(room, mem, mem.faction)
    } else if (faction !== undefined) {
      if (!FACTIONS.includes(faction)) return res.status(400).json({ error: 'Неверная фракция' })
      mem.faction = faction
      assignMemberTeam(room, mem, mem.faction)
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
    if (room.mapId != null) {
      try {
        const r = await pool.query('SELECT payload FROM saved_map WHERE id_map = $1', [room.mapId])
        ensureRoomBots(room, r.rows[0] && r.rows[0].payload)
      } catch (e) {
        console.error('start-battle bots:', e.message)
      }
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
    room.battleHexCatalogSynced = true
    room.battleReconByFaction = { rkka: [], wehrmacht: [] }
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
    room.battleDeployPhase = null
    if (room.mapId != null) {
      try {
        const reinforcements = await loadBattleMapReinforcementsFromMapId(pool, room.mapId)
        if (reinforcements) {
          const { initBattleReinforcements } = require('../../game/lib/map/battleReinforcements')
          initBattleReinforcements(room, reinforcements)
        }
      } catch (e) {
        console.error('start-battle reinforcements:', e.message)
      }
      try {
        const deployment = await loadBattleMapDeploymentFromMapId(pool, room.mapId)
        if (deployment) {
          const { initBattleDeployPhase } = require('../../game/lib/map/battleDeployPhase')
          initBattleDeployPhase(room, deployment)
          applyBotDeploy(room)
        }
      } catch (e) {
        console.error('start-battle deployment:', e.message)
      }
    }
    const { initBattleEnvironment } = require('../../game/lib/scenario/battleEnvironment')
    initBattleEnvironment(room)
    if (!(room.battleDeployPhase && room.battleDeployPhase.active)) {
      const { commitReinforcementsForTurn } = require('../../game/lib/map/battleReinforcements')
      commitReinforcementsForTurn(room)
      const { enrichRoomBattleCellsIfNeeded } = require('../../game/lib/support/battleEnrich')
      await enrichRoomBattleCellsIfNeeded(room)
      const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
      withBattleEnv(room, () => {
        const { syncBattleReconByFaction } = require('../../game/lib/recon/battleReconResolve')
        syncBattleReconByFaction(room, room.battleCells)
      })
    }
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
      return res.json({ ok: true })
    }
    if (room.battleStartedAt == null) {
      const result = dropWaitingLobbyMember(room, key)
      return res.json({ ok: true, roomClosed: result === 'closed' })
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

  router.post('/:id/chat', express.json(), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })
    const result = await addRoomChatMessage(
      room,
      mem,
      key,
      req.body && req.body.text,
      req.body && req.body.channel,
    )
    if (!result.ok) return res.status(400).json({ error: result.error })
    await sendRoomDetailOr500(res, room, key)
  })
}

module.exports = {
  registerLobbyRoutes,
}

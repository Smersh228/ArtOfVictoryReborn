const express = require('express')
const { buildMergedOrders, buildTurnResolutionLog } = require('../../game/lib/scenario/battleTurnResolution')
const { applyScenarioResolution } = require('../../game/lib/scenario/battleScenarioResolution')
const {
  battleLogMeta,
  formatSubmittedOrderLine,
  battleMembersNeedingTurnAck,
  publicHqRewritePayload,
  ensureMemberSlots,
  memberKeyForRoom,
} = require('./shared')
const { rooms } = require('./state')
const { creditKillsFromLog, applyRoomOutcomeIfNeeded } = require('../../playerStats')

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v))
}

function insertInterceptLogLines(log, interceptLines, turnIdx) {
  if (!Array.isArray(interceptLines) || !interceptLines.length) return log
  const extra = interceptLines.map((text) => battleLogMeta(turnIdx, text))
  const idx = log.findIndex((e) => String(e.text || '').includes('— Итог —'))
  if (idx >= 0) log.splice(idx, 0, ...extra)
  else log.push(...extra)
  return log
}

function applyResolvedBattleTurn(room, needAck, merged, interceptLogLines) {
  const { withBattleEnv, tickWeather } = require('../../game/lib/scenario/battleEnvironment')
  const cells = room.battleCells
  const turnIdx = room.battleTurnIndex
  const log = withBattleEnv(room, () =>
    buildTurnResolutionLog(cells, merged, turnIdx, {
      makeLogMeta: battleLogMeta,
      formatOrderLine: formatSubmittedOrderLine,
      room,
    }),
  )
  insertInterceptLogLines(log, interceptLogLines, turnIdx)
  if (!Array.isArray(room.battleLog)) room.battleLog = []
  room.battleLog.push(...log)
  if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)

  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  room.battleOrdersDraft = {}
  room.battleHqRewriteSession = null
  room.battleHqRewriteSeq = (room.battleHqRewriteSeq || 0) + 1
  room.battleTurnIndex += 1
  room.battleTurnAck = new Set()

  tickWeather(room)
  withBattleEnv(room, () => {
    const { syncBattleReconByFaction } = require('../../game/lib/recon/battleReconResolve')
    syncBattleReconByFaction(room, room.battleCells)
  })

  applyScenarioResolution(room, {
    turnMeta: room.battleTurnIndex - 1,
    makeLogMeta: battleLogMeta,
  })
  void creditKillsFromLog(room, log).catch((e) => console.error('player kills:', e.message))
  void applyRoomOutcomeIfNeeded(room).catch((e) => console.error('player outcome:', e.message))
  return log
}

function startHqRewriteSession(room, needAck, intercept) {
  const needKeys = []
  for (const m of needAck) {
    const info = intercept.byFaction && intercept.byFaction[m.faction]
    if (info && Number(info.rewriteMax) > 0) needKeys.push(m.key)
  }
  if (!needKeys.length) return false
  room.battleHqRewriteSession = {
    turn: room.battleTurnIndex,
    byFaction: intercept.byFaction,
    logLines: intercept.logLines || [],
    needKeys,
    ack: new Set(),
    originalDrafts: cloneJson(room.battleOrdersDraft || {}),
  }
  room.battleHqRewriteSeq = (room.battleHqRewriteSeq || 0) + 1
  return true
}

function tryAdvanceAfterAllIn(room, needAck) {
  const session = room.battleHqRewriteSession
  if (session && session.turn === room.battleTurnIndex) {
    if (session.ack.size < session.needKeys.length) {
      return { advanced: false, hqRewritePending: true, resolutionLog: [] }
    }
    const merged = buildMergedOrders(room, needAck)
    const log = applyResolvedBattleTurn(room, needAck, merged, session.logLines)
    return { advanced: true, hqRewritePending: false, resolutionLog: log }
  }

  const merged = buildMergedOrders(room, needAck)
  const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
  const intercept = withBattleEnv(room, () => {
    const radio = require('../../game/lib/recon/battleRadioIntercept')
    return radio.resolveAllRadioIntercepts(room.battleCells, merged)
  })
  if (startHqRewriteSession(room, needAck, intercept)) {
    return { advanced: false, hqRewritePending: true, resolutionLog: [] }
  }
  const log = applyResolvedBattleTurn(room, needAck, merged, intercept.logLines)
  return { advanced: true, hqRewritePending: false, resolutionLog: log }
}

function registerBattleRoutes(router, { validateSubmittedOrders }) {
  router.post('/:id/battle/orders', express.json(), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })
    if (room.battleStartedAt == null) {
      return res.status(400).json({ error: 'Бой ещё не начат' })
    }
    const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
    if ((room.battleScenarioEndSeq ?? 0) > 0) {
      return res.status(400).json({ error: 'Сценарий завершён — бой остановлен' })
    }
    if (
      room.battleHqRewriteSession &&
      room.battleHqRewriteSession.turn === (room.battleTurnIndex ?? 0)
    ) {
      return res.status(400).json({ error: 'Сначала завершите связь со штабом' })
    }
    const turn = Number(req.body?.turn)
    const orders = req.body?.orders
    if (!Number.isFinite(turn)) {
      return res.status(400).json({ error: 'Нужен номер хода turn' })
    }
    if (room.battleTurnIndex == null) room.battleTurnIndex = 0
    if (turn !== room.battleTurnIndex) {
      return res.status(409).json({
        error: 'Рассинхрон хода',
        battleTurnIndex: room.battleTurnIndex,
      })
    }
    const cells = room.battleCells
    const err = withBattleEnv(room, () => validateSubmittedOrders(room, mem, orders, cells))
    if (err) return res.status(400).json({ error: err })
    if (!room.battleOrdersDraft || typeof room.battleOrdersDraft !== 'object') room.battleOrdersDraft = {}
    room.battleOrdersDraft[key] = { turn, orders: Array.isArray(orders) ? orders : [] }
    res.json({ ok: true })
  })

  router.post('/:id/battle/turn-ready', express.json(), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })
    if (room.battleStartedAt == null) {
      return res.status(400).json({ error: 'Бой ещё не начат' })
    }
    if ((room.battleScenarioEndSeq ?? 0) > 0) {
      return res.status(400).json({ error: 'Сценарий завершён — бой остановлен' })
    }
    const turn = Number(req.body?.turn)
    if (!Number.isFinite(turn)) {
      return res.status(400).json({ error: 'Нужен номер хода turn' })
    }
    if (room.battleTurnIndex == null) room.battleTurnIndex = 0
    if (!room.battleTurnAck || typeof room.battleTurnAck.add !== 'function') {
      room.battleTurnAck = new Set()
    }
    if (turn !== room.battleTurnIndex) {
      return res.status(409).json({
        error: 'Рассинхрон хода',
        battleTurnIndex: room.battleTurnIndex,
      })
    }
    if (
      room.battleHqRewriteSession &&
      room.battleHqRewriteSession.turn === room.battleTurnIndex
    ) {
      return res.json({
        ok: true,
        battleTurnIndex: room.battleTurnIndex,
        battleFieldRevision: room.battleFieldRevision ?? 0,
        waitingForOthers: true,
        battleHqRewrite: publicHqRewritePayload(room, key),
      })
    }
    room.battleTurnAck.add(key)
    const needAck = battleMembersNeedingTurnAck(room)
    const allIn = needAck.length > 0 && needAck.every((m) => room.battleTurnAck.has(m.key))
    let advanced = false
    let resolutionLog = []
    if (allIn) {
      const result = tryAdvanceAfterAllIn(room, needAck)
      advanced = result.advanced
      resolutionLog = result.resolutionLog
    }
    res.json({
      ok: true,
      battleTurnIndex: room.battleTurnIndex,
      battleFieldRevision: room.battleFieldRevision ?? 0,
      waitingForOthers: !advanced,
      resolutionLog: advanced ? resolutionLog : undefined,
      battleHqRewrite: publicHqRewritePayload(room, key),
    })
  })

  router.post('/:id/battle/hq-rewrite', express.json(), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })
    if (room.battleStartedAt == null) {
      return res.status(400).json({ error: 'Бой ещё не начат' })
    }
    if ((room.battleScenarioEndSeq ?? 0) > 0) {
      return res.status(400).json({ error: 'Сценарий завершён — бой остановлен' })
    }
    const session = room.battleHqRewriteSession
    if (!session || session.turn !== (room.battleTurnIndex ?? 0)) {
      return res.status(400).json({ error: 'Связь со штабом сейчас недоступна' })
    }
    if (!session.needKeys.includes(key)) {
      return res.status(403).json({ error: 'Штаб этой стороны не меняет приказы' })
    }
    if (session.ack.has(key)) {
      return res.json({
        ok: true,
        waitingForOthers: session.ack.size < session.needKeys.length,
        battleHqRewrite: publicHqRewritePayload(room, key),
      })
    }
    const turn = Number(req.body?.turn)
    if (!Number.isFinite(turn) || turn !== room.battleTurnIndex) {
      return res.status(409).json({
        error: 'Рассинхрон хода',
        battleTurnIndex: room.battleTurnIndex,
      })
    }
    const skip = Boolean(req.body?.skip)
    const info = session.byFaction && session.byFaction[mem.faction]
    const maxN = info ? Number(info.rewriteMax) || 0 : 0
    if (!skip) {
      const orders = req.body?.orders
      const { withBattleEnv } = require('../../game/lib/scenario/battleEnvironment')
      const err = withBattleEnv(room, () =>
        validateSubmittedOrders(room, mem, orders, room.battleCells),
      )
      if (err) return res.status(400).json({ error: err })
      const original = session.originalDrafts && session.originalDrafts[key]
      const radio = require('../../game/lib/recon/battleRadioIntercept')
      const changed = radio.countChangedOrderUnits(
        original && original.orders,
        Array.isArray(orders) ? orders : [],
      )
      if (changed > maxN) {
        return res.status(400).json({
          error: `Штаб может сменить не больше ${maxN} приказов (изменено ${changed})`,
        })
      }
      if (!room.battleOrdersDraft || typeof room.battleOrdersDraft !== 'object') room.battleOrdersDraft = {}
      room.battleOrdersDraft[key] = { turn, orders: Array.isArray(orders) ? orders : [] }
    }
    session.ack.add(key)
    const needAck = battleMembersNeedingTurnAck(room)
    let advanced = false
    let resolutionLog = []
    if (session.ack.size >= session.needKeys.length) {
      const result = tryAdvanceAfterAllIn(room, needAck)
      advanced = result.advanced
      resolutionLog = result.resolutionLog
    }
    res.json({
      ok: true,
      battleTurnIndex: room.battleTurnIndex,
      battleFieldRevision: room.battleFieldRevision ?? 0,
      waitingForOthers: !advanced,
      resolutionLog: advanced ? resolutionLog : undefined,
      battleHqRewrite: publicHqRewritePayload(room, key),
    })
  })

  router.post('/:id/battle/surrender', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
    const room = rooms.get(id)
    if (!room) return res.status(404).json({ error: 'Комната не найдена' })
    ensureMemberSlots(room)
    const key = await memberKeyForRoom(req, room)
    if (!key) return res.status(401).json({ error: 'Нет идентификатора' })
    const mem = room.members.find((m) => m.key === key)
    if (!mem) return res.status(403).json({ error: 'Вы не в этой комнате' })
    if (room.battleStartedAt == null) {
      return res.status(400).json({ error: 'Бой ещё не начат' })
    }
    if (room.battleSurrenderSeq == null) room.battleSurrenderSeq = 0
    room.battleSurrenderSeq += 1
    room.battleSurrenderBy = key
    void applyRoomOutcomeIfNeeded(room).catch((e) => console.error('player outcome:', e.message))
    res.json({
      ok: true,
      battleSurrenderSeq: room.battleSurrenderSeq,
      battleSurrenderBy: room.battleSurrenderBy,
    })
  })
}

module.exports = {
  registerBattleRoutes,
}

const express = require('express')
const { buildMergedOrders, buildTurnResolutionLog } = require('../../game/lib/scenario/battleTurnResolution')
const { applyScenarioResolution } = require('../../game/lib/scenario/battleScenarioResolution')
const {
  battleLogMeta,
  formatSubmittedOrderLine,
  battleMembersNeedingTurnAck,
  ensureMemberSlots,
  memberKeyForRoom,
} = require('./shared')
const { rooms } = require('./state')

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
    if ((room.battleScenarioEndSeq ?? 0) > 0) {
      return res.status(400).json({ error: 'Сценарий завершён — бой остановлен' })
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
    const err = validateSubmittedOrders(room, mem, orders, cells)
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
    room.battleTurnAck.add(key)
    const needAck = battleMembersNeedingTurnAck(room)
    const allIn = needAck.length > 0 && needAck.every((m) => room.battleTurnAck.has(m.key))
    let advanced = false
    let resolutionLog = []
    if (allIn) {
      const cells = room.battleCells
      const merged = buildMergedOrders(room, needAck)
      const turnIdx = room.battleTurnIndex
      const log = buildTurnResolutionLog(cells, merged, turnIdx, {
        makeLogMeta: battleLogMeta,
        formatOrderLine: formatSubmittedOrderLine,
      })
      resolutionLog = log
      if (!Array.isArray(room.battleLog)) room.battleLog = []
      room.battleLog.push(...log)
      if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)

      room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
      room.battleOrdersDraft = {}
      room.battleTurnIndex += 1
      room.battleTurnAck = new Set()
      advanced = true

      applyScenarioResolution(room, {
        turnMeta: room.battleTurnIndex - 1,
        makeLogMeta: battleLogMeta,
      })
    }
    res.json({
      ok: true,
      battleTurnIndex: room.battleTurnIndex,
      battleFieldRevision: room.battleFieldRevision ?? 0,
      waitingForOthers: !advanced,
      resolutionLog: advanced ? resolutionLog : undefined,
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

'use strict'

const { resolveTurn } = require('../../battleEngine')

function buildMergedOrders(room, needAck) {
  const merged = new Map()
  if (!room.battleOrdersDraft || typeof room.battleOrdersDraft !== 'object') return merged
  for (const m of needAck) {
    const draft = room.battleOrdersDraft[m.key]
    if (!draft || draft.turn !== room.battleTurnIndex) continue
    const list = draft.orders || []
    for (const o of list) {
      if (o && o.unitInstanceId != null) merged.set(Number(o.unitInstanceId), o)
    }
  }
  return merged
}

function buildTurnResolutionLog(cells, merged, turnIdx, { makeLogMeta, formatOrderLine }) {
  const displayTurn = turnIdx + 1
  const log = []
  log.push(makeLogMeta(turnIdx, `—— Ход ${displayTurn} ——`))
  const sortedOrders = [...merged.entries()].sort((a, b) => a[0] - b[0])
  if (sortedOrders.length === 0) {
    log.push(makeLogMeta(turnIdx, 'Приказов не подано'))
  } else {
    log.push(makeLogMeta(turnIdx, 'Приказы:'))
    for (const [uid, spec] of sortedOrders) {
      log.push(makeLogMeta(turnIdx, `· ${formatOrderLine(uid, spec)}`))
    }
  }
  log.push(makeLogMeta(turnIdx, '— Итог —'))

  if (!Array.isArray(cells) || cells.length === 0) return log

  const aliveBefore = new Set()
  const aliveBeforeInfo = new Map()
  for (const c of cells) {
    for (const u of c.units || []) {
      const s = Number(u.str ?? u.strength)
      if (Number.isFinite(s) && s > 0) {
        const uid = Number(u.instanceId)
        aliveBefore.add(uid)
        aliveBeforeInfo.set(uid, {
          unitName: String(u.name || '').trim() || undefined,
          unitFaction: String(u.faction || '').trim().toLowerCase() || undefined,
          destroyedCellId: Number(c.id),
        })
      }
    }
  }

  resolveTurn(cells, merged, log, turnIdx)

  const aliveAfter = new Set()
  for (const c of cells) {
    for (const u of c.units || []) {
      const s = Number(u.str ?? u.strength)
      if (Number.isFinite(s) && s > 0) aliveAfter.add(Number(u.instanceId))
    }
  }
  for (const idAlive of aliveBefore) {
    if (aliveAfter.has(idAlive)) continue
    const info = aliveBeforeInfo.get(idAlive) || {}
    log.push({
      phase: 7,
      text: `Юнит ${idAlive} уничтожен`,
      t: Date.now(),
      turn: turnIdx,
      meta: {
        unitInstanceId: idAlive,
        unitName: info.unitName,
        unitFaction: info.unitFaction,
        destroyedCellId: info.destroyedCellId,
        destroyed: true,
      },
    })
  }
  return log
}

module.exports = {
  buildMergedOrders,
  buildTurnResolutionLog,
}

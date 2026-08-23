'use strict'

const { resolveTurn } = require('../../battleEngine')
const { syncBattleReconByFaction } = require('../recon/battleReconResolve')

function collectAliveUnitsOnField(cells) {
  const info = new Map()
  if (!Array.isArray(cells)) return info
  for (const c of cells) {
    const cellId = Number(c.id)
    for (const u of c.units || []) {
      const s = Number(u.str ?? u.strength)
      if (Number.isFinite(s) && s > 0) {
        const uid = Number(u.instanceId)
        if (Number.isFinite(uid)) {
          info.set(uid, {
            unitName: String(u.name || '').trim() || undefined,
            unitFaction: String(u.faction || '').trim().toLowerCase() || undefined,
            unitType: String(u.type || '').trim().toLowerCase() || undefined,
            destroyedCellId: cellId,
          })
        }
      }
      const tac = u.tactical
      if (tac && Array.isArray(tac.carriedUnits)) {
        for (const cu of tac.carriedUnits) {
          const cs = Number(cu.str ?? cu.strength)
          if (Number.isFinite(cs) && cs > 0) {
            const cid = Number(cu.instanceId)
            if (Number.isFinite(cid)) {
              info.set(cid, {
                unitName: String(cu.name || '').trim() || undefined,
                unitFaction: String(cu.faction || '').trim().toLowerCase() || undefined,
                unitType: String(cu.type || '').trim().toLowerCase() || undefined,
                destroyedCellId: cellId,
              })
            }
          }
        }
      }
    }
  }
  return info
}

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

function buildTurnResolutionLog(cells, merged, turnIdx, { makeLogMeta, formatOrderLine, room }) {
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

  const aliveBeforeInfo = collectAliveUnitsOnField(cells)
  const aliveBefore = new Set(aliveBeforeInfo.keys())

  resolveTurn(cells, merged, log, turnIdx)

  if (room) syncBattleReconByFaction(room, cells)

  const aliveAfter = new Set(collectAliveUnitsOnField(cells).keys())
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
        unitType: info.unitType,
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

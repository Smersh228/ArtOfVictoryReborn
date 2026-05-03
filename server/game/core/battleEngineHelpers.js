'use strict'

function resetTurnMovePointsForUnit(u, deps) {
  const { setMovePoint, getMoveCap } = deps
  if (!u || typeof u !== 'object') return
  setMovePoint(u, getMoveCap(u))
  const tac = u.tactical
  if (tac && Array.isArray(tac.carriedUnits)) {
    for (let i = 0; i < tac.carriedUnits.length; i++) {
      resetTurnMovePointsForUnit(tac.carriedUnits[i], deps)
    }
  }
}

function resetTurnResources(cells, deps) {
  for (const c of cells) {
    for (const u of c.units || []) {
      resetTurnMovePointsForUnit(u, deps)
    }
  }
}

function moveBudgetForOrderKey(movePoints, orderKey) {
  const mp = Number(movePoints)
  const base = Number.isFinite(mp) ? mp : 0
  const k = String(orderKey || '').trim()
  return k === 'moveWar' ? Math.max(0, base - 1) : base
}

function isMoveOrderValid(cells, unitInstanceId, targetCellId, orderKey, deps) {
  const {
    findUnitOnField,
    isArtilleryDeployedForBattle,
    getMovePoint,
    computeRevealedCellIdsForFaction,
    unitFaction,
    findReachable,
  } = deps
  const cur = findUnitOnField(cells, unitInstanceId)
  if (!cur) return false
  if (isArtilleryDeployedForBattle(cur.unit)) return false
  const tc = cells.find((c) => Number(c.id) === Number(targetCellId))
  if (!tc) return false
  const budget = moveBudgetForOrderKey(getMovePoint(cur.unit), orderKey)
  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(cur.unit))
  const reach = findReachable(cur.cell, budget, cells, cur.unit, fog)
  const tid = Number(tc.id)
  return reach.some((c) => Number(c.id) === tid)
}

function attackReachBudget(unit, deps) {
  const { getMoveCap } = deps
  return Math.max(0, getMoveCap(unit) - 1)
}

function pathTerrainCostSlice(path, unit, endIdx, deps) {
  const { terrainEntryCost } = deps
  let s = 0
  for (let i = 1; i <= endIdx && i < path.length; i++) {
    s += terrainEntryCost(path[i], unit)
  }
  return s
}

function cheapestEngagePath(cells, fromCell, unit, targetCell, fog, deps) {
  const { getNeighbor, findCellByCoor, findPath, terrainEntryCost } = deps
  let bestPath = null
  let bestCost = Infinity
  for (let dir = 0; dir < 6; dir++) {
    const nb = getNeighbor(targetCell.coor, dir)
    const adjCell = findCellByCoor(cells, nb)
    if (!adjCell) continue
    const path = findPath(fromCell, adjCell, cells, unit, fog)
    if (!path) continue
    const cost = pathTerrainCostSlice(path, unit, path.length - 1, { terrainEntryCost })
    if (cost < bestCost) {
      bestCost = cost
      bestPath = path
    }
  }
  return bestPath ? { path: bestPath, cost: bestCost } : null
}

function isSolitaryMeleeTargetCell(attackerUnit, defPack, deps) {
  const { unitFaction, getStr, opposing } = deps
  const cell = defPack.cell
  const af = unitFaction(attackerUnit)
  const tid = Number(defPack.unit.instanceId)
  let lone = null
  for (const u of cell.units || []) {
    if (getStr(u) <= 0) continue
    if (!opposing(af, unitFaction(u))) continue
    if (lone != null) return false
    lone = u
  }
  return lone != null && Number(lone.instanceId) === tid
}

function moveAttackerOntoMeleeTargetCell(cells, attackerId, defenderId, deps) {
  const { findUnitOnField, hexDistCells, removeUnitFromCell, addUnitToCell, syncUnitCoor } = deps
  const A = findUnitOnField(cells, attackerId)
  const D = findUnitOnField(cells, defenderId)
  if (!A || !D) return false
  if (A.cell.id === D.cell.id) return true
  if (hexDistCells(A.cell, D.cell) !== 1) return false
  const u = A.unit
  removeUnitFromCell(A.cell, attackerId)
  addUnitToCell(D.cell, u)
  syncUnitCoor(u, D.cell)
  return true
}

function isAttackOrderValid(cells, attackerId, targetId, deps) {
  const { findUnitOnField, opposing, unitFaction, computeRevealedCellIdsForFaction } = deps
  const atk = findUnitOnField(cells, attackerId)
  const def = findUnitOnField(cells, targetId)
  if (!atk || !def) return false
  if (!opposing(unitFaction(atk.unit), unitFaction(def.unit))) return false
  if (!isSolitaryMeleeTargetCell(atk.unit, def, deps)) return false
  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(atk.unit))
  const ce = cheapestEngagePath(cells, atk.cell, atk.unit, def.cell, fog, deps)
  if (!ce) return false
  return ce.cost <= attackReachBudget(atk.unit, deps)
}

function validateUnitOrdersAllowed(unit, deps) {
  const { getMeleeOpponentId } = deps
  if (!unit) return null
  if (getMeleeOpponentId(unit)) return 'юнит в ближнем бою'
  if (unit.tactical && unit.tactical.fireSuppression) return 'огневое подавление'
  return null
}

function clearDefendOnUnit(unit) {
  if (!unit) return
  if (unit.tactical && typeof unit.tactical === 'object') {
    delete unit.tactical.defendOrder
    delete unit.tactical.ambushOrder
    delete unit.tactical.artilleryFireSector
    delete unit.tactical.ambushRevealed
  }
  delete unit.defendFacingCellId
  delete unit.defendMaxRangeSteps
  delete unit.defendSectorCellIds
}

module.exports = {
  resetTurnMovePointsForUnit,
  resetTurnResources,
  moveBudgetForOrderKey,
  isMoveOrderValid,
  attackReachBudget,
  pathTerrainCostSlice,
  cheapestEngagePath,
  isSolitaryMeleeTargetCell,
  moveAttackerOntoMeleeTargetCell,
  isAttackOrderValid,
  validateUnitOrdersAllowed,
  clearDefendOnUnit,
}

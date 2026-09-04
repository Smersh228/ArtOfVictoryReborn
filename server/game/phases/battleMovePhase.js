'use strict'

const { applyWireBreakthroughOnStep } = require('../lib/map/battleWireEdges')
const mines = require('../lib/map/battleMines')
const trench = require('../lib/map/battleTrench')
const hiddenState = require('../lib/unit/battleHiddenState')
const fireMoveMod = require('../lib/unit/battleFireMove')
const analog = require('../lib/unit/battleMeleeAnalog')
const collision = require('../lib/map/battleMoveCollision')
const smokeMod = require('../lib/map/battleSmoke')
const meleePhase = require('./battleMeleePhase')

function applyMoveCollisions(cells, list, le, ph, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    getMovePoint,
    moveBudgetForOrderKey,
    computeRevealedCellIdsForFaction,
    unitFaction,
    findReachable,
    findPath,
  } = deps
  const intents = []
  for (const o of list) {
    const cur = findUnitOnField(cells, o.unitId)
    if (!cur) continue
    if (validateUnitOrdersAllowed(cur.unit, o.orderKey)) continue
    const cid = o.targetCellId
    if (cid == null) continue
    const targetCell = cells.find((c) => Number(c.id) === Number(cid))
    if (!targetCell) continue
    const k = String(o.orderKey || '').trim()
    const budgetKey = k === 'fireMove' ? 'move' : o.orderKey
    const mp = getMovePoint(cur.unit)
    const budget = moveBudgetForOrderKey(mp, budgetKey)
    const fog = computeRevealedCellIdsForFaction(cells, unitFaction(cur.unit))
    const reach = findReachable(cur.cell, budget, cells, cur.unit, fog)
    if (!reach.some((c) => Number(c.id) === Number(targetCell.id))) continue
    const path = findPath(cur.cell, targetCell, cells, cur.unit, fog)
    if (!path) continue
    intents.push({
      unitId: o.unitId,
      faction: unitFaction(cur.unit),
      path: smokeMod.truncatePathBeforeSmoke(path.slice()),
      unit: cur.unit,
      order: o,
    })
  }
  collision.resolveMovementCollisions(intents, le, ph, { cells, findUnitOnField })
  for (const it of intents) it.order.collisionPath = it.path
}

function executeOneGroundMove(cells, o, ordersByUnit, le, ph, movedInstanceIds, deps, budgetOrderKey) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    getMovePoint,
    moveBudgetForOrderKey,
    computeRevealedCellIdsForFaction,
    unitFaction,
    findReachable,
    findPath,
    tryDefendOverwatchOnMovePath,
    getStr,
    terrainEntryCost,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
    setMovePoint,
    revealAmbushesAdjacentToCell,
    isTruckUnit,
    syncCargoAfterTransportMove,
    getMeleeOpponentId,
  } = deps
  const cur = findUnitOnField(cells, o.unitId)
  if (!cur) return null
  const stBlock = validateUnitOrdersAllowed(cur.unit, o.orderKey)
  if (stBlock) {
    le(ph, `Ход: юнит ${o.unitId} — ${stBlock}`)
    return null
  }
  const cid = o.targetCellId
  if (cid == null) return null
  const targetCell = cells.find((c) => Number(c.id) === Number(cid))
  if (!targetCell) return null
  const meleeId = typeof getMeleeOpponentId === 'function' ? getMeleeOpponentId(cur.unit) : null
  if (meleeId != null) {
    if (String(o.orderKey || '').trim() !== 'move') {
      le(ph, `Ход: юнит ${o.unitId} — в ближнем бою доступен только отход («Движение»)`)
      return null
    }
    if (!analog.isValidMeleeRetreatCell(cur.cell, targetCell, cur.unit, cells, deps)) {
      le(ph, `Ход: юнит ${o.unitId} — недопустимый гекс отхода`)
      return null
    }
    const meleeRes = meleePhase.resolveMutualMeleeRound(cells, ordersByUnit, le, ph, meleeId, o.unitId, {
      ...deps,
      retreatSilentId: o.unitId,
    })
    const afterFire = findUnitOnField(cells, o.unitId)
    if (!afterFire || getStr(afterFire.unit) <= 0) return null
    if (meleeRes && meleeRes.dmgToB > 0 && typeof deps.trySteadfastnessAfterOverwatchDamage === 'function') {
      deps.trySteadfastnessAfterOverwatchDamage(le, ph, afterFire.unit, meleeRes.dmgToB)
    }
    const afterSt = findUnitOnField(cells, o.unitId)
    if (!afterSt || getStr(afterSt.unit) <= 0) return null
    if (afterSt.unit.tactical && afterSt.unit.tactical.fireSuppression) {
      le(ph, `Отход: юнит ${o.unitId} — подавление после обстрела, остаётся на месте`)
      return null
    }
    analog.breakMeleeLink(afterSt.unit, cells, deps)
  }
  const mp = getMovePoint(cur.unit)
  const budget = moveBudgetForOrderKey(mp, budgetOrderKey)
  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(cur.unit))
  let path = Array.isArray(o.collisionPath) ? o.collisionPath : null
  if (!path) {
    const reach = findReachable(cur.cell, budget, cells, cur.unit, fog)
    if (!reach.some((c) => Number(c.id) === Number(targetCell.id))) {
      path = findPath(cur.cell, targetCell, cells, cur.unit, fog, true)
      if (path) path = smokeMod.truncatePathBeforeSmoke(path)
      if (!path || path.length < 2) {
        le(ph, `Ход: ${cur.unit.instanceId} — клетка ${cid} недостижима за ОД`)
        return null
      }
    } else {
      path = findPath(cur.cell, targetCell, cells, cur.unit, fog)
    }
  }
  if (path) path = smokeMod.truncatePathBeforeSmoke(path)
  if (!path || path.length < 2) {
    le(ph, `Ход: юнит ${cur.unit.instanceId} — нет пути до клетки ${cid}`)
    return null
  }
  trench.leaveTrench(cur.unit, cur.cell)
  const minePlan = mines.planMinePath(path, cur.unit, budgetOrderKey, isTruckUnit)
  const mineCappedPath = path.slice(0, minePlan.endIndex + 1)
  const ow = tryDefendOverwatchOnMovePath(cells, cur.unit.instanceId, mineCappedPath, ordersByUnit, le, ph)
  const afterOw = findUnitOnField(cells, o.unitId)
  if (!afterOw || getStr(afterOw.unit) <= 0) {
    if (ow.fired) {
      le(ph, `Ход: юнит ${o.unitId} не завершил движение (огонь с обороны/засады)`)
    }
    return null
  }
  const endStepIndex =
    ow.fired && ow.stopStepIndex != null ? ow.stopStepIndex : minePlan.endIndex
  const finalCell = path[endStepIndex]
  let spent = 0
  const wireBrokenCellIds = []
  for (let i = 1; i <= endStepIndex; i++) {
    if (applyWireBreakthroughOnStep(path[i - 1], path[i], afterOw.unit, deps.unitHasPropKey)) {
      wireBrokenCellIds.push(Number(path[i].id))
    }
    spent += terrainEntryCost(path[i], afterOw.unit)
  }
  const pathIds = path.slice(0, endStepIndex + 1).map((c) => c.id)
  removeUnitFromCell(afterOw.cell, afterOw.unit.instanceId)
  addUnitToCell(finalCell, afterOw.unit)
  syncUnitCoor(afterOw.unit, finalCell)
  setMovePoint(afterOw.unit, mp - spent)
  const mineStop =
    (minePlan.blasts.length > 0 || (minePlan.reveals || []).some((r) => r.reason === 'enter')) &&
    endStepIndex < path.length - 1
  const interruptNote = ow.fired
    ? `, прервано обороной/засадой у кл. ${finalCell.id}`
    : mineStop
      ? `, остановлено минным полем у кл. ${finalCell.id}`
      : ''
  le(ph, `Ход: юнит ${afterOw.unit.instanceId} → клетка ${finalCell.id} (−${spent} ОД)${interruptNote}`, {
    movePath: pathIds,
    unitInstanceId: Number(afterOw.unit.instanceId),
    moveOrderKey: String(o.orderKey || 'move').trim(),
    moveInterruptedByDefend: !!ow.fired,
    moveInterruptedByMine: !!mineStop,
  })
  if (wireBrokenCellIds.length) {
    le(ph, `Прорыв проволоки: юнит ${afterOw.unit.instanceId} снял колючую проволоку (${wireBrokenCellIds.length})`, {
      wireBreakthrough: {
        unitInstanceId: Number(afterOw.unit.instanceId),
        cellIds: wireBrokenCellIds,
        count: wireBrokenCellIds.length,
      },
    })
  }
  mines.resolveMineBlastsAfterMove(
    cells,
    afterOw.unit,
    path,
    minePlan,
    endStepIndex,
    le,
    ph,
    deps,
  )
  mines.resolveMineRevealsAfterMove(cells, afterOw.unit, path, minePlan, endStepIndex, le, ph)
  const afterMine = findUnitOnField(cells, o.unitId)
  if (!afterMine || getStr(afterMine.unit) <= 0) {
    movedInstanceIds.add(Number(afterOw.unit.instanceId))
    return { died: true, path, endStepIndex, pack: afterOw }
  }
  revealAmbushesAdjacentToCell(cells, afterMine.unit, afterMine.cell, le, ph)
  movedInstanceIds.add(Number(afterMine.unit.instanceId))
  if (isTruckUnit(afterMine.unit) || require('../lib/map/battleRailway').isRailwayUnit(afterMine.unit)) {
    syncCargoAfterTransportMove(cells, afterMine.unit.instanceId)
  }
  const k = String(o.orderKey || '').trim()
  if (k === 'move' || k === 'fireMove') hiddenState.markHiddenMarched(afterMine.unit)
  if (endStepIndex > 0) hiddenState.markHiddenMovedHex(afterMine.unit)
  return { died: false, path, endStepIndex, pack: afterMine }
}

function processMovePhase(cells, list, ordersByUnit, le, ph, movedInstanceIds, deps) {
  applyMoveCollisions(cells, list, le, ph, deps)
  for (const o of list) {
    if (String(o.orderKey || '').trim() === 'fireMove') continue
    executeOneGroundMove(cells, o, ordersByUnit, le, ph, movedInstanceIds, deps, o.orderKey)
  }
  for (const o of list) {
    if (String(o.orderKey || '').trim() !== 'fireMove') continue
    const moved = executeOneGroundMove(cells, o, ordersByUnit, le, ph, movedInstanceIds, deps, 'move')
    if (!moved || moved.died) continue
    fireMoveMod.resolveFireMoveShot(cells, o, moved.pack, moved.path, moved.endStepIndex, le, ph, deps)
  }
}

module.exports = {
  processMovePhase,
}

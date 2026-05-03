'use strict'

function processMovePhase(cells, list, ordersByUnit, le, ph, movedInstanceIds, deps) {
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
  } = deps

  for (const o of list) {
    const cur = findUnitOnField(cells, o.unitId)
    if (!cur) continue
    const stBlock = validateUnitOrdersAllowed(cur.unit)
    if (stBlock) {
      le(ph, `Ход: юнит ${o.unitId} — ${stBlock}`)
      continue
    }
    const cid = o.targetCellId
    if (cid == null) continue
    const targetCell = cells.find((c) => Number(c.id) === Number(cid))
    if (!targetCell) continue
    const mp = getMovePoint(cur.unit)
    const budget = moveBudgetForOrderKey(mp, o.orderKey)
    const fog = computeRevealedCellIdsForFaction(cells, unitFaction(cur.unit))
    const reach = findReachable(cur.cell, budget, cells, cur.unit, fog)
    if (!reach.some((c) => c.id === targetCell.id)) {
      le(ph, `Ход: ${cur.unit.instanceId} — клетка ${cid} недостижима за ОД`)
      continue
    }
    const path = findPath(cur.cell, targetCell, cells, cur.unit, fog)
    if (!path) {
      le(ph, `Ход: юнит ${cur.unit.instanceId} — нет пути до клетки ${cid}`)
      continue
    }
    const ow = tryDefendOverwatchOnMovePath(cells, cur.unit.instanceId, path, ordersByUnit, le, ph)
    const afterOw = findUnitOnField(cells, o.unitId)
    if (!afterOw || getStr(afterOw.unit) <= 0) {
      if (ow.fired) {
        le(ph, `Ход: юнит ${o.unitId} не завершил движение (огонь с обороны/засады)`)
      }
      continue
    }
    const endStepIndex =
      ow.fired && ow.stopStepIndex != null ? ow.stopStepIndex : path.length - 1
    const finalCell = path[endStepIndex]
    let spent = 0
    for (let i = 1; i <= endStepIndex; i++) {
      spent += terrainEntryCost(path[i], afterOw.unit)
    }
    const pathIds = path.slice(0, endStepIndex + 1).map((c) => c.id)
    removeUnitFromCell(afterOw.cell, afterOw.unit.instanceId)
    addUnitToCell(finalCell, afterOw.unit)
    syncUnitCoor(afterOw.unit, finalCell)
    setMovePoint(afterOw.unit, mp - spent)
    const interruptNote = ow.fired ? `, прервано обороной/засадой у кл. ${finalCell.id}` : ''
    le(ph, `Ход: юнит ${afterOw.unit.instanceId} → клетка ${finalCell.id} (−${spent} ОД)${interruptNote}`, {
      movePath: pathIds,
      unitInstanceId: Number(afterOw.unit.instanceId),
      moveOrderKey: String(o.orderKey || 'move').trim(),
      moveInterruptedByDefend: !!ow.fired,
    })
    revealAmbushesAdjacentToCell(cells, afterOw.unit, finalCell, le, ph)
    movedInstanceIds.add(Number(afterOw.unit.instanceId))
    if (isTruckUnit(afterOw.unit)) {
      syncCargoAfterTransportMove(cells, afterOw.unit.instanceId)
    }
  }
}

module.exports = {
  processMovePhase,
}

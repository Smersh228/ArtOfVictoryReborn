'use strict'

function isAmbushConcealed(u) {
  if (!u || !u.tactical) return false
  const t = u.tactical
  if (!t.ambushOrder) return false
  if (t.defendOrder) return false
  if (t.ambushRevealed) return false
  return true
}

function hasFriendlyAdjacentToHex(cells, targetCell, friendlyFaction, deps) {
  const { hexDistCells, getStr, unitFaction } = deps
  if (!friendlyFaction || friendlyFaction === 'none') return false
  for (const c of cells) {
    if (hexDistCells(c, targetCell) > 1) continue
    const us = c.units || []
    for (let i = 0; i < us.length; i++) {
      const u = us[i]
      if (getStr(u) <= 0) continue
      if (unitFaction(u) === friendlyFaction) return true
    }
  }
  return false
}

function canSpotAmbushTarget(attackerUnit, attackerCell, targetUnit, targetCell, cells, deps) {
  const {
    unitFaction,
    hexDistCells,
    isArtilleryUnit,
    unitHasPropKey,
    rangeArrayFor,
    fireRangeTableMode,
    computeRevealedCellIdsForFaction,
  } = deps
  if (!isAmbushConcealed(targetUnit)) return true
  const atkF = unitFaction(attackerUnit)
  if (atkF === 'none') return false
  if (hasFriendlyAdjacentToHex(cells, targetCell, atkF, deps)) return true
  const d = hexDistCells(attackerCell, targetCell)
  if (d <= 1) return true
  if (isArtilleryUnit(attackerUnit) && unitHasPropKey(attackerUnit, 'areaFire')) {
    const ra = rangeArrayFor(attackerUnit)
    const mode = fireRangeTableMode(ra)
    const maxD = mode === 'ranged' ? ra.length - 1 : ra.length
    if (d >= 1 && d <= maxD) return true
  }
  const revealed = computeRevealedCellIdsForFaction(cells, atkF)
  return !!(revealed && revealed.has(targetCell.id))
}

function clearAmbushOrderFully(unit) {
  if (!unit || !unit.tactical) return false
  if (!unit.tactical.ambushOrder) return false
  if (unit.tactical.defendOrder) return false
  delete unit.tactical.ambushOrder
  delete unit.tactical.ambushRevealed
  delete unit.tactical.artilleryFireSector
  delete unit.defendFacingCellId
  delete unit.defendMaxRangeSteps
  delete unit.defendSectorCellIds
  return true
}

function revealAmbushesAdjacentToCell(cells, moverUnit, finalCell, le, ph, deps) {
  const { unitFaction, hexDistCells, getStr, opposing } = deps
  const f = unitFaction(moverUnit)
  if (f === 'none') return
  for (let ci = 0; ci < cells.length; ci++) {
    const c = cells[ci]
    if (hexDistCells(c, finalCell) > 1) continue
    const us = c.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (!opposing(f, unitFaction(u))) continue
      if (!isAmbushConcealed(u)) continue
      if (clearAmbushOrderFully(u)) {
        le(ph, `Засада снята: юнит ${u.instanceId} (соседний гекс)`, {
          unitInstanceId: Number(u.instanceId),
          ambushCleared: true,
        })
      }
    }
  }
}

module.exports = {
  isAmbushConcealed,
  hasFriendlyAdjacentToHex,
  canSpotAmbushTarget,
  clearAmbushOrderFully,
  revealAmbushesAdjacentToCell,
}

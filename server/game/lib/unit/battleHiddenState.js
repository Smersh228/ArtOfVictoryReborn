'use strict'

const { unitHasPropKey } = require('../../core/battleUnitType')
const { hexDistCells } = require('../map/battleHexGeometry')
const { getStr, unitFaction, opposing } = require('./battleUnitField')

function hasHiddenStateProp(unit) {
  return Boolean(unit) && unitHasPropKey(unit, 'hiddenState')
}

function hiddenBag(unit) {
  if (!unit) return null
  if (!unit.tactical) unit.tactical = {}
  if (!unit.tactical.hiddenState || typeof unit.tactical.hiddenState !== 'object') {
    unit.tactical.hiddenState = {}
  }
  return unit.tactical.hiddenState
}

function isHiddenConcealed(unit) {
  if (!hasHiddenStateProp(unit)) return false
  if (unit.tactical && unit.tactical.ambushOrder && !unit.tactical.ambushRevealed) return false
  const h = unit.tactical && unit.tactical.hiddenState
  if (!h || typeof h !== 'object') return true
  if (h.revealed) return false
  return true
}

function hiddenHasAdjacentEnemy(cell, unit, cells) {
  const fac = unitFaction(unit)
  const selfId = Number(unit && unit.instanceId)
  for (const oc of cells) {
    if (hexDistCells(cell, oc) > 1) continue
    for (const ou of oc.units || []) {
      if (getStr(ou) <= 0) continue
      if (Number(ou.instanceId) === selfId) continue
      if (opposing(fac, unitFaction(ou))) return true
    }
  }
  return false
}

/** Скрытость возвращается, как только рядом нет врага. */
function concealHiddenIfNoAdjacentEnemy(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!hasHiddenStateProp(u)) continue
      const h = hiddenBag(u)
      if (!h.revealed) continue
      if (h.revealedThisTurn) continue
      if (hiddenHasAdjacentEnemy(c, u, cells)) continue
      h.revealed = false
    }
  }
}

function tickHiddenStateAtTurnStart(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!hasHiddenStateProp(u)) continue
      const h = hiddenBag(u)
      h.skipThisTurn = false
      h.marched = false
      h.movedHex = false
      h.revealedThisTurn = false
    }
  }
}

function markHiddenMarched(unit) {
  if (!hasHiddenStateProp(unit)) return
  hiddenBag(unit).marched = true
}

function markHiddenMovedHex(unit) {
  if (!hasHiddenStateProp(unit)) return
  hiddenBag(unit).movedHex = true
}

function revealHiddenUnit(unit) {
  if (!hasHiddenStateProp(unit)) return false
  if (!isHiddenConcealed(unit) && !(unit.tactical && unit.tactical.hiddenState && !unit.tactical.hiddenState.revealed)) {
    const h = hiddenBag(unit)
    if (h.revealed) return false
  }
  hiddenBag(unit).revealed = true
  return true
}

function revealHiddenByOpeningFire(unit, le, ph) {
  if (!hasHiddenStateProp(unit)) return false
  const wasConcealed = isHiddenConcealed(unit)
  const h = hiddenBag(unit)
  h.revealed = true
  h.revealedThisTurn = true
  if (!wasConcealed) return false
  if (typeof le === 'function') {
    le(ph, `Скрытый отряд обнаружен: юнит ${unit.instanceId} (открытый огонь)`, {
      unitInstanceId: Number(unit.instanceId),
      hiddenRevealed: true,
    })
  }
  return true
}

function canSpotHiddenTarget(attackerUnit, attackerCell, targetUnit, targetCell, cells, deps) {
  const {
    unitFaction,
    hexDistCells,
    isArtilleryUnit,
    unitHasPropKey,
    rangeArrayFor,
    rangeArrayForAtCell,
    fireRangeTableMode,
    computeRevealedCellIdsForFaction,
    getStr,
  } = deps
  if (!isHiddenConcealed(targetUnit)) return true
  const atkF = unitFaction(attackerUnit)
  if (atkF === 'none') return false
  const d = hexDistCells(attackerCell, targetCell)
  if (d <= 1) return true
  for (const c of cells) {
    if (hexDistCells(c, targetCell) > 1) continue
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (unitFaction(u) === atkF) return true
    }
  }
  if (isArtilleryUnit(attackerUnit) || unitHasPropKey(attackerUnit, 'areaFire')) {
    const ra = rangeArrayForAtCell
      ? rangeArrayForAtCell(attackerUnit, attackerCell)
      : rangeArrayFor(attackerUnit)
    const mode = fireRangeTableMode(ra)
    const maxD = mode === 'ranged' ? ra.length - 1 : ra.length
    if (d >= 1 && d <= maxD) return true
  }
  return false
}

function revealHiddenAdjacentToCell(cells, moverUnit, finalCell, le, ph, deps) {
  const { unitFaction, hexDistCells, getStr, opposing } = deps
  const f = unitFaction(moverUnit)
  if (f === 'none') return
  for (const c of cells) {
    if (hexDistCells(c, finalCell) > 1) continue
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!opposing(f, unitFaction(u))) continue
      if (!isHiddenConcealed(u)) continue
      if (revealHiddenUnit(u)) {
        le(ph, `Скрытый отряд обнаружен: юнит ${u.instanceId} (соседний гекс)`, {
          unitInstanceId: Number(u.instanceId),
          hiddenRevealed: true,
        })
      }
    }
  }
}

function revealHiddenAlreadyAdjacent(cells, le, ph, deps) {
  const { hexDistCells, getStr, unitFaction, opposing } = deps
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!isHiddenConcealed(u)) continue
      const fac = unitFaction(u)
      let spotted = false
      for (const oc of cells) {
        if (hexDistCells(c, oc) > 1) continue
        for (const ou of oc.units || []) {
          if (getStr(ou) <= 0) continue
          if (!opposing(fac, unitFaction(ou))) continue
          spotted = true
          break
        }
        if (spotted) break
      }
      if (!spotted) continue
      if (revealHiddenUnit(u)) {
        le(ph, `Скрытый отряд обнаружен: юнит ${u.instanceId} (противник рядом)`, {
          unitInstanceId: Number(u.instanceId),
          hiddenRevealed: true,
        })
      }
    }
  }
}

module.exports = {
  hasHiddenStateProp,
  isHiddenConcealed,
  tickHiddenStateAtTurnStart,
  concealHiddenIfNoAdjacentEnemy,
  markHiddenMarched,
  markHiddenMovedHex,
  revealHiddenUnit,
  revealHiddenByOpeningFire,
  canSpotHiddenTarget,
  revealHiddenAdjacentToCell,
  revealHiddenAlreadyAdjacent,
}

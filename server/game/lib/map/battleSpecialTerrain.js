'use strict'

const { unitHasPropKey } = require('../../core/battleUnitType')

function hexExtraOf(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function cellBlob(cell) {
  const ex = hexExtraOf(cell)
  const name = String((cell && cell.name) || (ex && (ex.name || ex.label)) || '')
  const type = String((cell && cell.type) || '')
  return `${type} ${name}`
}

function isAirBattleUnit(unit) {
  const t = String((unit && unit.type) || '')
    .trim()
    .toLowerCase()
  return t === 'lightair' || t === 'heavyair'
}

function isFordHex(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (ex && ex.isFord === true) return true
  return /брод|ford/i.test(cellBlob(cell))
}

function isDestroyedBridgeHex(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (
    ex &&
    (ex.isDestroyedBridge === true ||
      ex.destroyedBridge === true ||
      ex.editorDestroyedBridge === true)
  ) {
    return true
  }
  const hp = cell.builds && cell.builds.structureHp
  if (hp && typeof hp === 'object') {
    const kind = String(hp.kind || '')
    if ((kind === 'bridge' || kind === 'railBridge') && Number(hp.str) <= 0) return true
  }
  return false
}

function clearInheritedDestroyedHexFlags(ex) {
  if (!ex || typeof ex !== 'object') return
  if (ex.editorDestroyedBridge !== true) {
    delete ex.isDestroyedBridge
    delete ex.destroyedBridge
  }
  if (ex.editorDestroyedRailway !== true) {
    delete ex.isDestroyedRailway
    delete ex.railwayDestroyed
  }
}

function isRailwayBridgeHex(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (ex && (ex.isRailwayBridge === true || ex.railBridge === true)) return true
  if (ex && ex.isBridge === true && (ex.isRailway === true || ex.railway === true || ex.rail === true)) return true
  return /железнодорожн(?:ый|ого)?\s*мост|rail(?:way)?\s*bridge/i.test(cellBlob(cell))
}

function isIntactBridgeHex(cell) {
  if (!cell || isDestroyedBridgeHex(cell)) return false
  if (isRailwayBridgeHex(cell)) return true
  const ex = hexExtraOf(cell)
  if (ex && ex.isBridge === true) return true
  const blob = cellBlob(cell)
  if (/понтон/i.test(blob)) return false
  return /(?:^|[^\u0400-\u04FF])мост|bridge/i.test(blob) && !/разрушен/i.test(blob)
}

function hexFlagOn(v) {
  return v === true || v === 'true' || v === 1 || v === '1'
}

function isWaterObstacleHex(cell) {
  const ex = hexExtraOf(cell)
  return !!(ex && hexFlagOn(ex.moveWithRiverProp))
}

function isSwampPropHex(cell) {
  const ex = hexExtraOf(cell)
  return !!(ex && hexFlagOn(ex.moveWithSwampProp))
}

function isWaterUnitRiverHex(cell) {
  const ex = hexExtraOf(cell)
  return !!(ex && hexFlagOn(ex.moveWithWaterUnitProp))
}

function cellAllowsWaterUnitMove(cell) {
  if (!cell) return false
  if (isIntactBridgeHex(cell) || isDestroyedBridgeHex(cell)) return true
  if (isWaterUnitRiverHex(cell) || isWaterObstacleHex(cell)) return true
  const ponton = require('./battlePonton')
  return ponton.isRiverCell(cell)
}

function waterCraftOnWaterCell(unit, cell) {
  if (!unitHasPropKey(unit, 'waterUnit')) return false
  if (isAirBattleUnit(unit)) return false
  return isWaterUnitRiverHex(cell)
}

function waterUnitCanEnterCell(unit, cell) {
  if (!unitHasPropKey(unit, 'waterUnit')) return true
  if (isAirBattleUnit(unit)) return true
  return isWaterUnitRiverHex(cell)
}

function unitCanEnterDestroyedBridge(unit, cell) {
  if (!isDestroyedBridgeHex(cell)) return true
  if (!unit) return false
  if (isAirBattleUnit(unit)) return true
  return unitHasPropKey(unit, 'waterUnit')
}

function effectiveElevationLevel(cell) {
  if (!cell) return 0
  const ex = hexExtraOf(cell)
  if (!ex) return 0
  const raw = ex.heightLevel
  if (raw === undefined || raw === null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n)
  if (r < -1 || r > 3) return 0
  return r
}

function stepUsesLimitedSpecialMove(unit, fromCell, toCell) {
  if (!unit || isAirBattleUnit(unit)) return false
  if (unitHasPropKey(unit, 'crossingAWaterObstacle')) {
    if (isWaterObstacleHex(fromCell) || isWaterObstacleHex(toCell)) return true
  }
  if (unitHasPropKey(unit, 'movementThroughTheSwamp')) {
    if (isSwampPropHex(fromCell) || isSwampPropHex(toCell)) return true
  }
  if (unitHasPropKey(unit, 'mountainTroops')) {
    const a = effectiveElevationLevel(fromCell)
    const b = effectiveElevationLevel(toCell)
    if (a !== b && (a === 3 || b === 3)) return true
  }
  return false
}

function canEnterElevation3(unit, toCell) {
  if (!toCell || isAirBattleUnit(unit)) return true
  if (effectiveElevationLevel(toCell) !== 3) return true
  return unitHasPropKey(unit, 'mountainTroops')
}

function specialMoveCountersAllow(unit, counters, fromCell, toCell) {
  if (!counters) return true
  if (Number(counters.limitedSpecial) >= 1) return false
  if (stepUsesLimitedSpecialMove(unit, fromCell, toCell) && Number(counters.stepsTaken) >= 1) return false
  return true
}

function unitInvolvesWaterUnit(a, b) {
  return unitHasPropKey(a, 'waterUnit') || unitHasPropKey(b, 'waterUnit')
}

module.exports = {
  isAirBattleUnit,
  isFordHex,
  isDestroyedBridgeHex,
  clearInheritedDestroyedHexFlags,
  isRailwayBridgeHex,
  isIntactBridgeHex,
  isWaterObstacleHex,
  isSwampPropHex,
  isWaterUnitRiverHex,
  cellAllowsWaterUnitMove,
  waterCraftOnWaterCell,
  waterUnitCanEnterCell,
  unitCanEnterDestroyedBridge,
  stepUsesLimitedSpecialMove,
  canEnterElevation3,
  specialMoveCountersAllow,
  unitInvolvesWaterUnit,
}

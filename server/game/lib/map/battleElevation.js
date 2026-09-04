'use strict'

const { unitHasPropKey, isInfantryUnit } = require('../../core/battleUnitType')
const { hexDistCells } = require('./battleHexGeometry')

function effectiveElevationLevel(cell) {
  if (!cell) return 0
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
  if (!ex) return 0
  const raw = ex.heightLevel
  if (raw === undefined || raw === null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n)
  if (r < -1 || r > 3) return 0
  return r
}

function isHill(cell) {
  return effectiveElevationLevel(cell) >= 1
}

function isRavine(cell) {
  return effectiveElevationLevel(cell) === -1
}

function isPontonBridgeCell(cell) {
  const ponton = require('./battlePonton')
  return ponton.isPontonComplete(cell && cell.builds)
}

/** Овраг без готового понтона — техника не проходит, лимит «один овраг» действует. */
function treatsAsRavineForMove(cell) {
  return isRavine(cell) && !isPontonBridgeCell(cell)
}

function isBattleAirUnitType(u) {
  const t = String(u?.type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

function unitCannotCrossRavine(unit) {
  const t = String(unit?.type ?? '')
  return t === 'tech' || t === 'armor' || t === 'lightTank' || t === 'mediumTank' || t === 'heavyTank'
}

/** Пологий / крутой / отвесный по модулю перепада высот. */
function slopeCategoryByAbsDiff(absDiff) {
  if (absDiff <= 0) return 'flat'
  if (absDiff === 1) return 'gentle'
  if (absDiff === 2) return 'steep'
  return 'vertical'
}

function slopeTransition(fromCell, toCell) {
  const fromE = effectiveElevationLevel(fromCell)
  const toE = effectiveElevationLevel(toCell)
  const diff = toE - fromE
  const absDiff = Math.abs(diff)
  const category = slopeCategoryByAbsDiff(absDiff)
  let direction = 'flat'
  if (diff > 0) direction = 'up'
  else if (diff < 0) direction = 'down'
  return { category, direction, absDiff, fromE, toE }
}

function isRavineExitDirection(fromCell, toCell) {
  if (!isRavine(fromCell) || isPontonBridgeCell(fromCell)) return true
  const toE = effectiveElevationLevel(toCell)
  if (isRavine(toCell)) return true
  if (toE === 0) return true
  return false
}

function createMoveSlopeCounters() {
  return { ravineHexes: 0, gentleUp: 0, steep: 0, vertical: 0, stepsTaken: 0, limitedSpecial: 0 }
}

function canUnitTraverseSlope(unit, transition) {
  const { category, direction } = transition
  if (category === 'flat') return true
  if (category === 'gentle') {
    if (direction === 'up') return true
    return true
  }
  if (category === 'steep') return isInfantryUnit(unit)
  if (category === 'vertical') return unitHasPropKey(unit, 'mountainTroops')
  return false
}

function slopeCountersAllow(unit, counters, fromCell, toCell) {
  const tr = slopeTransition(fromCell, toCell)
  if (!canUnitTraverseSlope(unit, tr)) return false
  const special = require('./battleSpecialTerrain')
  if (!special.specialMoveCountersAllow(unit, counters, fromCell, toCell)) return false
  if (tr.category === 'gentle' && tr.direction === 'up' && counters.gentleUp >= 1) return false
  if (tr.category === 'steep' && counters.steep >= 1) return false
  if (tr.category === 'vertical' && counters.vertical >= 1) return false
  return true
}

function ravineCountersAllow(unit, counters, fromCell, toCell) {
  const fromR = treatsAsRavineForMove(fromCell)
  const toR = treatsAsRavineForMove(toCell)
  const special = require('./battleSpecialTerrain')
  if (unitCannotCrossRavine(unit)) {
    if (toR && !special.waterCraftOnWaterCell(unit, toCell)) return false
    if (fromR && !special.waterCraftOnWaterCell(unit, fromCell)) return false
  }
  if (toR && !special.waterCraftOnWaterCell(unit, toCell)) {
    const nextRavine = fromR ? counters.ravineHexes : counters.ravineHexes + 1
    if (nextRavine > 1) return false
  }
  return true
}

function applyMoveSlopeCounters(counters, fromCell, toCell, unit) {
  const next = {
    ravineHexes: counters.ravineHexes,
    gentleUp: counters.gentleUp,
    steep: counters.steep,
    vertical: counters.vertical,
    stepsTaken: (Number(counters.stepsTaken) || 0) + 1,
    limitedSpecial: Number(counters.limitedSpecial) || 0,
  }
  const tr = slopeTransition(fromCell, toCell)
  if (tr.category === 'gentle' && tr.direction === 'up') next.gentleUp += 1
  if (tr.category === 'steep') next.steep += 1
  if (tr.category === 'vertical') next.vertical += 1
  if (treatsAsRavineForMove(toCell) && !treatsAsRavineForMove(fromCell)) next.ravineHexes += 1
  const special = require('./battleSpecialTerrain')
  if (special.stepUsesLimitedSpecialMove(unit, fromCell, toCell)) next.limitedSpecial += 1
  return next
}

function moveCountersKey(c) {
  const moved = (Number(c.stepsTaken) || 0) > 0 ? 1 : 0
  return `${c.ravineHexes}:${c.gentleUp}:${c.steep}:${c.vertical}:${moved}:${c.limitedSpecial || 0}`
}

/** +1 гекс дальности на холме: 3,2,1 → 3,3,2,1 */
function extendRangeArrayForHill(rangeArray) {
  if (!Array.isArray(rangeArray) || !rangeArray.length) return rangeArray
  return [rangeArray[0], ...rangeArray]
}

function rangeArrayForShooterOnCell(baseRangeArray, shooterCell) {
  const ra = Array.isArray(baseRangeArray) && baseRangeArray.length ? baseRangeArray : [3, 2, 1]
  if (shooterCell && isHill(shooterCell)) return extendRangeArrayForHill(ra)
  return ra.slice()
}

function elevationLoSBonusSteps(observer, target) {
  const obsE = effectiveElevationLevel(observer)
  const tgtE = effectiveElevationLevel(target)
  if (obsE <= tgtE) return 0
  const diff = obsE - tgtE
  if (diff >= 2) return 2
  if (diff >= 1) return 1
  return 0
}

function readHqZoneRadiusWithHill(unit, hqCell) {
  let r = 0
  if (unitHasPropKey(unit, 'hqZoneOfAction3')) r = 3
  else if (unitHasPropKey(unit, 'hqZoneOfAction2')) r = 2
  if (r > 0 && hqCell && isHill(hqCell)) r += 1
  return r
}

function hillMeleeDefenseBonus(defenderCell) {
  return isHill(defenderCell) ? 1 : 0
}

function hillMeleeAccuracyPenalty(targetCell) {
  return isHill(targetCell) ? 1 : 0
}

function validateMovementPath(path, unit) {
  if (!Array.isArray(path) || path.length < 2) return true
  let counters = createMoveSlopeCounters()
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]
    const to = path[i]
    if (!slopeCountersAllow(unit, counters, from, to)) return false
    if (!ravineCountersAllow(unit, counters, from, to)) return false
    if (isRavine(from) && !isRavineExitDirection(from, to) && !canUnitTraverseSlope(unit, slopeTransition(from, to))) {
      return false
    }
    const special = require('./battleSpecialTerrain')
    if (!special.canEnterElevation3(unit, to)) return false
    if (!special.waterUnitCanEnterCell(unit, to)) return false
    counters = applyMoveSlopeCounters(counters, from, to, unit)
  }
  return true
}

module.exports = {
  effectiveElevationLevel,
  isHill,
  isRavine,
  treatsAsRavineForMove,
  isBattleAirUnitType,
  unitCannotCrossRavine,
  slopeTransition,
  isRavineExitDirection,
  createMoveSlopeCounters,
  canUnitTraverseSlope,
  slopeCountersAllow,
  ravineCountersAllow,
  applyMoveSlopeCounters,
  moveCountersKey,
  extendRangeArrayForHill,
  rangeArrayForShooterOnCell,
  elevationLoSBonusSteps,
  readHqZoneRadiusWithHill,
  hillMeleeDefenseBonus,
  hillMeleeAccuracyPenalty,
  validateMovementPath,
}

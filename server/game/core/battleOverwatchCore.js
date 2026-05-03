'use strict'

function moveWarDefenseBonus(targetInstanceId, ordersByUnit) {
  const spec = ordersByUnit.get(Number(targetInstanceId))
  if (!spec) return 0
  return String(spec.orderKey || '').trim() === 'moveWar' ? 1 : 0
}

function maxShootHexDistanceForUnit(u, deps) {
  const { rangeArrayFor, fireRangeTableMode } = deps
  const ra = rangeArrayFor(u)
  const rMode = fireRangeTableMode(ra)
  return rMode === 'ranged' ? Math.max(0, ra.length - 1) : ra.length
}

function defenderSeesCellForOverwatch(allCells, defCell, stepCell, defenderUnit, deps) {
  const { hexDist, readVisionRange, isHexVisible, rangeArrayFor, fireRangeTableMode } = deps
  const d = hexDist(
    defCell.coor.x,
    defCell.coor.y,
    defCell.coor.z,
    stepCell.coor.x,
    stepCell.coor.y,
    stepCell.coor.z,
  )
  const observeLimit = Math.max(
    readVisionRange(defenderUnit),
    maxShootHexDistanceForUnit(defenderUnit, { rangeArrayFor, fireRangeTableMode }),
  )
  if (d > observeLimit) return false
  return isHexVisible(defCell, stepCell, allCells)
}

function trySteadfastnessAfterOverwatchDamage(le, ph, unit, damageDealt, deps) {
  const { getStr, getMoraleThresholdForSteadfastness, roll2d6, ensureTacticalBattle, clearDefendOnUnit } = deps
  if (damageDealt <= 0 || getStr(unit) <= 0) return
  const threshold = getMoraleThresholdForSteadfastness(unit)
  const sum = roll2d6()
  const t = ensureTacticalBattle(unit)
  t.steadfastnessUiRoll = sum
  if (threshold <= 0) return
  if (sum < threshold) {
    le(ph, `Стойкость: юнит ${unit.instanceId} — бросок ${sum} (порог ${threshold})`)
    return
  }
  t.fireSuppression = true
  clearDefendOnUnit(unit)
  le(ph, `Стойкость: юнит ${unit.instanceId} — провал ${sum} ≥ ${threshold} → подавление`)
}

module.exports = {
  moveWarDefenseBonus,
  maxShootHexDistanceForUnit,
  defenderSeesCellForOverwatch,
  trySteadfastnessAfterOverwatchDamage,
}

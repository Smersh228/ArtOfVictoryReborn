'use strict'

const { isInfantryUnit, isArmoredVehicleTarget } = require('../../core/battleUnitType')

function desantLandingHalfCombatActive(unit) {
  const t = unit?.tactical
  if (t?.desantEquipping || t?.desantEquipScheduled) return false
  return !!t?.desantHalfCombat
}

function desantHalfCombatActive(unit) {
  const t = unit?.tactical
  return !!(t?.desantHalfCombat || t?.desantEquipping)
}

function allowsDesantHalfCombatFireOrder(unit, orderKey) {
  const ok = String(orderKey || '').trim()
  if (ok !== 'fire' && ok !== 'fireHard') return false
  return desantLandingHalfCombatActive(unit)
}

/** Пехота после десанта может стрелять по «мягкой» цели на том же гексе (не по танку и не по своему ближнему оппоненту). */
function canDesantHalfCombatShootTarget(attacker, target, distanceHex) {
  const d = Number(distanceHex)
  if (!Number.isFinite(d) || d !== 0) return false
  if (!desantLandingHalfCombatActive(attacker)) return false
  if (!isInfantryUnit(attacker)) return false
  if (!target || isArmoredVehicleTarget(target)) return false
  const meleeId = Number(attacker.tactical?.meleeOpponentInstanceId)
  const tid = Number(target.instanceId)
  if (Number.isFinite(meleeId) && Number.isFinite(tid) && meleeId === tid) return false
  return true
}

function isFireDistanceOutOfRange(rangeArray, rMode, distanceHex, attacker, target) {
  const d = Number(distanceHex)
  if (canDesantHalfCombatShootTarget(attacker, target, d)) {
    return rMode === 'ranged' ? d >= rangeArray.length : false
  }
  return rMode === 'ranged' ? d < 1 || d >= rangeArray.length : d > rangeArray.length
}

function effectiveFireDistanceForAccuracy(attacker, target, distanceHex) {
  const d = Number(distanceHex)
  if (canDesantHalfCombatShootTarget(attacker, target, d)) return 1
  return d
}

function pickDesantLandingMeleeOpponent(paratrooper, enemies) {
  if (!Array.isArray(enemies) || !enemies.length) return null
  if (isInfantryUnit(paratrooper)) {
    for (let i = 0; i < enemies.length; i++) {
      if (!isArmoredVehicleTarget(enemies[i])) return enemies[i]
    }
    return null
  }
  return enemies[0]
}

module.exports = {
  desantHalfCombatActive,
  desantLandingHalfCombatActive,
  allowsDesantHalfCombatFireOrder,
  canDesantHalfCombatShootTarget,
  isFireDistanceOutOfRange,
  effectiveFireDistanceForAccuracy,
  pickDesantLandingMeleeOpponent,
}

'use strict'

function isTruckUnit(u) {
  const t = String(u.type || '').toLowerCase()
  if (t !== 'tech') return false
  return /грузовик/i.test(String(u.name || ''))
}

function isInfantryUnit(u) {
  return String(u.type || '').toLowerCase() === 'infantry'
}

function isArmoredVehicleTarget(u) {
  const t = String(u.type || '').toLowerCase()
  return t === 'tech' || t === 'armor' || t === 'lighttank' || t === 'mediumtank' || t === 'heavytank'
}

function isArtilleryUnit(u) {
  return String(u.type || '').toLowerCase() === 'artillery'
}

function isArtilleryDeployedForBattle(u) {
  return isArtilleryUnit(u) && u.tactical && u.tactical.artilleryDeployed === true
}

function isArtilleryFireTargetCellAllowed(attacker, targetCellId) {
  if (!isArtilleryUnit(attacker)) return true
  const t = attacker.tactical || {}
  if (!t.artilleryFireSector) return true
  const arr = attacker.defendSectorCellIds
  if (!Array.isArray(arr) || !arr.length) return true
  const cid = Number(targetCellId)
  return arr.some((id) => Number(id) === cid)
}

function clearArtillerySectorGeometry(unit) {
  if (!unit) return
  delete unit.defendFacingCellId
  delete unit.defendMaxRangeSteps
  delete unit.defendSectorCellIds
  if (unit.tactical && typeof unit.tactical === 'object') delete unit.tactical.artilleryFireSector
}

function unitHasPropKey(u, key) {
  const props = u.properties
  if (!Array.isArray(props)) return false
  const want = String(key || '').trim()
  if (!want) return false
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    if (p && typeof p === 'object' && String(p.prop_key || '').trim() === want) return true
  }
  return false
}

function artilleryAreaClosedIgnoresTerrainLos(u) {
  return (
    isArtilleryUnit(u) &&
    unitHasPropKey(u, 'areaFire') &&
    unitHasPropKey(u, 'concealedTargetFire')
  )
}

function isArtilleryCollapsedForTow(u) {
  if (!isArtilleryUnit(u)) return false
  const t = u.tactical
  if (!t) return true
  return t.artilleryDeployed !== true
}

module.exports = {
  isTruckUnit,
  isInfantryUnit,
  isArmoredVehicleTarget,
  isArtilleryUnit,
  isArtilleryDeployedForBattle,
  isArtilleryFireTargetCellAllowed,
  clearArtillerySectorGeometry,
  unitHasPropKey,
  artilleryAreaClosedIgnoresTerrainLos,
  isArtilleryCollapsedForTow,
}

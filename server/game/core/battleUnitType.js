'use strict'

function isTruckUnit(u) {
  if (String(u && u.type ? u.type : '').toLowerCase() === 'tech' && unitHasPropKey(u, 'railwayDetachment')) {
    return false
  }
  const t = String(u.type || '').toLowerCase()
  if (t !== 'tech') return false
  if (/грузовик|truck|lkw/i.test(String(u.name || ''))) return true
  const orders = u.orders
  if (!Array.isArray(orders)) return false
  return orders.some((o) => {
    const k = String((o && (o.order_key || o.key)) || '')
      .trim()
      .toLowerCase()
    return k === 'getsup' || k === 'loadingsup' || k === 'loading' || k === 'tow' || k === 'unloading'
  })
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

/** Свойство каталога «Сектор стрельбы» (fireSector): огонь только внутри сектора при развёртывании. */
function artilleryUsesFireSectorProperty(u) {
  return isArtilleryUnit(u) && unitHasPropKey(u, 'fireSector')
}

function isArtilleryFireTargetCellAllowed(attacker, targetCellId) {
  if (!isArtilleryUnit(attacker)) return true
  if (!isArtilleryDeployedForBattle(attacker)) return true
  if (!artilleryUsesFireSectorProperty(attacker)) return true
  const arr = attacker.defendSectorCellIds
  if (!Array.isArray(arr) || !arr.length) return false
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
  artilleryUsesFireSectorProperty,
  isArtilleryFireTargetCellAllowed,
  clearArtillerySectorGeometry,
  unitHasPropKey,
  artilleryAreaClosedIgnoresTerrainLos,
  isArtilleryCollapsedForTow,
}

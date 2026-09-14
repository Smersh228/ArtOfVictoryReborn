'use strict'

function unitTypeKey(u) {
  return String(u && u.type ? u.type : '').toLowerCase()
}

function isTruthyFlag(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function unitHasLogisticsOrder(u) {
  const orders = u && u.orders
  if (!Array.isArray(orders)) return false
  return orders.some((o) => {
    const k = String((o && (o.order_key || o.key)) || '')
      .trim()
      .toLowerCase()
    return k === 'getsup' || k === 'loadingsup' || k === 'loading' || k === 'tow' || k === 'unloading'
  })
}

/** Грузовик / бронетранспортёр: техника или бронетехника, не поезд. */
function isTransportChassisType(u) {
  const t = unitTypeKey(u)
  return t === 'tech' || t === 'armor'
}

function isTruckUnit(u) {
  if (!u) return false
  if (unitHasPropKey(u, 'railwayDetachment')) return false
  if (!isTransportChassisType(u)) return false
  if (/грузовик|truck|lkw/i.test(String(u.name || ''))) return true
  return unitHasLogisticsOrder(u)
}

function isHeavyTechUnit(u) {
  return isTruthyFlag(u && (u.heavyTech ?? u.heavy_tech))
}

function isHeavyArtilleryUnit(u) {
  return isTruthyFlag(u && (u.heavyArtillery ?? u.heavy_artillery))
}

/** Лёгкая техника буксирует только лёгкую артиллерию; тяжёлая — любую. */
function canTechTowArtillery(truck, artillery) {
  if (!isArtilleryUnit(artillery)) return false
  if (isHeavyTechUnit(truck)) return true
  return !isHeavyArtilleryUnit(artillery)
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

function unitUsesFireSectorProperty(u) {
  return unitHasPropKey(u, 'fireSector')
}

function unitUsesAreaFire(u) {
  return unitHasPropKey(u, 'areaFire')
}

/** Развёртывание / сектор орудия: артиллерия или любой тип со свойством «Сектор стрельбы». */
function unitUsesGunDeploy(u) {
  return isArtilleryUnit(u) || unitUsesFireSectorProperty(u)
}

function isArtilleryDeployedForBattle(u) {
  return unitUsesGunDeploy(u) && u.tactical && u.tactical.artilleryDeployed === true
}

/** Свойство каталога «Сектор стрельбы» (fireSector): огонь только внутри сектора. */
function artilleryUsesFireSectorProperty(u) {
  return unitUsesFireSectorProperty(u)
}

function isArtilleryFireTargetCellAllowed(attacker, targetCellId) {
  if (!unitUsesFireSectorProperty(attacker)) return true
  const arr = attacker.defendSectorCellIds
  if (Array.isArray(arr) && arr.length) {
    const cid = Number(targetCellId)
    return arr.some((id) => Number(id) === cid)
  }
  return false
}

function clearArtillerySectorGeometry(unit) {
  if (!unit) return
  delete unit.defendFacingCellId
  delete unit.defendMaxRangeSteps
  delete unit.defendSectorCellIds
  if (unit.tactical && typeof unit.tactical === 'object') delete unit.tactical.artilleryFireSector
}

const PROP_KEY_NAME_ALIASES = {
  waterUnit: ['водный юнит'],
  crossingAWaterObstacle: ['преодоление водной преграды'],
  movementThroughTheSwamp: ['преодоление болота'],
}

function unitHasOrderKey(u, key) {
  const orders = u && u.orders
  if (!Array.isArray(orders)) return false
  const want = String(key || '')
    .trim()
    .toLowerCase()
  if (!want) return false
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    const k = String((o && (o.order_key || o.key)) || '')
      .trim()
      .toLowerCase()
    if (k === want) return true
  }
  return false
}

function unitHasPropKey(u, key) {
  const props = u && u.properties
  if (!Array.isArray(props)) return false
  const want = String(key || '').trim()
  if (!want) return false
  const nameAliases = PROP_KEY_NAME_ALIASES[want] || []
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    if (typeof p === 'string' && p.trim() === want) return true
    if (!p || typeof p !== 'object') continue
    const pk = String(p.prop_key || p.key || p.propKey || '').trim()
    if (pk === want) return true
    const nm = String(p.name || '')
      .trim()
      .toLowerCase()
    if (nameAliases.includes(nm)) return true
  }
  return false
}

function artilleryAreaClosedIgnoresTerrainLos(u) {
  return unitUsesAreaFire(u) && unitHasPropKey(u, 'concealedTargetFire')
}

function unitOrderUsesAreaHexFire(u, order) {
  if (unitUsesAreaFire(u)) return true
  return !!(order && order.useReactiveFire)
}

function isArtilleryCollapsedForTow(u) {
  if (!isArtilleryUnit(u)) return false
  const t = u.tactical
  if (!t) return true
  return t.artilleryDeployed !== true
}

module.exports = {
  isTruckUnit,
  isTransportChassisType,
  isHeavyTechUnit,
  isHeavyArtilleryUnit,
  canTechTowArtillery,
  isInfantryUnit,
  isArmoredVehicleTarget,
  isArtilleryUnit,
  unitUsesFireSectorProperty,
  unitUsesAreaFire,
  unitUsesGunDeploy,
  isArtilleryDeployedForBattle,
  artilleryUsesFireSectorProperty,
  isArtilleryFireTargetCellAllowed,
  clearArtillerySectorGeometry,
  unitHasPropKey,
  unitHasOrderKey,
  artilleryAreaClosedIgnoresTerrainLos,
  unitOrderUsesAreaHexFire,
  isArtilleryCollapsedForTow,
}

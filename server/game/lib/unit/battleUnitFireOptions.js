'use strict'

const { normalizeFireObject, splitNums, targetTypeToFireKey } = require('../fire/battleFireNormalize')
const { isInfantryUnit, isArmoredVehicleTarget } = require('../../core/battleUnitType')

function fireRangeTableMode(rangeArray) {
  return rangeArray.length >= 2 ? 'ranged' : 'direct'
}

function rangeArrayFromUnit(unit) {
  if (!unit) return []
  const fp = unit.fireParsed || normalizeFireObject(unit._fireRaw || unit.fire)
  const ra = fp.range || []
  if (!Array.isArray(ra) || !ra.length) return [3, 2, 1]
  return ra.map((x) => Number(x) || 0)
}

function unitCanUseRangedFireOrders(unit) {
  const ra = rangeArrayFromUnit(unit)
  if (!ra.length) return false
  if (fireRangeTableMode(ra) === 'ranged') {
    for (let d = 1; d < ra.length; d++) {
      if (Number(ra[d]) > 0) return true
    }
    return false
  }
  return Number(ra[0]) > 0
}

/** Блок «Огонь» / «Огонь на подавление», если на всех дистанциях меткость 0. */
function unitHasMeleeOnlyFireRowOptions(unit) {
  return !unitCanUseRangedFireOrders(unit)
}

function fireRowOptionsOf(unit, useReactiveFire) {
  const raw = useReactiveFire || unit?._useReactiveFire ? unit.fireRowOptionsReactive : unit.fireRowOptions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw
}

function fireSourceForRowIntensity(unit, useReactiveFire) {
  if (useReactiveFire || unit?._useReactiveFire) {
    if (unit.fireReactive && typeof unit.fireReactive === 'object') return unit.fireReactive
  }
  if (unit._fireRaw && typeof unit._fireRaw === 'object') return unit._fireRaw
  if (unit.fire && typeof unit.fire === 'object') return unit.fire
  if (unit.fireParsed && typeof unit.fireParsed === 'object') return unit.fireParsed
  return null
}

/** Пехота стреляет по броне/танкам, если в строке типа IO > 0 и нет «ближний бой». Из ДОТ — по таблице ДОТ (пушка/ПТО как артиллерия). */
function infantryCanRangedFireAtTarget(unit, target, useReactiveFire) {
  if (!isInfantryUnit(unit)) return true
  if (!isArmoredVehicleTarget(target)) return true
  const key = targetTypeToFireKey(target && target.type)
  const opts = fireRowOptionsOf(unit, useReactiveFire)
  if (opts && opts[key] && opts[key].melee === true) return false
  const src = fireSourceForRowIntensity(unit, useReactiveFire)
  const raw = src ? src[key] : null
  const hasRangedIo = splitNums(raw).some((n) => n > 0)
  if (unit.tactical && unit.tactical.inDot) {
    const dotMod = require('../map/battleDot')
    if (dotMod.unitDotExiting(unit)) return false
    if (!hasRangedIo) return false
    const { isArtilleryUnit } = require('../../core/battleUnitType')
    const arr = dotMod.dotIntensityArrayFor(unit, target, isInfantryUnit, isArtilleryUnit)
    return !!(arr && arr.some((n) => Number(n) > 0))
  }
  return hasRangedIo
}

module.exports = {
  unitCanUseRangedFireOrders,
  unitHasMeleeOnlyFireRowOptions,
  infantryCanRangedFireAtTarget,
}

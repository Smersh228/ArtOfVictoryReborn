'use strict'

const { normalizeFireObject } = require('../fire/battleFireNormalize')

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

module.exports = {
  unitCanUseRangedFireOrders,
  unitHasMeleeOnlyFireRowOptions,
}

'use strict'

const { hexDistCells } = require('../map/battleHexGeometry')

function areaFireHitsForTargetByOrder(totalHitSuccesses, targetIndex, isClosedFire) {
  const hits = Math.max(0, Number(totalHitSuccesses) || 0)
  const idx = Math.max(0, Number(targetIndex) || 0)
  let divisor = 2.5
  if (idx === 0) divisor = isClosedFire ? 1.5 : 1
  else if (idx === 1) divisor = 2
  return Math.max(0, Math.ceil(hits / divisor))
}

function areaFireDiceForTargetByOrder(totalDiceCount, targetIndex, isClosedFire) {
  const dice = Math.max(0, Number(totalDiceCount) || 0)
  const idx = Math.max(0, Number(targetIndex) || 0)
  let divisor = 2.5
  if (idx === 0) divisor = isClosedFire ? 1.5 : 1
  else if (idx === 1) divisor = 2
  return Math.max(0, Math.ceil(dice / divisor))
}

/** Меткость из таблицы дальности без бонусов местности (0 = мёртвая зона). */
function tableAccuracyAtDistance(rangeArray, distanceHex) {
  const ra = Array.isArray(rangeArray) ? rangeArray : []
  const d = Number(distanceHex)
  if (!Number.isFinite(d)) return 0
  if (ra.length >= 2) {
    if (d < 1 || d >= ra.length) return 0
    const v = Number(ra[d])
    return Number.isFinite(v) ? v : 0
  }
  const index = d - 1
  if (index >= 0 && index < ra.length) {
    const v = Number(ra[index])
    return Number.isFinite(v) ? v : 0
  }
  return 0
}

/** Ромашка: центр и соседи. Мёртвая зона только у точки прицеливания. */
function collectDaisyImpactCells(centerCell, cells) {
  const out = []
  if (!centerCell || !Array.isArray(cells)) return out
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (hexDistCells(centerCell, c) > 1) continue
    out.push(c)
  }
  return out
}

module.exports = {
  areaFireHitsForTargetByOrder,
  areaFireDiceForTargetByOrder,
  tableAccuracyAtDistance,
  collectDaisyImpactCells,
}

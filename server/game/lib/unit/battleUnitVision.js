'use strict'

function readVisionRange(u) {
  if (u && u.tactical && u.tactical.fireSuppression) return 1
  const n = Number(u.vis ?? u.visible ?? u.visibleRange)
  return Number.isFinite(n) && n > 0 ? n : 6
}

module.exports = {
  readVisionRange,
}

'use strict'

const { applyVisionPenalty } = require('../scenario/battleEnvironment')

function readVisionRange(u) {
  if (u && u.tactical && u.tactical.fireSuppression) return applyVisionPenalty(1)
  const n = Number(u.vis ?? u.visible ?? u.visibleRange)
  const base = Number.isFinite(n) && n > 0 ? n : 6
  return applyVisionPenalty(base)
}

module.exports = {
  readVisionRange,
}

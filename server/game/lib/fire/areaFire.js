'use strict'

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

module.exports = {
  areaFireHitsForTargetByOrder,
  areaFireDiceForTargetByOrder,
}

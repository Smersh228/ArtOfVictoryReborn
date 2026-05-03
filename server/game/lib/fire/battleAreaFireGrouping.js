'use strict'

function ensureGroupedAreaFireBucket(groupedAreaFire, areaKey, shooterId, rollResults, isSuppression, ammoCost) {
  const key = Number(areaKey)
  const bucket = groupedAreaFire.get(key) || {
    targetCellId: key,
    shooterIds: [],
    rollResults: [],
    isSuppression: !!isSuppression,
    ammoCost,
    perTarget: new Map(),
  }
  bucket.shooterIds.push(Number(shooterId))
  bucket.rollResults.push(...(Array.isArray(rollResults) ? rollResults : []))
  groupedAreaFire.set(key, bucket)
  return bucket
}

module.exports = { ensureGroupedAreaFireBucket }

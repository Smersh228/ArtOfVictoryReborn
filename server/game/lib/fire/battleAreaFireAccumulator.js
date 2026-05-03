'use strict'

function accumulateAreaFireForShooter({
  atk,
  targets,
  targetCell,
  distance,
  rangeArray,
  isSup,
  artilleryClosed,
  groupedArea,
  cells,
  ordersByUnit,
  le,
  ph,
  findUnitOnField,
  getStr,
  isAmbushConcealed,
  clearAmbushOrderFully,
  computeShootSalvoCore,
  areaFireHitsForTargetByOrder,
  areaFireDiceForTargetByOrder,
}) {
  for (let ti = 0; ti < targets.length; ti++) {
    const tid = Number(targets[ti].instanceId)
    const defSpotNow = findUnitOnField(cells, tid)
    if (!defSpotNow || getStr(defSpotNow.unit) <= 0) continue
    const tgtU = defSpotNow.unit
    const hadAmbush = isAmbushConcealed(tgtU)
    const salvoTarget = computeShootSalvoCore(
      atk.unit,
      tgtU,
      targetCell,
      distance,
      rangeArray,
      isSup,
      undefined,
      artilleryClosed,
      1,
    )
    const hits = areaFireHitsForTargetByOrder(salvoTarget.hitSuccesses, ti, artilleryClosed)
    if (hadAmbush && clearAmbushOrderFully(tgtU)) {
      le(ph, `Засада снята: юнит ${tgtU.instanceId} (обстрел)`, {
        unitInstanceId: Number(tgtU.instanceId),
        ambushCleared: true,
      })
    }
    const dice = areaFireDiceForTargetByOrder(
      Array.isArray(salvoTarget.rollResults) ? salvoTarget.rollResults.length : 0,
      ti,
      artilleryClosed,
    )
    const misses = Math.max(0, dice - hits)
    const rollResults = Array.isArray(salvoTarget.rollResults) ? salvoTarget.rollResults.slice(0, dice) : []
    const prev = groupedArea.perTarget.get(tid) || { hits: 0, misses: 0, rollResults: [] }
    prev.hits += hits
    prev.misses += misses
    prev.rollResults.push(...rollResults)
    groupedArea.perTarget.set(tid, prev)
  }
}

module.exports = { accumulateAreaFireForShooter }

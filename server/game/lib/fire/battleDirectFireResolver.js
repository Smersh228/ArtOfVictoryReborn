'use strict'

function resolveGroupedDirectFire({
  groupedDirectFire,
  cells,
  findUnitOnField,
  getStr,
  moveWarDefenseBonus,
  ordersByUnit,
  terrainDefenseBonusFromCell,
  getDef,
  isSup,
  ammoCost,
  le,
  ph,
  setStr,
  logUnitDestroyed,
  isTruckUnit,
  applyCargoDamageFromTruckHit,
  sweepCorpses,
  clearAmbushOrderFully,
  steadfastnessQueue,
  maybeDefenderReturnFireAgainstShooter,
  sectorAggression,
  sectorReturnFired,
}) {
  for (const grouped of groupedDirectFire.values()) {
    const defLive = findUnitOnField(cells, grouped.targetId)
    if (!defLive || getStr(defLive.unit) <= 0) continue
    const warDefGrouped = moveWarDefenseBonus(defLive.unit.instanceId, ordersByUnit)
    const terrainDefGrouped = terrainDefenseBonusFromCell(defLive.cell, defLive.unit)
    const defenseGrouped = getDef(defLive.unit) + warDefGrouped + terrainDefGrouped
    const totalHitsGrouped = Math.max(0, Number(grouped.totalHits) || 0)
    const totalDamageGrouped = Math.max(0, totalHitsGrouped - defenseGrouped)
    const tagGrouped = warDefGrouped ? ' [бой +1 З]' : ''
    le(
      ph,
      `Суммарный огонь: ${grouped.shooterIds.join('+')} → ${grouped.targetId}, попаданий ${totalHitsGrouped}, защита ${defenseGrouped}, урон ${totalDamageGrouped}${tagGrouped}`,
      {
        fireLine: {
          attackerId: grouped.shooterIds[0],
          targetId: grouped.targetId,
          fromCellId: undefined,
          targetCellId: grouped.targetCellId,
          hits: totalHitsGrouped,
          damages: totalDamageGrouped,
          rollResults: grouped.rollResults,
          warDef: !!warDefGrouped,
          isSuppression: !!isSup,
          baseDiceCount: grouped.rollResults.length,
          diceCount: grouped.rollResults.length,
          ammoCost,
          groupedFire: true,
          shooterIds: grouped.shooterIds,
          accuracies: Array.isArray(grouped.accuracies) ? grouped.accuracies : [],
        },
      },
    )
    const prevGroupedDefStr = getStr(defLive.unit)
    setStr(defLive.unit, prevGroupedDefStr - totalDamageGrouped)
    logUnitDestroyed(le, ph, defLive.unit, prevGroupedDefStr, 'суммарный огонь', defLive.cell?.id)
    if (isTruckUnit(defLive.unit)) applyCargoDamageFromTruckHit(cells, defLive.unit, totalDamageGrouped)
    sweepCorpses(cells)
    const defAfter = findUnitOnField(cells, grouped.targetId)
    if (
      grouped.hadAmbushDirect &&
      defAfter &&
      getStr(defAfter.unit) > 0 &&
      clearAmbushOrderFully(defAfter.unit)
    ) {
      le(ph, `Засада снята: юнит ${defAfter.unit.instanceId} (обстрел)`, {
        unitInstanceId: Number(defAfter.unit.instanceId),
        ambushCleared: true,
      })
    }
    if (defAfter && getStr(defAfter.unit) > 0 && totalDamageGrouped > 0) {
      steadfastnessQueue.push({ id: grouped.targetId, dmg: totalDamageGrouped })
    }
    if (defAfter && getStr(defAfter.unit) > 0 && grouped.shooterIds.length > 0) {
      maybeDefenderReturnFireAgainstShooter(
        cells,
        Number(grouped.shooterIds[0]),
        grouped.targetId,
        ordersByUnit,
        le,
        ph,
        steadfastnessQueue,
        sectorAggression,
        sectorReturnFired,
        grouped.targetCellId,
      )
    }
    sweepCorpses(cells)
  }
}

module.exports = { resolveGroupedDirectFire }

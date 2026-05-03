'use strict'

function resolveGroupedAreaFire({
  groupedAreaFire,
  cells,
  findUnitOnField,
  getStr,
  moveWarDefenseBonus,
  ordersByUnit,
  areaFireDamageFromSalvo,
  setStr,
  logUnitDestroyed,
  isTruckUnit,
  applyCargoDamageFromTruckHit,
  sweepCorpses,
  steadfastnessQueue,
  maybeDefenderReturnFireAgainstShooter,
  maybeAllDefendersReturnFireForAreaImpactCell,
  le,
  ph,
  sectorAggression,
  sectorReturnFired,
  ammoCost,
}) {
  for (const groupedArea of groupedAreaFire.values()) {
    const areaRows = []
    const shooterIds = Array.isArray(groupedArea.shooterIds) ? groupedArea.shooterIds : []
    const firstShooterId = Number(shooterIds[0])
    const targetCellId = Number(groupedArea.targetCellId)
    const targetCell = cells.find((c) => Number(c.id) === targetCellId)
    for (const [tid, rec] of groupedArea.perTarget.entries()) {
      const defLive = findUnitOnField(cells, tid)
      if (!defLive || getStr(defLive.unit) <= 0) continue
      const warDef = moveWarDefenseBonus(defLive.unit.instanceId, ordersByUnit)
      const dmg = areaFireDamageFromSalvo(rec.hits, defLive.unit, targetCell || defLive.cell, warDef)
      const prevStr = getStr(defLive.unit)
      setStr(defLive.unit, prevStr - dmg)
      logUnitDestroyed(le, ph, defLive.unit, prevStr, 'огонь по площади', targetCellId)
      if (isTruckUnit(defLive.unit)) applyCargoDamageFromTruckHit(cells, defLive.unit, dmg)
      sweepCorpses(cells)
      const defAfter = findUnitOnField(cells, tid)
      if (defAfter && getStr(defAfter.unit) > 0 && dmg > 0) {
        steadfastnessQueue.push({ id: tid, dmg })
      }
      if (defAfter && getStr(defAfter.unit) > 0 && Number.isFinite(firstShooterId)) {
        maybeDefenderReturnFireAgainstShooter(
          cells,
          firstShooterId,
          tid,
          ordersByUnit,
          le,
          ph,
          steadfastnessQueue,
          sectorAggression,
          sectorReturnFired,
          targetCellId,
        )
      }
      areaRows.push({
        tidArea: Number(tid),
        dmgArea: dmg,
        warDefArea: !!warDef,
        hitsArea: rec.hits,
        missArea: rec.misses,
        rollsArea: rec.rollResults,
      })
    }
    if (!areaRows.length) continue
    if (Number.isFinite(firstShooterId)) {
      maybeAllDefendersReturnFireForAreaImpactCell(
        cells,
        firstShooterId,
        targetCellId,
        ordersByUnit,
        le,
        ph,
        steadfastnessQueue,
        sectorAggression,
        sectorReturnFired,
      )
    }
    const seg = areaRows.map((r) => `${r.tidArea}: урон ${r.dmgArea}`).join('; ')
    const anyWar = areaRows.some((r) => r.warDefArea)
    const totalDmg = areaRows.reduce((s, r) => s + r.dmgArea, 0)
    const totalHits = areaRows.reduce((s, r) => s + (Number(r.hitsArea) || 0), 0)
    le(
      ph,
      `Суммарный огонь по площади: ${shooterIds.join('+')} → кл. ${targetCellId} · попаданий ${totalHits}, ${seg} (выпало: ${groupedArea.rollResults.join(',')})${anyWar ? ' [бой +1 З]' : ''}`,
      {
        fireLine: {
          attackerId: Number(shooterIds[0]),
          targetId: areaRows[0].tidArea,
          fromCellId: undefined,
          targetCellId,
          hits: totalHits,
          damages: totalDmg,
          rollResults: groupedArea.rollResults,
          warDef: anyWar,
          isSuppression: !!groupedArea.isSuppression,
          baseDiceCount: groupedArea.rollResults.length,
          diceCount: groupedArea.rollResults.length,
          ammoCost,
          groupedAreaFire: true,
          shooterIds,
          areaTargets: areaRows.map((r) => ({
            targetId: r.tidArea,
            damages: r.dmgArea,
            warDef: r.warDefArea,
            hits: r.hitsArea,
            misses: r.missArea,
            rollResults: r.rollsArea,
          })),
        },
      },
    )
  }
}

module.exports = { resolveGroupedAreaFire }

'use strict'

const trench = require('../map/battleTrench')
const dotMod = require('../map/battleDot')
const structureHp = require('../map/battleStructureHp')

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
  ensureTacticalBattle,
}) {
  for (const groupedArea of groupedAreaFire.values()) {
    const areaRows = []
    const shooterIds = Array.isArray(groupedArea.shooterIds) ? groupedArea.shooterIds : []
    const firstShooterId = Number(shooterIds[0])
    const targetCellId = Number(groupedArea.targetCellId)
    const targetCell = cells.find((c) => Number(c.id) === targetCellId)
    const structHits = Math.max(0, Math.floor(Number(groupedArea.structureHits) || 0))
    const structAttempted = groupedArea.structureAttempted === true || structHits > 0
    if (targetCell && structAttempted) {
      const structRolls = Array.isArray(groupedArea.structureRolls) ? groupedArea.structureRolls : []
      const firstShooter = findUnitOnField(cells, firstShooterId)
      const fireLine = {
        attackerId: Number.isFinite(firstShooterId) ? firstShooterId : null,
        targetId: null,
        fromCellId: firstShooter && firstShooter.cell ? firstShooter.cell.id : undefined,
        targetCellId,
        hits: structHits,
        damages: structHits,
        rollResults: structRolls,
        isSuppression: !!groupedArea.isSuppression,
        baseDiceCount: structRolls.length,
        diceCount: structRolls.length,
        ammoCost,
        groupedAreaFire: true,
        shooterIds,
      }
      const dotDeps = {
        findUnitOnField,
        ensureTacticalBattle,
        logUnitDestroyed,
        skipLog: true,
      }
      if (dotMod.hasDotOnCell(targetCell.builds)) {
        const prevDef = dotMod.getDotDef(targetCell.builds)
        if (structHits > 0) {
          dotMod.applyDotDefDamage(cells, targetCell, structHits, le, ph, dotDeps)
        }
        const destroyed = !dotMod.hasDotOnCell(targetCell.builds)
        const nowDef = destroyed ? 0 : dotMod.getDotDef(targetCell.builds)
        le(
          ph,
          destroyed
            ? `ДОТ на кл. ${targetCell.id} уничтожен (огонь)`
            : `Огонь по ДОТ: ${shooterIds.join('+')} → кл. ${targetCell.id}, попаданий ${structHits}, защита ${prevDef}→${nowDef} (выпало: ${structRolls.join(',')})`,
          {
            structureHp: true,
            structureKind: 'dot',
            structureCellId: Number(targetCell.id),
            structureDef: nowDef,
            structureDestroyed: destroyed,
            fireLine,
          },
        )
      }
      if (structureHp.isShootableStructureCell(targetCell)) {
        const applied = structureHp.applyStructureHits(cells, targetCell, structHits, le, ph, {
          fireLine,
          logUnitDestroyed,
        })
        if (!(applied && applied.applied)) {
          const hp = structureHp.readHp(targetCell) || structureHp.ensureStructureHp(targetCell)
          le(
            ph,
            `Огонь по сооружению: кл. ${targetCell.id} (${hp && hp.kind ? hp.kind : 'сооружение'}) попаданий ${structHits}`,
            {
              structureHp: true,
              structureKind: hp && hp.kind,
              structureCellId: Number(targetCell.id),
              structureDef: hp && hp.def,
              structureStr: hp && hp.str,
              structureDestroyed: false,
              fireLine,
            },
          )
        }
      }
    }
    for (const [tid, rec] of groupedArea.perTarget.entries()) {
      const defLive = findUnitOnField(cells, tid)
      if (!defLive || getStr(defLive.unit) <= 0) continue
      const warDef = moveWarDefenseBonus(defLive.unit.instanceId, ordersByUnit)
      const cover = trench.unitCoverDefenseBonus(defLive.unit, targetCell || defLive.cell, defLive.cell)
      const dmg = areaFireDamageFromSalvo(rec.hits, defLive.unit, targetCell || defLive.cell, warDef + cover)
      const prevStr = getStr(defLive.unit)
      setStr(defLive.unit, prevStr - dmg)
      logUnitDestroyed(le, ph, defLive.unit, prevStr, 'огонь по площади', targetCellId)
      if (isTruckUnit(defLive.unit)) applyCargoDamageFromTruckHit(cells, defLive.unit, dmg)
      sweepCorpses(cells)
      const defAfter = findUnitOnField(cells, tid)
      if (defAfter && getStr(defAfter.unit) > 0) {
        if (dmg > 0) {
          steadfastnessQueue.push({ id: tid, dmg })
        } else if (groupedArea.isSuppression) {
          steadfastnessQueue.push({ id: tid, dmg: 0, fromSuppressionFire: true })
        }
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
    const orderKey = groupedArea.airOrderKey || null
    const strikeLabel =
      orderKey === 'attackAir'
        ? 'Штурмовка'
        : orderKey === 'bombardment'
          ? 'Бомбардировка'
          : 'Суммарный огонь по площади'
    const adjTag = groupedArea.fireAdjustment ? ' [корректировка огня]' : ''
    const seg = areaRows.map((r) => `${r.tidArea}: урон ${r.dmgArea}`).join('; ')
    const anyWar = areaRows.some((r) => r.warDefArea)
    const totalDmg = areaRows.reduce((s, r) => s + r.dmgArea, 0)
    const totalHits = areaRows.reduce((s, r) => s + (Number(r.hitsArea) || 0), 0)
    const fromDotShooterIds = shooterIds
      .map((id) => Number(id))
      .filter((id) => {
        if (!Number.isFinite(id)) return false
        const sh = findUnitOnField(cells, id)
        return !!(sh && dotMod.dotShooterUsesDotAmmo(sh.unit))
      })
    const fromDotCellIds = fromDotShooterIds
      .map((id) => {
        const sh = findUnitOnField(cells, id)
        const cid = Number(sh && sh.cell && sh.cell.id)
        return Number.isFinite(cid) ? cid : null
      })
      .filter((id) => id != null)
    const firstShooter = findUnitOnField(cells, firstShooterId)
    le(
      ph,
      `${strikeLabel}: ${shooterIds.join('+')} → кл. ${targetCellId} · попаданий ${totalHits}, ${seg} (выпало: ${groupedArea.rollResults.join(',')})${anyWar ? ' [бой +1 З]' : ''}${adjTag}`,
      {
        fireLine: {
          attackerId: Number(shooterIds[0]),
          targetId: areaRows[0].tidArea,
          fromCellId: firstShooter ? firstShooter.cell.id : undefined,
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
          airOrderKey: orderKey || undefined,
          fromDot: fromDotShooterIds.length > 0,
          fromDotShooterIds,
          fromDotCellIds,
          fireAdjustment: !!groupedArea.fireAdjustment,
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

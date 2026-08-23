'use strict'

const { terrainAccuracyBonusFromCell } = require('../lib/map/battleTerrain')
const {
  resolveArtilleryFireVisibility,
  canShooterUseFireAdjustmentOrder,
} = require('../lib/fire/battleFireAdjustment')
const desantCombat = require('../lib/air/battleDesantCombat')
const { isInfantryUnit, isArmoredVehicleTarget } = require('../core/battleUnitType')
const { tryDestroyBarbedWireFromFire } = require('../lib/map/battleWireEdges')
const dotMod = require('../lib/map/battleDot')

function infantryAreaFireTargetsOrSkip(atk, targetsAll, le, ph) {
  if (!isInfantryUnit(atk.unit)) return targetsAll
  const soft = targetsAll.filter((t) => !isArmoredVehicleTarget(t))
  if (desantCombat.desantHalfCombatActive(atk.unit)) {
    if (!soft.length) {
      le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
      return null
    }
    return soft
  }
  for (let ti = 0; ti < targetsAll.length; ti++) {
    if (isArmoredVehicleTarget(targetsAll[ti])) {
      le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
      return null
    }
  }
  return targetsAll
}

function processFirePhase(
  cells,
  list,
  ordersByUnit,
  le,
  ph,
  steadfastnessQueue,
  sectorAggression,
  sectorReturnFired,
  deps,
) {
  const {
    PHASE_KEYS,
    findUnitOnField,
    validateArtilleryAreaFireOnCellOnly,
    countOpposingHostilesOnCell,
    setAmmo,
    getAmmo,
    collectOpposingHostilesOnCell,
    isInfantryUnit,
    isArmoredVehicleTarget,
    isAmbushConcealed,
    canSpotAmbushTarget,
    hexDist,
    rangeArrayFor,
    rangeArrayForAtCell,
    fireRangeTableMode,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
    unitHasPropKey,
    computeShootSalvoCore,
    clearAmbushOrderFully,
    ensureGroupedAreaFireBucket,
    accumulateAreaFireForShooter,
    getStr,
    areaFireHitsForTargetByOrder,
    areaFireDiceForTargetByOrder,
    opposing,
    unitFaction,
    isArtilleryUnit,
    isArtilleryDeployedForBattle,
    isArtilleryFireTargetCellAllowed,
    intensityArrayFor,
    moveWarDefenseBonus,
    computeShoot,
    resolveGroupedAreaFire,
    areaFireDamageFromSalvo,
    setStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
    maybeDefenderReturnFireAgainstShooter,
    maybeAllDefendersReturnFireForAreaImpactCell,
    resolveGroupedDirectFire,
    terrainDefenseBonusFromCell,
    getDef,
  } = deps

  const isSup = ph === PHASE_KEYS.fireHard
  const ammoCost = isSup ? 3 : 1
  const groupedDirectFire = new Map()
  const groupedAreaFire = new Map()
  const fireAdjUsedByFaction = Object.create(null)
  const visDeps = {
    unitHasPropKey,
    isArtilleryUnit,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
  }
  const dotFireDeps = {
    intensityArrayFor,
    rangeArrayForAtCell,
    computeShoot,
    cells,
    findUnitOnField,
    ensureTacticalBattle: deps.ensureTacticalBattle,
  }
  function shooterHasAmmo(atk, cost) {
    return dotMod.shooterHasAmmoForFire(atk, cost, getAmmo)
  }
  function deductShooterAmmo(atk, cost) {
    dotMod.deductShooterAmmoForFire(atk, cost, isSup, getAmmo, setAmmo)
  }
  function tryDotFireDamage(targetCell, attacker, shooterCell, distance) {
    dotMod.tryDamageDotFromFire(targetCell, attacker, shooterCell, distance, dotFireDeps, le, ph)
  }
  for (const o of list) {
    const atk = findUnitOnField(cells, o.unitId)
    if (!atk) continue
    if (!dotMod.dotShooterCanFire(atk.unit)) {
      le(ph, `Юнит ${atk.unit.instanceId}: выход из ДОТ — огонь недоступен`)
      continue
    }
    const tidRaw = o.targetUnitInstanceId
    const tcidRaw = o.targetCellId
    const tidHas = tidRaw != null && Number.isFinite(Number(tidRaw))
    const tcidHas = tcidRaw != null && Number.isFinite(Number(tcidRaw))
    if (!tidHas && tcidHas) {
      const okOrder = isSup ? 'fireHard' : 'fire'
      const errCell = validateArtilleryAreaFireOnCellOnly(cells, atk, Number(tcidRaw), okOrder, {
        useFireAdjustment: !!o.useFireAdjustment,
      })
      if (errCell) {
        le(ph, `Юнит ${atk.unit.instanceId}: ${errCell}`)
        continue
      }
      const tcOnly = cells.find((c) => Number(c.id) === Number(tcidRaw))
      if (!tcOnly) continue
      const nOpp = countOpposingHostilesOnCell(tcOnly, atk.unit)
      if (nOpp === 0) {
        deductShooterAmmo(atk, ammoCost)
        tryDestroyBarbedWireFromFire(tcOnly, atk.unit, unitHasPropKey, le, ph)
        const dDot0 = hexDist(
          atk.cell.coor.x,
          atk.cell.coor.y,
          atk.cell.coor.z,
          tcOnly.coor.x,
          tcOnly.coor.y,
          tcOnly.coor.z,
        )
        tryDotFireDamage(tcOnly, atk.unit, atk.cell, dDot0)
        le(
          ph,
          `Огонь по площади: юнит ${atk.unit.instanceId} → кл. ${tcOnly.id} (−${ammoCost} БК)`,
          {
            fireLine: {
              attackerId: atk.unit.instanceId,
              targetId: null,
              fromCellId: atk.cell.id,
              targetCellId: tcOnly.id,
              hits: 0,
              damages: 0,
              rollResults: [],
              warDef: false,
              isSuppression: !!isSup,
              baseDiceCount: 0,
              diceCount: 0,
              ammoCost,
              areaFireOnly: true,
            },
          },
        )
        continue
      }
      let targetsAll = collectOpposingHostilesOnCell(tcOnly, atk.unit)
      if (!targetsAll.length) {
        deductShooterAmmo(atk, ammoCost)
        tryDestroyBarbedWireFromFire(tcOnly, atk.unit, unitHasPropKey, le, ph)
        const dDot0 = hexDist(
          atk.cell.coor.x,
          atk.cell.coor.y,
          atk.cell.coor.z,
          tcOnly.coor.x,
          tcOnly.coor.y,
          tcOnly.coor.z,
        )
        tryDotFireDamage(tcOnly, atk.unit, atk.cell, dDot0)
        le(
          ph,
          `Огонь по площади: юнит ${atk.unit.instanceId} → кл. ${tcOnly.id} (−${ammoCost} БК)`,
          {
            fireLine: {
              attackerId: atk.unit.instanceId,
              targetId: null,
              fromCellId: atk.cell.id,
              targetCellId: tcOnly.id,
              hits: 0,
              damages: 0,
              rollResults: [],
              warDef: false,
              isSuppression: !!isSup,
              baseDiceCount: 0,
              diceCount: 0,
              ammoCost,
              areaFireOnly: true,
            },
          },
        )
        continue
      }
      if (isInfantryUnit(atk.unit)) {
        const poolAf = infantryAreaFireTargetsOrSkip(atk, targetsAll, le, ph)
        if (!poolAf) continue
        targetsAll = poolAf
      }
      const targets = targetsAll.filter(
        (t) => !isAmbushConcealed(t) || canSpotAmbushTarget(atk.unit, atk.cell, t, tcOnly, cells),
      )
      if (!targets.length) {
        le(
          ph,
          `Юнит ${atk.unit.instanceId}: цель в засаде — не обнаружена (соседний гекс, огонь по площади или уже вела огонь)`,
        )
        continue
      }
      const primary = targets[0]
      const dAf = hexDist(
        atk.cell.coor.x,
        atk.cell.coor.y,
        atk.cell.coor.z,
        tcOnly.coor.x,
        tcOnly.coor.y,
        tcOnly.coor.z,
      )
      const raAf = rangeArrayForAtCell(atk.unit, atk.cell)
      const rModeAf = fireRangeTableMode(raAf)
      const outOfRangeAf = desantCombat.isFireDistanceOutOfRange(
        raAf,
        rModeAf,
        dAf,
        atk.unit,
        primary,
      )
      if (outOfRangeAf) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель вне дальности (${dAf})`)
        continue
      }
      if (!shooterHasAmmo(atk, ammoCost)) {
        le(
          ph,
          isSup
            ? `Юнит ${atk.unit.instanceId}: мало БК для подавления (нужно ${ammoCost})`
            : `Юнит ${atk.unit.instanceId}: нет боеприпасов`,
        )
        continue
      }
      const losVisAf = isArtilleryUnit(atk.unit)
        ? resolveArtilleryFireVisibility(atk, tcOnly, cells, visDeps, {
            useFireAdjustment: !!o.useFireAdjustment,
          })
        : {
            allowed:
              artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, tcOnly, cells),
            artilleryClosed: false,
            usedFireAdjustment: false,
          }
      if (!losVisAf.allowed) {
        le(ph, `Юнит ${atk.unit.instanceId}: ${losVisAf.reason || 'нет прямой видимости на цель'}`)
        continue
      }
      if (o.useFireAdjustment) {
        const facAf = unitFaction(atk.unit)
        if (fireAdjUsedByFaction[facAf]) {
          le(ph, `Юнит ${atk.unit.instanceId}: корректировка огня уже использована в этом ходу`)
          continue
        }
        if (!canShooterUseFireAdjustmentOrder(atk.unit, isSup ? 'fireHard' : 'fire', isArtilleryUnit)) {
          le(ph, `Юнит ${atk.unit.instanceId}: корректировка огня доступна только артиллерии (приказ «Огонь»)`)
          continue
        }
        if (losVisAf.usedFireAdjustment) fireAdjUsedByFaction[facAf] = true
      }
      const stackDivAf = 1
      const artilleryClosedSalvo = !!losVisAf.artilleryClosed
      const dEffAf = desantCombat.effectiveFireDistanceForAccuracy(atk.unit, primary, dAf)
      const salvoAf = computeShootSalvoCore(
        atk.unit,
        primary,
        tcOnly,
        dEffAf,
        raAf,
        isSup,
        undefined,
        artilleryClosedSalvo,
        stackDivAf,
        terrainAccuracyBonusFromCell(atk.cell, atk.unit, primary, false),
      )
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      deductShooterAmmo(atk, ammoCost)
      tryDestroyBarbedWireFromFire(tcOnly, atk.unit, unitHasPropKey, le, ph)
      const dDotAf = hexDist(
        atk.cell.coor.x,
        atk.cell.coor.y,
        atk.cell.coor.z,
        tcOnly.coor.x,
        tcOnly.coor.y,
        tcOnly.coor.z,
      )
      tryDotFireDamage(tcOnly, atk.unit, atk.cell, dDotAf)
      const atkIdAf = Number(atk.unit.instanceId)
      const areaKey = Number(tcOnly.id)
      const areaGrouped = ensureGroupedAreaFireBucket(
        groupedAreaFire,
        areaKey,
        atkIdAf,
        salvoAf.rollResults,
        isSup,
        ammoCost,
      )
      accumulateAreaFireForShooter({
        atk,
        targets,
        targetCell: tcOnly,
        distance: dAf,
        rangeArray: raAf,
        isSup,
        artilleryClosed: artilleryClosedSalvo,
        groupedArea: areaGrouped,
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
      })
      continue
    }
    const tid = tidRaw
    if (tid == null) continue
    const def = findUnitOnField(cells, tid)
    if (!def) continue
    if (!opposing(unitFaction(atk.unit), unitFaction(def.unit))) continue
    if (isAmbushConcealed(def.unit) && !canSpotAmbushTarget(atk.unit, atk.cell, def.unit, def.cell, cells)) {
      le(
        ph,
        `Юнит ${atk.unit.instanceId}: цель в засаде — не обнаружена (соседний гекс, огонь по площади или уже вела огонь)`,
      )
      continue
    }
    if (isInfantryUnit(atk.unit) && isArmoredVehicleTarget(def.unit)) {
      le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
      continue
    }
    if (dotMod.unitInDot(atk.unit)) {
      if (!dotMod.isDotFireTargetCellAllowed(atk.unit, atk.cell, def.cell.id, cells)) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель вне сектора стрельбы ДОТ`)
        continue
      }
    } else if (isArtilleryUnit(atk.unit)) {
      if (!isArtilleryDeployedForBattle(atk.unit)) {
        le(ph, `Юнит ${atk.unit.instanceId}: артиллерия свёрнута — развернитесь (приказ «Развёртывание»)`)
        continue
      }
      if (!isArtilleryFireTargetCellAllowed(atk.unit, def.cell.id)) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель вне сектора обстрела`)
        continue
      }
    }
    const d = hexDist(
      atk.cell.coor.x,
      atk.cell.coor.y,
      atk.cell.coor.z,
      def.cell.coor.x,
      def.cell.coor.y,
      def.cell.coor.z,
    )
    const ra = rangeArrayForAtCell(atk.unit, atk.cell)
    const rMode = fireRangeTableMode(ra)
    const outOfRange = desantCombat.isFireDistanceOutOfRange(ra, rMode, d, atk.unit, def.unit)
    if (outOfRange) {
      le(ph, `Юнит ${atk.unit.instanceId}: цель вне дальности (${d})`)
      continue
    }
    if (!shooterHasAmmo(atk, ammoCost)) {
      le(
        ph,
        isSup
          ? `Юнит ${atk.unit.instanceId}: мало БК для подавления (нужно ${ammoCost})`
          : `Юнит ${atk.unit.instanceId}: нет боеприпасов`,
      )
      continue
    }
    const losVis = isArtilleryUnit(atk.unit)
      ? resolveArtilleryFireVisibility(atk, def.cell, cells, visDeps, {
          useFireAdjustment: !!o.useFireAdjustment,
        })
      : {
          allowed:
            artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, def.cell, cells),
          artilleryClosed: false,
          usedFireAdjustment: false,
        }
    if (!losVis.allowed) {
      le(
        ph,
        `Юнит ${atk.unit.instanceId}: ${losVis.reason || 'нет прямой видимости на цель (нужно свойство «Стрельба по закрытым целям»)'}`,
      )
      continue
    }
    if (o.useFireAdjustment) {
      const fac = unitFaction(atk.unit)
      if (fireAdjUsedByFaction[fac]) {
        le(ph, `Юнит ${atk.unit.instanceId}: корректировка огня уже использована в этом ходу`)
        continue
      }
      if (!canShooterUseFireAdjustmentOrder(atk.unit, isSup ? 'fireHard' : 'fire', isArtilleryUnit)) {
        le(ph, `Юнит ${atk.unit.instanceId}: корректировка огня доступна только артиллерии (приказ «Огонь»)`)
        continue
      }
      if (losVis.usedFireAdjustment) fireAdjUsedByFaction[fac] = true
    }
    let artilleryClosed = !!losVis.artilleryClosed
    const isAreaArt = unitHasPropKey(atk.unit, 'areaFire')

    if (isAreaArt) {
      let targetsAll = collectOpposingHostilesOnCell(def.cell, atk.unit)
      if (isInfantryUnit(atk.unit)) {
        const poolDir = infantryAreaFireTargetsOrSkip(atk, targetsAll, le, ph)
        if (!poolDir) continue
        targetsAll = poolDir
      }
      const targets = targetsAll.filter(
        (t) => !isAmbushConcealed(t) || canSpotAmbushTarget(atk.unit, atk.cell, t, def.cell, cells),
      )
      if (!targets.length) {
        le(
          ph,
          `Юнит ${atk.unit.instanceId}: цель в засаде — не обнаружена (соседний гекс, огонь по площади или уже вела огонь)`,
        )
        continue
      }
      const stackDiv = 1
      const dEffArea = desantCombat.effectiveFireDistanceForAccuracy(atk.unit, def.unit, d)
      const salvo = computeShootSalvoCore(
        atk.unit,
        def.unit,
        def.cell,
        dEffArea,
        ra,
        isSup,
        undefined,
        artilleryClosed,
        stackDiv,
        terrainAccuracyBonusFromCell(atk.cell, atk.unit, def.unit, false),
      )
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      deductShooterAmmo(atk, ammoCost)
      tryDestroyBarbedWireFromFire(def.cell, atk.unit, unitHasPropKey, le, ph)
      const atkIdArea = Number(atk.unit.instanceId)
      const areaKeyDir = Number(def.cell.id)
      const areaGroupedDir = ensureGroupedAreaFireBucket(
        groupedAreaFire,
        areaKeyDir,
        atkIdArea,
        salvo.rollResults,
        isSup,
        ammoCost,
      )
      accumulateAreaFireForShooter({
        atk,
        targets,
        targetCell: def.cell,
        distance: d,
        rangeArray: ra,
        isSup,
        artilleryClosed,
        groupedArea: areaGroupedDir,
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
      })
    } else {
      const hadAmbushDirect = isAmbushConcealed(def.unit)
      const ia = intensityArrayFor(atk.unit, def.unit)
      const warDef = moveWarDefenseBonus(def.unit.instanceId, ordersByUnit)
      const closedForDice = artilleryClosed
      const accBonus = terrainAccuracyBonusFromCell(atk.cell, atk.unit, def.unit, false)
      const dEff = desantCombat.effectiveFireDistanceForAccuracy(atk.unit, def.unit, d)
      const res = computeShoot(
        atk.unit,
        def.unit,
        def.cell,
        dEff,
        ia,
        ra,
        isSup,
        undefined,
        warDef,
        accBonus,
        closedForDice,
        1,
      )
      const tag = warDef ? ' [бой +1 З]' : ''
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      le(
        ph,
        `Огонь: ${atk.unit.instanceId} → ${def.unit.instanceId}, попаданий ${res.hits} (выпало: ${res.rollResults.join(',')})${tag}`,
      )
      deductShooterAmmo(atk, ammoCost)
      tryDestroyBarbedWireFromFire(def.cell, atk.unit, unitHasPropKey, le, ph)
      const defId = Number(tid)
      const grouped = groupedDirectFire.get(defId) || {
        targetId: defId,
        targetCellId: Number(def.cell.id),
        totalHits: 0,
        rollResults: [],
        shooterIds: [],
        accuracies: [],
        hadAmbushDirect,
      }
      grouped.totalHits += Number(res.hits) || 0
      grouped.rollResults.push(...(Array.isArray(res.rollResults) ? res.rollResults : []))
      grouped.shooterIds.push(Number(atk.unit.instanceId))
      grouped.accuracies.push(Number(res.accuracy) || 0)
      grouped.hadAmbushDirect = grouped.hadAmbushDirect || hadAmbushDirect
      groupedDirectFire.set(defId, grouped)
    }
  }
  resolveGroupedAreaFire({
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
  })
  resolveGroupedDirectFire({
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
  })
}

module.exports = {
  processFirePhase,
}

'use strict'

const { terrainAccuracyBonusFromCell } = require('../lib/map/battleTerrain')
const {
  resolveArtilleryFireVisibility,
  canRerollFireWithAdjustment,
} = require('../lib/fire/battleFireAdjustment')
const desantCombat = require('../lib/air/battleDesantCombat')
const { normalizeFireObject } = require('../lib/fire/battleFireNormalize')
const { collectDaisyImpactCells } = require('../lib/fire/areaFire')
const { tryDestroyBarbedWireFromFire } = require('../lib/map/battleWireEdges')
const ponton = require('../lib/map/battlePonton')
const smoke = require('../lib/map/battleSmoke')
const dotMod = require('../lib/map/battleDot')
const structureHp = require('../lib/map/battleStructureHp')
const { unitUsesGunDeploy, isInfantryUnit, isArmoredVehicleTarget } = require('../core/battleUnitType')
const { infantryCanRangedFireAtTarget } = require('../lib/unit/battleUnitFireOptions')
const hiddenState = require('../lib/unit/battleHiddenState')

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
  const allowed = targetsAll.filter((t) => infantryCanRangedFireAtTarget(atk.unit, t))
  if (!allowed.length) {
    le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
    return null
  }
  return allowed
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
    isHiddenConcealed,
    canSpotHiddenTarget,
    hexDist,
    rangeArrayFor,
    rangeArrayForAtCell,
    fireRangeTableMode,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
    computeRevealedCellIdsForFaction,
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
    getDiceCount,
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
    revealHiddenUnit,
    rollTankFearSteadfastness,
    ensureTacticalBattle,
    clearDefendOnUnit,
  } = deps

  function canSeeConcealedEnemy(atkUnit, atkCell, tgtUnit, tgtCell) {
    if (isAmbushConcealed(tgtUnit) && !canSpotAmbushTarget(atkUnit, atkCell, tgtUnit, tgtCell, cells)) {
      return false
    }
    if (isHiddenConcealed && isHiddenConcealed(tgtUnit) && canSpotHiddenTarget && !canSpotHiddenTarget(atkUnit, atkCell, tgtUnit, tgtCell, cells)) {
      return false
    }
    return true
  }

  const isSup = ph === PHASE_KEYS.fireHard
  const ammoCost = isSup ? 3 : 1
  const groupedDirectFire = new Map()
  const groupedAreaFire = new Map()
  const visDeps = {
    unitHasPropKey,
    isArtilleryUnit,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
  }

  function targetRevealedToDotShooter(atkUnit, targetCell) {
    if (!dotMod.dotShooterUsesDotAmmo(atkUnit)) return true
    if (typeof computeRevealedCellIdsForFaction !== 'function') return true
    const fog = computeRevealedCellIdsForFaction(cells, unitFaction(atkUnit))
    if (!fog || typeof fog.has !== 'function') return true
    return fog.has(Number(targetCell.id))
  }
  let reactiveFireUnit = null
  function bindReactiveFire(unit, order) {
    if (reactiveFireUnit && reactiveFireUnit !== unit) delete reactiveFireUnit._useReactiveFire
    reactiveFireUnit = unit || null
    if (unit) {
      unit._useReactiveFire = !!(order && order.useReactiveFire)
    }
  }
  const dotFireDeps = {
    intensityArrayFor,
    rangeArrayForAtCell,
    computeShoot,
    getDiceCount,
    cells,
    findUnitOnField,
    ensureTacticalBattle: deps.ensureTacticalBattle,
    logUnitDestroyed,
  }
  function shooterHasAmmo(atk, cost) {
    return dotMod.shooterHasAmmoForFire(atk, cost, getAmmo)
  }
  function deductShooterAmmo(atk, cost) {
    dotMod.deductShooterAmmoForFire(atk, cost, isSup, getAmmo, setAmmo)
    hiddenState.revealHiddenByOpeningFire(atk.unit, le, ph)
  }
  function tryDotFireDamage(targetCell, attacker, shooterCell, distance) {
    dotMod.tryDamageDotFromFire(targetCell, attacker, shooterCell, distance, { ...dotFireDeps, isSuppression: isSup }, le, ph)
  }
  function tryStructureFire(targetCell, attacker, shooterCell, distance) {
    tryDestroyBarbedWireFromFire(targetCell, attacker, unitHasPropKey, le, ph)
    ponton.tryDestroyPontonFromFire(targetCell, attacker, shooterCell, distance, {
      intensityArrayFor,
      rangeArrayForAtCell,
      computeShoot,
    }, le, ph)
  }
  function structureFireDeps() {
    return {
      intensityArrayFor,
      rangeArrayForAtCell,
      computeShoot,
      getDiceCount,
      logUnitDestroyed,
    }
  }
  function distCells(a, b) {
    return hexDist(a.coor.x, a.coor.y, a.coor.z, b.coor.x, b.coor.y, b.coor.z)
  }
  function fireAdjAvailable(shooterPack, targetUnit, targetCell) {
    return canRerollFireWithAdjustment({
      isSuppression: isSup,
      targetUnit,
      targetCell,
      shooterFound: shooterPack,
      list,
      cells,
      findUnitOnFieldFn: findUnitOnField,
      ordersByUnit,
    })
  }
  function logDirectSalvo(atkPack, defLive, res, warDef, adjSecond, fireAdjustmentMiss) {
    const tag = warDef ? ' [бой +1 З]' : ''
    const adjTag = adjSecond ? ' [корректировка огня]' : ''
    le(
      ph,
      `Огонь: ${atkPack.unit.instanceId} → ${defLive.unit.instanceId}, попаданий ${res.hits} (выпало: ${(res.rollResults || []).join(',')})${tag}${adjTag}`,
      {
        fireLine: {
          attackerId: atkPack.unit.instanceId,
          targetId: defLive.unit.instanceId,
          fromCellId: atkPack.cell.id,
          targetCellId: defLive.cell.id,
          hits: res.hits,
          damages: res.damages,
          rollResults: res.rollResults,
          warDef: !!warDef,
          isSuppression: !!isSup,
          baseDiceCount: res.baseDiceCount,
          diceCount: res.diceCount,
          ammoCost,
          fromDot: dotMod.dotShooterUsesDotAmmo(atkPack.unit),
          fireAdjustment: !!adjSecond,
          fireAdjustmentMiss: !!fireAdjustmentMiss,
        },
      },
    )
  }
  function runAreaAccumulate(atkUnitPack, targets, tcImpact, distance, rangeArray, artilleryClosedSalvo, bucket) {
    accumulateAreaFireForShooter({
      atk: atkUnitPack,
      targets,
      targetCell: tcImpact,
      distance,
      rangeArray,
      isSup,
      artilleryClosed: artilleryClosedSalvo,
      groupedArea: bucket,
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
  }
  function areaStrengthDamageOf(bucket, tcImpact) {
    const trench = require('../lib/map/battleTrench')
    let total = 0
    for (const [tid, rec] of bucket.perTarget.entries()) {
      const defLive = findUnitOnField(cells, tid)
      if (!defLive || getStr(defLive.unit) <= 0) continue
      const warDef = moveWarDefenseBonus(defLive.unit.instanceId, ordersByUnit)
      const cover = trench.unitCoverDefenseBonus(defLive.unit, tcImpact, defLive.cell)
      total += areaFireDamageFromSalvo(rec.hits, defLive.unit, tcImpact || defLive.cell, warDef + cover)
    }
    return total
  }
  function mergeAreaPerTarget(dest, src) {
    for (const [tid, rec] of src.perTarget.entries()) {
      const prev = dest.perTarget.get(tid) || { hits: 0, misses: 0, rollResults: [] }
      prev.hits += Number(rec.hits) || 0
      prev.misses += Number(rec.misses) || 0
      if (Array.isArray(rec.rollResults)) prev.rollResults.push(...rec.rollResults)
      dest.perTarget.set(tid, prev)
    }
  }
  function emptyAreaTemp(cellId) {
    return {
      targetCellId: Number(cellId),
      shooterIds: [],
      rollResults: [],
      isSuppression: !!isSup,
      ammoCost,
      perTarget: new Map(),
      structureHits: 0,
      structureRolls: [],
      structureAttempted: false,
    }
  }
  function fillAreaBucketRolls(bucket) {
    const rolls = []
    for (const rec of bucket.perTarget.values()) {
      if (Array.isArray(rec.rollResults)) rolls.push(...rec.rollResults)
    }
    bucket.rollResults = rolls
  }
  function commitAreaFireWithAdjustment(atkUnitPack, targets, tcImpact, distance, rangeArray, artilleryClosedSalvo) {
    const primary = targets[0]
    const adj = fireAdjAvailable(atkUnitPack, primary, tcImpact)
    const first = emptyAreaTemp(tcImpact.id)
    runAreaAccumulate(atkUnitPack, targets, tcImpact, distance, rangeArray, artilleryClosedSalvo, first)
    fillAreaBucketRolls(first)
    if (adj) {
      le(ph, `Корректировка огня: орудие ${atkUnitPack.unit.instanceId} корректируется`)
    }
    let chosen = first
    if (adj && areaStrengthDamageOf(first, tcImpact) <= 0) {
      logAreaSalvo(atkUnitPack, tcImpact, first, false)
      le(ph, `Корректировка огня: повторный залп орудия ${atkUnitPack.unit.instanceId}`)
      const second = emptyAreaTemp(tcImpact.id)
      runAreaAccumulate(atkUnitPack, targets, tcImpact, distance, rangeArray, artilleryClosedSalvo, second)
      fillAreaBucketRolls(second)
      chosen = second
      chosen.fireAdjustment = true
      logAreaSalvo(atkUnitPack, tcImpact, second, true)
    } else if (adj) {
      le(ph, `Корректировка огня: повторный залп не нужен — первый снял численность`)
    }
    structureHp.applyMissRerollsToStructure(
      cells,
      tcImpact,
      chosen.rollResults,
      chosen.accuracy,
      atkUnitPack.unit,
      le,
      ph,
      structureFireDeps(),
    )
    const areaGrouped = ensureGroupedAreaFireBucket(
      groupedAreaFire,
      Number(tcImpact.id),
      Number(atkUnitPack.unit.instanceId),
      chosen.rollResults,
      isSup,
      ammoCost,
    )
    mergeAreaPerTarget(areaGrouped, chosen)
    if (chosen.fireAdjustment) areaGrouped.fireAdjustment = true
    return { hadTargets: true }
  }
  function logAreaSalvo(atkPack, tcImpact, bucket, adjSecond) {
    const trench = require('../lib/map/battleTrench')
    const areaTargets = []
    let totalHits = 0
    let totalDmg = 0
    for (const [tid, rec] of bucket.perTarget.entries()) {
      const defLive = findUnitOnField(cells, tid)
      if (!defLive || getStr(defLive.unit) <= 0) continue
      const warDef = moveWarDefenseBonus(defLive.unit.instanceId, ordersByUnit)
      const cover = trench.unitCoverDefenseBonus(defLive.unit, tcImpact, defLive.cell)
      const dmg = areaFireDamageFromSalvo(rec.hits, defLive.unit, tcImpact || defLive.cell, warDef + cover)
      totalHits += Number(rec.hits) || 0
      totalDmg += dmg
      areaTargets.push({
        targetId: Number(tid),
        damages: dmg,
        warDef: !!warDef,
        hits: rec.hits,
        misses: rec.misses,
        rollResults: rec.rollResults,
      })
    }
    const adjTag = adjSecond ? ' [корректировка огня]' : ''
    le(
      ph,
      `Огонь по площади: юнит ${atkPack.unit.instanceId} → кл. ${tcImpact.id}, попаданий ${totalHits}${adjTag}`,
      {
        fireLine: {
          attackerId: atkPack.unit.instanceId,
          targetId: areaTargets[0] ? areaTargets[0].targetId : null,
          fromCellId: atkPack.cell.id,
          targetCellId: tcImpact.id,
          hits: totalHits,
          damages: totalDmg,
          rollResults: bucket.rollResults,
          isSuppression: !!isSup,
          baseDiceCount: (bucket.rollResults || []).length,
          diceCount: (bucket.rollResults || []).length,
          ammoCost,
          areaFireOnly: true,
          fromDot: dotMod.dotShooterUsesDotAmmo(atkPack.unit),
          fireAdjustment: !!adjSecond,
          fireAdjustmentMiss: !adjSecond,
          areaTargets,
        },
      },
    )
  }
  function accumulateAreaFireStructureHits(atkUnitPack, tcImpact, distance, rangeArray, artilleryClosedSalvo) {
    if (!structureHp.isBuildFireTargetCell(tcImpact)) return false
    const cap = structureHp.buildDiceCap(atkUnitPack.unit, structureFireDeps())
    let hits = 0
    let rolls = []
    if (cap > 0) {
      const ia = intensityArrayFor(atkUnitPack.unit, { type: 'build' })
      const res = computeShoot(
        atkUnitPack.unit,
        { type: 'build', def: 0, str: 1 },
        tcImpact,
        distance,
        ia,
        rangeArray,
        isSup,
        undefined,
        0,
        0,
        artilleryClosedSalvo,
        1,
      )
      hits = Math.max(0, Math.floor(Number(res && res.hits) || 0))
      rolls = Array.isArray(res && res.rollResults) ? res.rollResults : []
    } else {
      const salvo = computeShootSalvoCore(
        atkUnitPack.unit,
        { type: 'infantry' },
        tcImpact,
        distance,
        rangeArray,
        isSup,
        undefined,
        artilleryClosedSalvo,
        1,
        0,
      )
      hits = Math.max(0, Math.floor(Number(salvo && salvo.hitSuccesses) || 0))
      rolls = Array.isArray(salvo && salvo.rollResults) ? salvo.rollResults : []
    }
    const bucket = ensureGroupedAreaFireBucket(
      groupedAreaFire,
      Number(tcImpact.id),
      Number(atkUnitPack.unit.instanceId),
      rolls,
      isSup,
      ammoCost,
    )
    bucket.structureHits = (Number(bucket.structureHits) || 0) + hits
    if (!Array.isArray(bucket.structureRolls)) bucket.structureRolls = []
    bucket.structureRolls.push(...rolls)
    bucket.structureAttempted = true
    return true
  }
  function applyAreaFireOnImpactCell(atkUnitPack, tcImpact, distance, rangeArray, artilleryClosedSalvo) {
    tryStructureFire(tcImpact, atkUnitPack.unit, atkUnitPack.cell, distance)
    if (smoke.hasSmokeOnCell(tcImpact.builds)) {
      const hitStruct = accumulateAreaFireStructureHits(
        atkUnitPack,
        tcImpact,
        distance,
        rangeArray,
        artilleryClosedSalvo,
      )
      return { hadTargets: hitStruct, smoked: true }
    }
    let targetsAll = collectOpposingHostilesOnCell(tcImpact, atkUnitPack.unit)
    if (!targetsAll.length) {
      const hitStruct = accumulateAreaFireStructureHits(
        atkUnitPack,
        tcImpact,
        distance,
        rangeArray,
        artilleryClosedSalvo,
      )
      return { hadTargets: hitStruct }
    }
    if (isInfantryUnit(atkUnitPack.unit)) {
      const poolAf = infantryAreaFireTargetsOrSkip(atkUnitPack, targetsAll, le, ph)
      if (!poolAf) {
        const hitStruct = accumulateAreaFireStructureHits(
          atkUnitPack,
          tcImpact,
          distance,
          rangeArray,
          artilleryClosedSalvo,
        )
        return { hadTargets: hitStruct }
      }
      targetsAll = poolAf
    }
    const targets = targetsAll.filter((t) =>
      canSeeConcealedEnemy(atkUnitPack.unit, atkUnitPack.cell, t, tcImpact),
    )
    if (!targets.length) {
      const hitStruct = accumulateAreaFireStructureHits(
        atkUnitPack,
        tcImpact,
        distance,
        rangeArray,
        artilleryClosedSalvo,
      )
      return { hadTargets: hitStruct }
    }
    return commitAreaFireWithAdjustment(
      atkUnitPack,
      targets,
      tcImpact,
      distance,
      rangeArray,
      artilleryClosedSalvo,
    )
  }
  for (const o of list) {
    if (String(o.orderKey || '').trim() === 'smoke') continue
    if (String(o.orderKey || '').trim() === 'fireAdjustment') continue
    const atk = findUnitOnField(cells, o.unitId)
    if (!atk) {
      bindReactiveFire(null, null)
      continue
    }
    bindReactiveFire(atk.unit, o)
    if (!dotMod.dotShooterCanFire(atk.unit)) {
      le(ph, `Юнит ${atk.unit.instanceId}: выход из ДОТ — огонь недоступен`)
      continue
    }
    const tidRaw = o.targetUnitInstanceId
    const tcidRaw = o.targetCellId
    const tidHasRaw = tidRaw != null && Number.isFinite(Number(tidRaw))
    const tcidHas = tcidRaw != null && Number.isFinite(Number(tcidRaw))
    const wantsReactive = !!o.useReactiveFire
    let areaAimCell = null
    if (tcidHas) {
      areaAimCell = cells.find((c) => Number(c.id) === Number(tcidRaw))
    } else if (wantsReactive && tidHasRaw) {
      const defLive = findUnitOnField(cells, tidRaw)
      if (defLive) areaAimCell = defLive.cell
    }
    let tidHas = tidHasRaw
    if (tidHasRaw && !wantsReactive) {
      const defLive = findUnitOnField(cells, tidRaw)
      if (
        defLive &&
        dotMod.unitInDot(defLive.unit) &&
        (structureHp.unitCanRangedBuildFire(atk.unit, wantsReactive) || dotMod.unitInDot(atk.unit)) &&
        structureHp.isBuildFireTargetCell(defLive.cell)
      ) {
        tidHas = false
        areaAimCell = defLive.cell
      }
    }
    if (
      !tidHas &&
      areaAimCell &&
      !wantsReactive &&
      !unitHasPropKey(atk.unit, 'areaFire') &&
      structureHp.isBuildFireTargetCell(areaAimCell) &&
      (structureHp.unitCanRangedBuildFire(atk.unit, wantsReactive) || dotMod.unitInDot(atk.unit))
    ) {
      const tcOnly = areaAimCell
      if (dotMod.unitInDot(atk.unit)) {
        if (!dotMod.isDotFireTargetCellAllowed(atk.unit, atk.cell, tcOnly.id, cells)) {
          le(ph, `Юнит ${atk.unit.instanceId}: клетка вне сектора стрельбы ДОТ`)
          continue
        }
      } else if (isArtilleryUnit(atk.unit) || unitHasPropKey(atk.unit, 'fireSector')) {
        if (unitUsesGunDeploy(atk.unit) && !isArtilleryDeployedForBattle(atk.unit)) {
          le(ph, `Юнит ${atk.unit.instanceId}: орудие свёрнуто — развернитесь (приказ «Развёртывание»)`)
          continue
        }
        if (!isArtilleryFireTargetCellAllowed(atk.unit, tcOnly.id)) {
          le(ph, `Юнит ${atk.unit.instanceId}: клетка вне сектора обстрела`)
          continue
        }
      }
      const dAf = distCells(atk.cell, tcOnly)
      const raAf = rangeArrayForAtCell(atk.unit, atk.cell)
      const rModeAf = fireRangeTableMode(raAf)
      const outOfRangeAf = desantCombat.isFireDistanceOutOfRange(raAf, rModeAf, dAf, atk.unit, null)
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
      const losOk =
        dotMod.dotFireIgnoresTerrainLos(atk.unit) ||
        artilleryAreaClosedIgnoresTerrainLos(atk.unit) ||
        unitHasPropKey(atk.unit, 'concealedTargetFire') ||
        isHexVisible(atk.cell, tcOnly, cells)
      if (!losOk) {
        le(ph, `Юнит ${atk.unit.instanceId}: нет прямой видимости на сооружение`)
        continue
      }
      if (!targetRevealedToDotShooter(atk.unit, tcOnly)) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель в тумане`)
        continue
      }
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      deductShooterAmmo(atk, ammoCost)
      tryStructureFire(tcOnly, atk.unit, atk.cell, dAf)
      tryDotFireDamage(tcOnly, atk.unit, atk.cell, dAf)
      structureHp.shootStructureDirect(cells, tcOnly, atk.unit, atk.cell, dAf, isSup, structureFireDeps(), le, ph)
      continue
    }
    if (areaAimCell && (wantsReactive || !tidHas)) {
      const tcOnly = areaAimCell
      const okOrder = isSup ? 'fireHard' : 'fire'
      const errCell = validateArtilleryAreaFireOnCellOnly(cells, atk, Number(tcOnly.id), okOrder, {
        useFireAdjustment: !!o.useFireAdjustment,
        useReactiveFire: wantsReactive,
      })
      if (errCell) {
        le(ph, `Юнит ${atk.unit.instanceId}: ${errCell}`)
        continue
      }
      const dAf = distCells(atk.cell, tcOnly)
      const fireTablesAf = wantsReactive ? normalizeFireObject(atk.unit.fireReactive) : undefined
      const raAf = rangeArrayForAtCell(atk.unit, atk.cell, fireTablesAf)
      const rModeAf = fireRangeTableMode(raAf)
      const outOfRangeAf = desantCombat.isFireDistanceOutOfRange(raAf, rModeAf, dAf, atk.unit, null)
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
      const losVisAf = dotMod.dotFireIgnoresTerrainLos(atk.unit)
        ? { allowed: true, artilleryClosed: false, usedFireAdjustment: false }
        : isArtilleryUnit(atk.unit) ||
            unitHasPropKey(atk.unit, 'areaFire') ||
            unitHasPropKey(atk.unit, 'concealedTargetFire')
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
      if (!targetRevealedToDotShooter(atk.unit, tcOnly)) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель в тумане`)
        continue
      }
      const artilleryClosedSalvo = !!losVisAf.artilleryClosed
      const impactCells = wantsReactive ? collectDaisyImpactCells(tcOnly, cells) : [tcOnly]
      if (!impactCells.length) {
        le(ph, `Юнит ${atk.unit.instanceId}: нет клеток попадания`)
        continue
      }
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      deductShooterAmmo(atk, ammoCost)
      let hadAnyTargets = false
      for (let ii = 0; ii < impactCells.length; ii++) {
        const impact = impactCells[ii]
        const applied = applyAreaFireOnImpactCell(atk, impact, dAf, raAf, artilleryClosedSalvo)
        if (applied.hadTargets) hadAnyTargets = true
      }
      if (!hadAnyTargets) {
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
              fromDot: dotMod.dotShooterUsesDotAmmo(atk.unit),
            },
          },
        )
      }
      continue
    }
    const tid = tidRaw
    if (tid == null) continue
    const def = findUnitOnField(cells, tid)
    if (!def) continue
    if (smoke.hasSmokeOnCell(def.cell.builds)) {
      le(ph, `Юнит ${atk.unit.instanceId}: цель в дымовой завесе`)
      continue
    }
    if (!opposing(unitFaction(atk.unit), unitFaction(def.unit))) continue
    if (!canSeeConcealedEnemy(atk.unit, atk.cell, def.unit, def.cell)) {
      le(
        ph,
        `Юнит ${atk.unit.instanceId}: цель скрыта — не обнаружена (соседний гекс, огонь по площади или уже вела огонь)`,
      )
      continue
    }
    if (isInfantryUnit(atk.unit) && isArmoredVehicleTarget(def.unit)) {
      if (!infantryCanRangedFireAtTarget(atk.unit, def.unit, !!o.useReactiveFire)) {
        le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
        continue
      }
    }
    if (dotMod.unitInDot(atk.unit)) {
      if (!dotMod.isDotFireTargetCellAllowed(atk.unit, atk.cell, def.cell.id, cells)) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель вне сектора стрельбы ДОТ`)
        continue
      }
    } else if (isArtilleryUnit(atk.unit) || unitHasPropKey(atk.unit, 'fireSector')) {
      if (unitUsesGunDeploy(atk.unit) && !isArtilleryDeployedForBattle(atk.unit)) {
        le(ph, `Юнит ${atk.unit.instanceId}: орудие свёрнуто — развернитесь (приказ «Развёртывание»)`)
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
    const fireTablesRa = o.useReactiveFire
      ? normalizeFireObject(atk.unit.fireReactive)
      : undefined
    const ra = rangeArrayForAtCell(atk.unit, atk.cell, fireTablesRa)
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
    const losVis = dotMod.dotFireIgnoresTerrainLos(atk.unit)
      ? { allowed: true, artilleryClosed: false, usedFireAdjustment: false }
      : isArtilleryUnit(atk.unit) ||
          unitHasPropKey(atk.unit, 'areaFire') ||
          unitHasPropKey(atk.unit, 'concealedTargetFire')
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
    if (!targetRevealedToDotShooter(atk.unit, def.cell)) {
      le(ph, `Юнит ${atk.unit.instanceId}: цель в тумане`)
      continue
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
        (t) => canSeeConcealedEnemy(atk.unit, atk.cell, t, def.cell),
      )
      if (!targets.length) {
        le(
          ph,
          `Юнит ${atk.unit.instanceId}: цель в засаде — не обнаружена (соседний гекс, огонь по площади или уже вела огонь)`,
        )
        continue
      }
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      deductShooterAmmo(atk, ammoCost)
      tryStructureFire(def.cell, atk.unit, atk.cell, d)
      commitAreaFireWithAdjustment(atk, targets, def.cell, d, ra, artilleryClosed)
    } else {
      const hadAmbushDirect = isAmbushConcealed(def.unit)
      const ia = intensityArrayFor(atk.unit, def.unit)
      const warDef = moveWarDefenseBonus(def.unit.instanceId, ordersByUnit)
      const closedForDice = artilleryClosed
      const accBonus = terrainAccuracyBonusFromCell(atk.cell, atk.unit, def.unit, false)
      const dEff = desantCombat.effectiveFireDistanceForAccuracy(atk.unit, def.unit, d)
      const shootOnce = () =>
        computeShoot(
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
      let res = shootOnce()
      const isSniper = unitHasPropKey(atk.unit, 'sniper')
      const adj = !isSniper && fireAdjAvailable(atk, def.unit, def.cell)
      let usedAdj = false
      if (adj) {
        le(ph, `Корректировка огня: орудие ${atk.unit.instanceId} корректируется`)
      }
      if (adj && (Number(res.damages) || 0) <= 0) {
        logDirectSalvo(atk, def, res, warDef, false, true)
        le(ph, `Корректировка огня: повторный залп орудия ${atk.unit.instanceId}`)
        res = shootOnce()
        usedAdj = true
        logDirectSalvo(atk, def, res, warDef, true)
      } else if (adj) {
        le(ph, `Корректировка огня: повторный залп не нужен — первый снял численность`)
      }
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      if (!usedAdj) logDirectSalvo(atk, def, res, warDef, false)
      deductShooterAmmo(atk, ammoCost)
      tryStructureFire(def.cell, atk.unit, atk.cell, d)
      structureHp.applyMissRerollsToStructure(
        cells,
        def.cell,
        res.rollResults,
        res.accuracy,
        atk.unit,
        le,
        ph,
        structureFireDeps(),
      )
      if (isHiddenConcealed && isHiddenConcealed(def.unit) && revealHiddenUnit) {
        revealHiddenUnit(def.unit)
      }
      if (isSniper) {
        le(ph, `Снайпер: юнит ${atk.unit.instanceId} — урон по ОЖ не наносится`, {
          unitInstanceId: Number(atk.unit.instanceId),
          sniper: true,
        })
        const wouldDmg = Number(res.damages) || 0
        if (wouldDmg >= 1 && rollTankFearSteadfastness) {
          rollTankFearSteadfastness(le, ph, def.unit, 'Снайпер', true, false, {
            ensureTacticalBattle,
            clearDefendOnUnit,
            cells,
            findUnitOnField,
          })
        }
        continue
      }
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
      if (usedAdj) grouped.fireAdjustment = true
      groupedDirectFire.set(defId, grouped)
    }
  }
  bindReactiveFire(null, null)
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
    ensureTacticalBattle,
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

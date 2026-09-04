'use strict'

const { terrainAccuracyBonusFromCell } = require('../lib/map/battleTerrain')
const {
  resolveArtilleryFireVisibility,
  canShooterUseFireAdjustmentOrder,
} = require('../lib/fire/battleFireAdjustment')
const desantCombat = require('../lib/air/battleDesantCombat')
const { normalizeFireObject } = require('../lib/fire/battleFireNormalize')
const { collectDaisyImpactCells } = require('../lib/fire/areaFire')
const { tryDestroyBarbedWireFromFire } = require('../lib/map/battleWireEdges')
const ponton = require('../lib/map/battlePonton')
const smoke = require('../lib/map/battleSmoke')
const dotMod = require('../lib/map/battleDot')
const structureHp = require('../lib/map/battleStructureHp')
const { unitUsesGunDeploy } = require('../core/battleUnitType')

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
    isHiddenConcealed,
    canSpotHiddenTarget,
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
  const fireAdjUsedByFaction = Object.create(null)
  const visDeps = {
    unitHasPropKey,
    isArtilleryUnit,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
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
  function applyAreaFireOnImpactCell(atkUnitPack, tcImpact, distance, rangeArray, artilleryClosedSalvo) {
    tryStructureFire(tcImpact, atkUnitPack.unit, atkUnitPack.cell, distance)
    tryDotFireDamage(tcImpact, atkUnitPack.unit, atkUnitPack.cell, distance)
    if (smoke.hasSmokeOnCell(tcImpact.builds)) {
      structureHp.shootStructureDirect(
        cells,
        tcImpact,
        atkUnitPack.unit,
        atkUnitPack.cell,
        distance,
        isSup,
        structureFireDeps(),
        le,
        ph,
      )
      return { hadTargets: false, smoked: true }
    }
    let targetsAll = collectOpposingHostilesOnCell(tcImpact, atkUnitPack.unit)
    if (!targetsAll.length) {
      structureHp.shootStructureDirect(
        cells,
        tcImpact,
        atkUnitPack.unit,
        atkUnitPack.cell,
        distance,
        isSup,
        structureFireDeps(),
        le,
        ph,
      )
      return { hadTargets: false }
    }
    if (isInfantryUnit(atkUnitPack.unit)) {
      const poolAf = infantryAreaFireTargetsOrSkip(atkUnitPack, targetsAll, le, ph)
      if (!poolAf) return { hadTargets: false }
      targetsAll = poolAf
    }
    const targets = targetsAll.filter((t) =>
      canSeeConcealedEnemy(atkUnitPack.unit, atkUnitPack.cell, t, tcImpact),
    )
    if (!targets.length) {
      structureHp.shootStructureDirect(
        cells,
        tcImpact,
        atkUnitPack.unit,
        atkUnitPack.cell,
        distance,
        isSup,
        structureFireDeps(),
        le,
        ph,
      )
      return { hadTargets: false }
    }
    const primary = targets[0]
    const dEff = desantCombat.effectiveFireDistanceForAccuracy(atkUnitPack.unit, primary, distance)
    const salvoAf = computeShootSalvoCore(
      atkUnitPack.unit,
      primary,
      tcImpact,
      dEff,
      rangeArray,
      isSup,
      undefined,
      artilleryClosedSalvo,
      1,
      terrainAccuracyBonusFromCell(atkUnitPack.cell, atkUnitPack.unit, primary, false),
    )
    structureHp.applyMissRerollsToStructure(
      cells,
      tcImpact,
      salvoAf.rollResults,
      salvoAf.accuracy,
      atkUnitPack.unit,
      le,
      ph,
      structureFireDeps(),
    )
    const areaGrouped = ensureGroupedAreaFireBucket(
      groupedAreaFire,
      Number(tcImpact.id),
      Number(atkUnitPack.unit.instanceId),
      salvoAf.rollResults,
      isSup,
      ammoCost,
    )
    accumulateAreaFireForShooter({
      atk: atkUnitPack,
      targets,
      targetCell: tcImpact,
      distance,
      rangeArray,
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
    return { hadTargets: true, salvoAf }
  }
  for (const o of list) {
    if (String(o.orderKey || '').trim() === 'smoke') continue
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
    const tidHas = tidRaw != null && Number.isFinite(Number(tidRaw))
    const tcidHas = tcidRaw != null && Number.isFinite(Number(tcidRaw))
    const wantsReactive = !!o.useReactiveFire
    let areaAimCell = null
    if (tcidHas) {
      areaAimCell = cells.find((c) => Number(c.id) === Number(tcidRaw))
    } else if (wantsReactive && tidHas) {
      const defLive = findUnitOnField(cells, tidRaw)
      if (defLive) areaAimCell = defLive.cell
    }
    if (
      !tidHas &&
      tcidHas &&
      !wantsReactive &&
      !unitHasPropKey(atk.unit, 'areaFire') &&
      structureHp.unitHasBuildFire(atk.unit) &&
      structureHp.isShootableStructureCell(areaAimCell)
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
      le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
      continue
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
        (t) => canSeeConcealedEnemy(atk.unit, atk.cell, t, def.cell),
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
      tryStructureFire(def.cell, atk.unit, atk.cell, d)
      structureHp.applyMissRerollsToStructure(
        cells,
        def.cell,
        salvo.rollResults,
        salvo.accuracy,
        atk.unit,
        le,
        ph,
        structureFireDeps(),
      )
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
      if (unitHasPropKey(atk.unit, 'sniper')) {
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

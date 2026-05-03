'use strict'

const {
  computeRevealedCellIdsForFaction,
  cellBlocksLineOfSight,
  isHexVisible,
} = require('./lib/map/battleFogVisibility')
const {
  computeDefendSectorIds,
  isValidDefendFacing,
  maxShootRangeStepsForUnit,
} = require('./lib/map/battleDefendSector')
const {
  areaFireHitsForTargetByOrder,
  areaFireDiceForTargetByOrder,
} = require('./lib/fire/areaFire')
const { accumulateAreaFireForShooter } = require('./lib/fire/battleAreaFireAccumulator')
const { ensureGroupedAreaFireBucket } = require('./lib/fire/battleAreaFireGrouping')
const { resolveGroupedAreaFire } = require('./lib/fire/battleAreaFireResolver')
const { resolveGroupedDirectFire } = require('./lib/fire/battleDirectFireResolver')
const { splitNums, normalizeFireObject, targetTypeToFireKey } = require('./lib/fire/battleFireNormalize')
const { hexDist, getNeighbor, findCellByCoor, hexDistCells } = require('./lib/map/battleHexGeometry')
const { getStr, setStr, unitFaction, opposing, findUnitOnField } = require('./lib/unit/battleUnitField')
const {
  getMoveCap,
  getAmmo,
  setAmmo,
  getMovePoint,
  setMovePoint,
  getAmmoCapacityMax,
} = require('./lib/unit/battleUnitResources')
const { readVisionRange } = require('./lib/unit/battleUnitVision')
const {
  getDef,
  usesTechMoveCost,
  terrainEntryCost,
  terrainDefenseBonusFromCell,
} = require('./lib/map/battleTerrain')
const {
  getMeleeOpponentId,
  findReachable,
  findPath,
} = require('./lib/map/battleHexMovement')
const { PHASE_KEYS, phaseForOrderKey, logEntry } = require('./lib/fire/battleEnginePhase')
const {
  isTruckUnit,
  isInfantryUnit,
  isArmoredVehicleTarget,
  isArtilleryUnit,
  isArtilleryDeployedForBattle,
  isArtilleryFireTargetCellAllowed,
  clearArtillerySectorGeometry,
  unitHasPropKey,
  artilleryAreaClosedIgnoresTerrainLos,
  isArtilleryCollapsedForTow,
} = require('./core/battleUnitType')
const transport = require('./core/battleTransport')
const ambush = require('./core/battleAmbush')
const artilleryValidation = require('./validation/battleArtilleryValidation')
const specialPhase = require('./phases/battleSpecialPhase')
const logisticsValidation = require('./validation/battleLogisticsValidation')
const overwatchCore = require('./core/battleOverwatchCore')
const overwatchFire = require('./phases/battleOverwatchFire')
const meleePhase = require('./phases/battleMeleePhase')
const morale = require('./core/battleMorale')
const engineHelpers = require('./core/battleEngineHelpers')
const defendAmbushPhase = require('./phases/battleDefendAmbushPhase')
const movePhase = require('./phases/battleMovePhase')
const firePhase = require('./phases/battleFirePhase')

function intensityArrayFor(attacker, target, fireTables) {
  const ft = fireTables || normalizeFireObject(attacker.fireParsed || attacker._fireRaw)
  const key = targetTypeToFireKey(target.type)
  const arr = ft[key] && ft[key].length ? ft[key] : ft.inf
  return arr && arr.length ? arr : [1, 2, 2, 3]
}

function rangeArrayFor(attacker, fireTables) {
  const ft = fireTables || normalizeFireObject(attacker.fireParsed || attacker._fireRaw)
  return ft.range && ft.range.length ? ft.range : [3, 2, 1]
}


function rangeArrayAmbushAccuracyBonus(rangeArray) {
  const ra = rangeArray && rangeArray.length ? rangeArray : [3, 2, 1]
  return ra.map((x) => Number(x) + 1)
}


function getDiceCount(unit, intensityArray) {
  const strength = Math.max(1, getStr(unit))
  const len = intensityArray.length
  if (!len) return 1
  const first = intensityArray[0]
  const last = intensityArray[len - 1]
  const descending = Number(first) > Number(last)
  if (strength > len) {
    return descending ? intensityArray[0] ?? 1 : intensityArray[len - 1] ?? 1
  }
  if (descending) {
    const idx = len - strength
    return intensityArray[idx] ?? 1
  }
  return intensityArray[strength - 1] ?? 1
}


function fireRangeTableMode(rangeArray) {
  return rangeArray.length >= 2 ? 'ranged' : 'direct'
}

function getAccuracy(rangeArray, distance, mode) {
  if (mode === 'ranged') {
    if (distance < 1 || distance >= rangeArray.length) return 0
    return rangeArray[distance]
  }
  const index = distance - 1
  if (index >= 0 && index < rangeArray.length) return rangeArray[index]
  return 0
}


function shootingAccuracyAtHexDistance(unit, distanceHex) {
  const ra = rangeArrayFor(unit)
  const mode = fireRangeTableMode(ra)
  return getAccuracy(ra, Number(distanceHex), mode)
}

function rollDice(diceCount, rng) {
  const results = []
  const rand = rng || Math.random
  for (let i = 0; i < diceCount; i++) {
    results.push(Math.floor(rand() * 6) + 1)
  }
  return results
}


function computeShoot(
  attacker,
  target,
  targetCell,
  distance,
  intensityArray,
  rangeArray,
  isSuppression,
  rng,
  extraDefense,
  bonusAccuracy,
  artilleryClosedTarget,
  areaStackDivisor,
) {
  const mode = fireRangeTableMode(rangeArray)
  if (mode === 'ranged') {
    if (distance < 1 || distance >= rangeArray.length) {
      return { hits: 0, damages: 0, rollResults: [], diceCount: 0, baseDiceCount: 0, accuracy: 0 }
    }
  } else if (distance > rangeArray.length) {
    return { hits: 0, damages: 0, rollResults: [], diceCount: 0, baseDiceCount: 0, accuracy: 0 }
  }
  const baseDiceCount = getDiceCount(attacker, intensityArray)
  let diceCount = baseDiceCount
  if (isSuppression) {
    diceCount += Math.ceil(diceCount / 2)
  }
 
  if (artilleryClosedTarget) {
    diceCount = Math.max(1, Math.round(diceCount / 1.5))
  }
  const asDiv = areaStackDivisor == null ? 1 : Number(areaStackDivisor)
  if (Number.isFinite(asDiv) && asDiv > 1) {
    diceCount = Math.max(0, Math.round(diceCount / asDiv))
  }
  let accuracy = getAccuracy(rangeArray, distance, mode) + Math.max(0, Number(bonusAccuracy) || 0)
  if (accuracy === 0) {
    return {
      hits: 0,
      damages: 0,
      rollResults: [],
      diceCount,
      baseDiceCount,
      accuracy,
    }
  }
  const bonus = Math.max(0, Number(extraDefense) || 0)
  const terrainDef = terrainDefenseBonusFromCell(targetCell, target)
  const defense = getDef(target) + bonus + terrainDef
  const rolls = rollDice(diceCount, rng)
  const hits = rolls.filter((r) => r <= accuracy).length
  let remainingHits = hits - defense
  if (remainingHits < 0) remainingHits = 0
  const damages = remainingHits
  return { hits, damages, rollResults: rolls, diceCount, baseDiceCount, accuracy }
}

/**

 * @param {boolean} artilleryClosedTarget
 */
function computeShootSalvoCore(
  attacker,
  targetForIntensity,
  targetCell,
  distance,
  rangeArray,
  isSuppression,
  rng,
  artilleryClosedTarget,
  areaStackDivisor,
) {
  const mode = fireRangeTableMode(rangeArray)
  if (mode === 'ranged') {
    if (distance < 1 || distance >= rangeArray.length) {
      return { hitSuccesses: 0, rollResults: [], diceCount: 0, baseDiceCount: 0, accuracy: 0 }
    }
  } else if (distance > rangeArray.length) {
    return { hitSuccesses: 0, rollResults: [], diceCount: 0, baseDiceCount: 0, accuracy: 0 }
  }
  const intensityArray = intensityArrayFor(attacker, targetForIntensity)
  const baseDiceCount = getDiceCount(attacker, intensityArray)
  let diceCount = baseDiceCount
  if (isSuppression) {
    diceCount += Math.ceil(diceCount / 2)
  }
  if (artilleryClosedTarget) {
    diceCount = Math.max(1, Math.round(diceCount / 1.5))
  }
  const asDiv = areaStackDivisor == null ? 1 : Number(areaStackDivisor)
  if (Number.isFinite(asDiv) && asDiv > 1) {
    diceCount = Math.max(0, Math.round(diceCount / asDiv))
  }
  const accuracy = getAccuracy(rangeArray, distance, mode)
  if (accuracy === 0) {
    return { hitSuccesses: 0, rollResults: [], diceCount, baseDiceCount, accuracy }
  }
  const rolls = rollDice(diceCount, rng)
  const hitSuccesses = rolls.filter((r) => r <= accuracy).length
  return { hitSuccesses, rollResults: rolls, diceCount, baseDiceCount, accuracy }
}

function areaFireDamageFromSalvo(hitSuccesses, target, targetCell, extraDefense) {
  const bonus = Math.max(0, Number(extraDefense) || 0)
  const terrainDef = terrainDefenseBonusFromCell(targetCell, target)
  const defense = getDef(target) + bonus + terrainDef
  let remaining = hitSuccesses - defense
  if (remaining < 0) remaining = 0
  return remaining
}


function removeUnitFromCell(cell, instanceId) {
  if (!cell.units) return
  cell.units = cell.units.filter((u) => Number(u.instanceId) !== Number(instanceId))
}

function addUnitToCell(cell, unit) {
  if (!cell.units) cell.units = []
  cell.units.push(unit)
}

function syncUnitCoor(unit, cell) {
  unit.coor = { ...cell.coor }
}


function sweepCorpses(cells) {
  for (const c of cells) {
    if (!c.units) continue
    c.units = c.units.filter((u) => getStr(u) > 0)
  }
  for (const c of cells) {
    for (const u of c.units || []) {
      const tac = u.tactical
      if (tac && Array.isArray(tac.carriedUnits)) {
        tac.carriedUnits = tac.carriedUnits.filter((x) => getStr(x) > 0)
      }
    }
  }
}

function logUnitDestroyed(le, ph, unit, prevStr, reason, destroyedCellId) {
  if (!unit || typeof le !== 'function') return
  const before = Number(prevStr)
  if (!Number.isFinite(before) || before <= 0) return
  if (getStr(unit) > 0) return
  const suffix = reason ? ` (${reason})` : ''
  le(ph, `Юнит ${unit.instanceId} уничтожен${suffix}`, {
    unitInstanceId: Number(unit.instanceId),
    unitName: String(unit.name || '').trim() || undefined,
    unitFaction: String(unitFaction(unit) || '').trim().toLowerCase() || undefined,
    destroyedCellId: Number.isFinite(Number(destroyedCellId)) ? Number(destroyedCellId) : undefined,
    destroyed: true,
  })
}

function alliesSameFaction(a, b) {
  const fa = unitFaction(a)
  const fb = unitFaction(b)
  return fa !== 'none' && fa === fb
}

function countOpposingHostilesOnCell(targetCell, attackerUnit) {
  if (!targetCell || !targetCell.units || !attackerUnit) return 0
  const af = unitFaction(attackerUnit)
  let n = 0
  for (let i = 0; i < targetCell.units.length; i++) {
    const u = targetCell.units[i]
    if (getStr(u) <= 0) continue
    if (opposing(af, unitFaction(u))) n++
  }
  return n
}

function primaryOpposingUnitOnCell(targetCell, attackerUnit) {
  if (!targetCell || !targetCell.units || !attackerUnit) return null
  const af = unitFaction(attackerUnit)
  for (let i = 0; i < targetCell.units.length; i++) {
    const u = targetCell.units[i]
    if (getStr(u) <= 0) continue
    if (opposing(af, unitFaction(u))) return u
  }
  return null
}


function collectOpposingHostilesOnCell(targetCell, attackerUnit) {
  if (!targetCell || !targetCell.units || !attackerUnit) return []
  const af = unitFaction(attackerUnit)
  const out = []
  for (let i = 0; i < targetCell.units.length; i++) {
    const u = targetCell.units[i]
    if (getStr(u) <= 0) continue
    if (opposing(af, unitFaction(u))) out.push(u)
  }
  return out
}

/**
 
 * @returns {string|null} 
 */
function validateArtilleryAreaFireOnCellOnly(cells, atk, targetCellId, orderKey) {
  return artilleryValidation.validateArtilleryAreaFireOnCellOnly(cells, atk, targetCellId, orderKey, {
    isArtilleryUnit,
    unitHasPropKey,
    isArtilleryDeployedForBattle,
    isArtilleryFireTargetCellAllowed,
    hexDistCells,
    rangeArrayFor,
    fireRangeTableMode,
    shootingAccuracyAtHexDistance,
    getAmmo,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
  })
}


function isAmbushConcealed(u) {
  return ambush.isAmbushConcealed(u)
}

function hasFriendlyAdjacentToHex(cells, targetCell, friendlyFaction) {
  return ambush.hasFriendlyAdjacentToHex(cells, targetCell, friendlyFaction, {
    hexDistCells,
    getStr,
    unitFaction,
  })
}


function canSpotAmbushTarget(attackerUnit, attackerCell, targetUnit, targetCell, cells) {
  return ambush.canSpotAmbushTarget(attackerUnit, attackerCell, targetUnit, targetCell, cells, {
    unitFaction,
    hexDistCells,
    isArtilleryUnit,
    unitHasPropKey,
    rangeArrayFor,
    fireRangeTableMode,
    computeRevealedCellIdsForFaction,
    getStr,
  })
}


function clearAmbushOrderFully(unit) {
  return ambush.clearAmbushOrderFully(unit)
}


function revealAmbushesAdjacentToCell(cells, moverUnit, finalCell, le, ph) {
  return ambush.revealAmbushesAdjacentToCell(cells, moverUnit, finalCell, le, ph, {
    unitFaction,
    hexDistCells,
    getStr,
    opposing,
  })
}

function sumEmbarkedStrengthForTruck(cells, truckInstanceId) {
  return transport.sumEmbarkedStrengthForTruck(cells, truckInstanceId, {
    findUnitOnField,
    getStr,
  })
}


function sumEmbarkedInfantryStrengthForTruck(cells, truckInstanceId) {
  return transport.sumEmbarkedInfantryStrengthForTruck(cells, truckInstanceId, {
    findUnitOnField,
    getStr,
    isInfantryUnit,
  })
}


function sumEmbarkedArtilleryStrengthForTruck(cells, truckInstanceId) {
  return transport.sumEmbarkedArtilleryStrengthForTruck(cells, truckInstanceId, {
    findUnitOnField,
    getStr,
    isArtilleryUnit,
  })
}

function ensureTacticalBattle(u) {
  return transport.ensureTacticalBattle(u)
}

function ensureCarriedUnits(truckUnit) {
  return transport.ensureCarriedUnits(truckUnit)
}

/** Юнит уже в грузе какого‑либо грузовика (массив carriedUnits). */
function isUnitInAnyCarriedUnits(cells, instanceId) {
  return transport.isUnitInAnyCarriedUnits(cells, instanceId, { isTruckUnit })
}

function applyCargoDamageFromTruckHit(cells, truckUnit, dmg) {
  return transport.applyCargoDamageFromTruckHit(cells, truckUnit, dmg, {
    setStr,
    getStr,
    findUnitOnField,
  })
}

function canUnloadToCell(cell, faction, passengerInstanceId) {
  return transport.canUnloadToCell(cell, faction, passengerInstanceId, {
    terrainEntryCost,
    getStr,
    isTruckUnit,
    opposing,
    unitFaction,
  })
}


function syncCargoAfterTransportMove(cells, truckInstanceId) {
  return transport.syncCargoAfterTransportMove(cells, truckInstanceId, {
    findUnitOnField,
    isTruckUnit,
    syncUnitCoor,
    removeUnitFromCell,
    addUnitToCell,
  })
}

function resolveSpecialPhaseOrder(cells, o, le, ph) {
  return specialPhase.resolveSpecialPhaseOrder(cells, o, le, ph, {
    findUnitOnField,
    validateUnitOrdersAllowed,
    isTruckUnit,
    alliesSameFaction,
    hexDistCells,
    getAmmo,
    getAmmoCapacityMax,
    setAmmo,
    isInfantryUnit,
    isUnitInAnyCarriedUnits,
    getStr,
    sumEmbarkedInfantryStrengthForTruck,
    removeUnitFromCell,
    ensureTacticalBattle,
    syncUnitCoor,
    ensureCarriedUnits,
    addUnitToCell,
    canUnloadToCell,
    unitFaction,
    isArtilleryUnit,
    isArtilleryCollapsedForTow,
    sumEmbarkedArtilleryStrengthForTruck,
    clearArtillerySectorGeometry,
    isArtilleryDeployedForBattle,
    isValidDefendFacing,
    maxShootRangeStepsForUnit,
    computeDefendSectorIds,
  })
}

/**
 
 * @returns {string|null} 
 */
function validateLogisticsOrder(cells, o) {
  return logisticsValidation.validateLogisticsOrder(cells, o, {
    findUnitOnField,
    isTruckUnit,
    alliesSameFaction,
    hexDistCells,
    getAmmo,
    getAmmoCapacityMax,
    isInfantryUnit,
    isUnitInAnyCarriedUnits,
    getStr,
    sumEmbarkedInfantryStrengthForTruck,
    canUnloadToCell,
    unitFaction,
    isArtilleryUnit,
    isArtilleryCollapsedForTow,
    sumEmbarkedArtilleryStrengthForTruck,
  })
}

function resetTurnMovePointsForUnit(u) {
  return engineHelpers.resetTurnMovePointsForUnit(u, { setMovePoint, getMoveCap })
}


function resetTurnResources(cells) {
  return engineHelpers.resetTurnResources(cells, { setMovePoint, getMoveCap })
}


function moveWarDefenseBonus(targetInstanceId, ordersByUnit) {
  return overwatchCore.moveWarDefenseBonus(targetInstanceId, ordersByUnit)
}

function maxShootHexDistanceForUnit(u) {
  return overwatchCore.maxShootHexDistanceForUnit(u, { rangeArrayFor, fireRangeTableMode })
}


function defenderSeesCellForOverwatch(allCells, defCell, stepCell, defenderUnit) {
  return overwatchCore.defenderSeesCellForOverwatch(allCells, defCell, stepCell, defenderUnit, {
    hexDist,
    readVisionRange,
    isHexVisible,
    rangeArrayFor,
    fireRangeTableMode,
  })
}


function trySteadfastnessAfterOverwatchDamage(le, ph, unit, damageDealt) {
  return overwatchCore.trySteadfastnessAfterOverwatchDamage(le, ph, unit, damageDealt, {
    getStr,
    getMoraleThresholdForSteadfastness,
    roll2d6,
    ensureTacticalBattle,
    clearDefendOnUnit,
  })
}


function maybeAllDefendersReturnFireForAreaImpactCell(
  cells,
  shooterInstanceId,
  impactCellId,
  ordersByUnit,
  le,
  ph,
  steadfastnessQueue,
  sectorAggression,
  sectorReturnFired,
) {
  return overwatchFire.maybeAllDefendersReturnFireForAreaImpactCell(
    cells,
    shooterInstanceId,
    impactCellId,
    ordersByUnit,
    le,
    ph,
    steadfastnessQueue,
    sectorAggression,
    sectorReturnFired,
    {
      findUnitOnField,
      getStr,
      opposing,
      unitFaction,
    },
  )
}

/**

 * @param {number|undefined|null} fireImpactCellId 
 */
function maybeDefenderReturnFireAgainstShooter(
  cells,
  shooterInstanceId,
  defenderInstanceId,
  ordersByUnit,
  le,
  ph,
  steadfastnessQueue,
  sectorAggression,
  sectorReturnFired,
  fireImpactCellId,
) {
  return overwatchFire.maybeDefenderReturnFireAgainstShooter(
    cells,
    shooterInstanceId,
    defenderInstanceId,
    ordersByUnit,
    le,
    ph,
    steadfastnessQueue,
    sectorAggression,
    sectorReturnFired,
    fireImpactCellId,
    {
      findUnitOnField,
      getStr,
      defenderSeesCellForOverwatch,
      getAmmo,
      hexDist,
      rangeArrayFor,
      rangeArrayAmbushAccuracyBonus,
      fireRangeTableMode,
      intensityArrayFor,
      moveWarDefenseBonus,
      isHexVisible,
      unitHasPropKey,
      computeShoot,
      setAmmo,
      setStr,
      logUnitDestroyed,
      isTruckUnit,
      applyCargoDamageFromTruckHit,
      trySteadfastnessAfterOverwatchDamage,
      clearAmbushOrderFully,
    },
  )
}


function resolveDefendSectorIdleFire(
  cells,
  ordersByUnit,
  le,
  ph,
  movedInstanceIds,
  sectorAggression,
  sectorReturnFired,
) {
  return overwatchFire.resolveDefendSectorIdleFire(
    cells,
    ordersByUnit,
    le,
    ph,
    movedInstanceIds,
    sectorAggression,
    sectorReturnFired,
    {
      getStr,
      getAmmo,
      opposing,
      unitFaction,
      defenderSeesCellForOverwatch,
      hexDist,
      rangeArrayFor,
      rangeArrayAmbushAccuracyBonus,
      fireRangeTableMode,
      intensityArrayFor,
      moveWarDefenseBonus,
      isHexVisible,
      unitHasPropKey,
      computeShoot,
      setAmmo,
      setStr,
      logUnitDestroyed,
      isTruckUnit,
      applyCargoDamageFromTruckHit,
      sweepCorpses,
      findUnitOnField,
      trySteadfastnessAfterOverwatchDamage,
      clearAmbushOrderFully,
    },
  )
}

/**
 * @returns {{ fired: boolean, stopStepIndex: number|null, died: boolean }}
 */
function tryDefendOverwatchOnMovePath(cells, moverInstanceId, path, ordersByUnit, le, ph) {
  return overwatchFire.tryDefendOverwatchOnMovePath(cells, moverInstanceId, path, ordersByUnit, le, ph, {
    findUnitOnField,
    getStr,
    opposing,
    unitFaction,
    defenderSeesCellForOverwatch,
    hexDist,
    rangeArrayFor,
    rangeArrayAmbushAccuracyBonus,
    fireRangeTableMode,
    getAmmo,
    moveWarDefenseBonus,
    intensityArrayFor,
    isHexVisible,
    unitHasPropKey,
    computeShoot,
    setAmmo,
    clearAmbushOrderFully,
    setStr,
    logUnitDestroyed,
    sweepCorpses,
    trySteadfastnessAfterOverwatchDamage,
  })
}


function moveBudgetForOrderKey(movePoints, orderKey) {
  return engineHelpers.moveBudgetForOrderKey(movePoints, orderKey)
}

function isMoveOrderValid(cells, unitInstanceId, targetCellId, orderKey) {
  return engineHelpers.isMoveOrderValid(cells, unitInstanceId, targetCellId, orderKey, {
    findUnitOnField,
    isArtilleryDeployedForBattle,
    getMovePoint,
    computeRevealedCellIdsForFaction,
    unitFaction,
    findReachable,
  })
}


function attackReachBudget(unit) {
  return engineHelpers.attackReachBudget(unit, { getMoveCap })
}

function pathTerrainCostSlice(path, unit, endIdx) {
  return engineHelpers.pathTerrainCostSlice(path, unit, endIdx, { terrainEntryCost })
}

function cheapestEngagePath(cells, fromCell, unit, targetCell, fog) {
  return engineHelpers.cheapestEngagePath(cells, fromCell, unit, targetCell, fog, {
    getNeighbor,
    findCellByCoor,
    findPath,
    terrainEntryCost,
  })
}


function isSolitaryMeleeTargetCell(attackerUnit, defPack) {
  return engineHelpers.isSolitaryMeleeTargetCell(attackerUnit, defPack, {
    unitFaction,
    getStr,
    opposing,
  })
}


function moveAttackerOntoMeleeTargetCell(cells, attackerId, defenderId) {
  return engineHelpers.moveAttackerOntoMeleeTargetCell(cells, attackerId, defenderId, {
    findUnitOnField,
    hexDistCells,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
  })
}

function isAttackOrderValid(cells, attackerId, targetId) {
  return engineHelpers.isAttackOrderValid(cells, attackerId, targetId, {
    findUnitOnField,
    opposing,
    unitFaction,
    computeRevealedCellIdsForFaction,
    getNeighbor,
    findCellByCoor,
    findPath,
    terrainEntryCost,
    getMoveCap,
    getStr,
  })
}

function isTankUnit(u) {
  return morale.isTankUnit(u)
}

function hasTankFear(u) {
  return morale.hasTankFear(u, { unitHasPropKey })
}

function getMor(u) {
  return morale.getMor(u)
}


function getMoraleThresholdForSteadfastness(u) {
  return morale.getMoraleThresholdForSteadfastness(u, { isTruckUnit })
}

function roll2d6() {
  return morale.roll2d6()
}

/**
 * 
 * @param {boolean} suppressOnFail 
 * @param {boolean} abortAttackOnFail 
 */
function rollTankFearSteadfastness(le, ph, unit, tag, suppressOnFail, abortAttackOnFail) {
  return morale.rollTankFearSteadfastness(le, ph, unit, tag, suppressOnFail, abortAttackOnFail, {
    ensureTacticalBattle,
    clearDefendOnUnit,
  })
}

function tryAttackMoraleTests(le, ph, atkPack, defPack) {
  return morale.tryAttackMoraleTests(le, ph, atkPack, defPack, {
    isArmoredVehicleTarget,
    ensureTacticalBattle,
    clearDefendOnUnit,
    unitHasPropKey,
  })
}

function syncMeleeLinksAfterCasualties(cells) {
  return meleePhase.syncMeleeLinksAfterCasualties(cells, { getStr, findUnitOnField, hexDistCells })
}

function linkMeleeOpponents(ua, ub) {
  return meleePhase.linkMeleeOpponents(ua, ub, { ensureTacticalBattle })
}

function resolveMutualMeleeRound(cells, ordersByUnit, le, ph, idA, idB) {
  return meleePhase.resolveMutualMeleeRound(cells, ordersByUnit, le, ph, idA, idB, {
    findUnitOnField,
    hexDistCells,
    moveWarDefenseBonus,
    rangeArrayFor,
    getAmmo,
    intensityArrayFor,
    computeShoot,
    setAmmo,
    setStr,
    getStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
    ensureTacticalBattle,
  })
}

function attackMoveAlongPath(cells, unitId, path, ordersByUnit, le, ph, movedInstanceIds) {
  return meleePhase.attackMoveAlongPath(cells, unitId, path, ordersByUnit, le, ph, movedInstanceIds, {
    findUnitOnField,
    getMovePoint,
    terrainEntryCost,
    tryDefendOverwatchOnMovePath,
    getStr,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
    setMovePoint,
    isTruckUnit,
    syncCargoAfterTransportMove,
    revealAmbushesAdjacentToCell,
  })
}

function runOngoingMeleeRounds(cells, ordersByUnit, le, ph) {
  return meleePhase.runOngoingMeleeRounds(cells, ordersByUnit, le, ph, {
    getStr,
    getMeleeOpponentId,
    findUnitOnField,
    hexDistCells,
    moveWarDefenseBonus,
    rangeArrayFor,
    getAmmo,
    intensityArrayFor,
    computeShoot,
    setAmmo,
    setStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
    ensureTacticalBattle,
  })
}

function processSingleAttackOrder(cells, o, ordersByUnit, le, ph, movedInstanceIds) {
  return meleePhase.processSingleAttackOrder(cells, o, ordersByUnit, le, ph, movedInstanceIds, {
    findUnitOnField,
    opposing,
    unitFaction,
    validateUnitOrdersAllowed,
    isSolitaryMeleeTargetCell,
    isAmbushConcealed,
    canSpotAmbushTarget,
    getMeleeOpponentId,
    hexDistCells,
    computeRevealedCellIdsForFaction,
    cheapestEngagePath,
    attackReachBudget,
    getMovePoint,
    attackMoveAlongPath,
    revealAmbushesAdjacentToCell,
    tryAttackMoraleTests,
    moveAttackerOntoMeleeTargetCell,
    moveWarDefenseBonus,
    rangeArrayFor,
    getAmmo,
    intensityArrayFor,
    computeShoot,
    setAmmo,
    setStr,
    getStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
    ensureTacticalBattle,
    terrainEntryCost,
    tryDefendOverwatchOnMovePath,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
    setMovePoint,
    syncCargoAfterTransportMove,
  })
}

function resolveSuppressionRecovery(cells, le) {
  return morale.resolveSuppressionRecovery(cells, le, { PHASE_KEYS, getStr })
}

function validateUnitOrdersAllowed(unit) {
  return engineHelpers.validateUnitOrdersAllowed(unit, { getMeleeOpponentId })
}


function clearDefendOnUnit(unit) {
  return engineHelpers.clearDefendOnUnit(unit)
}

/**
 * @param {object[]} cells
 * @param {Map<number, object>} ordersByUnit 
 * @param {{ push: Function }} log
 * @param {number} [turnIndex] 
 */
function resolveTurn(cells, ordersByUnit, log, turnIndex) {
  resetTurnResources(cells)
  const steadfastnessQueue = []
  
  const movedInstanceIds = new Set()

  const sectorAggression = new Map()

  const sectorReturnFired = new Set()
  const tlog = turnIndex
  const le = (ph, text, meta) => log.push(logEntry(ph, text, tlog, meta))
  resolveSuppressionRecovery(cells, le)
  const orderEntries = [...ordersByUnit.entries()].filter(([id]) => {
    const f = findUnitOnField(cells, id)
    return f != null
  })

  
  for (const [uid, spec] of ordersByUnit.entries()) {
    const k = String(spec.orderKey || '').trim()
    if (k === 'defend' || k === 'ambush') continue
    const found = findUnitOnField(cells, uid)
    if (!found) continue
    if (isArtilleryUnit(found.unit) && k !== 'move' && k !== 'moveWar') continue
    clearDefendOnUnit(found.unit)
  }

  const byPhase = new Map()
  for (const [uid, spec] of orderEntries) {
    const ph = phaseForOrderKey(spec.orderKey)
    if (!byPhase.has(ph)) byPhase.set(ph, [])
    byPhase.get(ph).push({ unitId: uid, ...spec })
  }

  const phases = [
    PHASE_KEYS.fireHard,
    PHASE_KEYS.fire,
    PHASE_KEYS.steadfastnessFlush,
    PHASE_KEYS.defend,
    PHASE_KEYS.air,
    PHASE_KEYS.attack,
    PHASE_KEYS.ambush,
    PHASE_KEYS.special,
    PHASE_KEYS.move,
  ]

  for (const ph of phases) {
    const list = byPhase.get(ph) || []
    if (ph === PHASE_KEYS.steadfastnessFlush) {
      for (const q of steadfastnessQueue) {
        const p = findUnitOnField(cells, q.id)
        if (p && getStr(p.unit) > 0) {
          trySteadfastnessAfterOverwatchDamage(le, PHASE_KEYS.steadfastnessFlush, p.unit, q.dmg)
        }
      }
      steadfastnessQueue.length = 0
      continue
    }
    if (ph === PHASE_KEYS.defend) {
      defendAmbushPhase.processDefendPhase(cells, list, le, ph, {
        findUnitOnField,
        validateUnitOrdersAllowed,
        isArtilleryUnit,
        isArtilleryDeployedForBattle,
        isValidDefendFacing,
        maxShootRangeStepsForUnit,
        computeDefendSectorIds,
      })
      continue
    }
    if (ph === PHASE_KEYS.air) continue
    if (ph === PHASE_KEYS.special) {
      for (const o of list) {
        resolveSpecialPhaseOrder(cells, o, le, ph)
      }
      sweepCorpses(cells)
      continue
    }

    if (ph === PHASE_KEYS.fireHard || ph === PHASE_KEYS.fire) {
      firePhase.processFirePhase(
        cells,
        list,
        ordersByUnit,
        le,
        ph,
        steadfastnessQueue,
        sectorAggression,
        sectorReturnFired,
        {
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
        },
      )
      continue
    }

    if (ph === PHASE_KEYS.attack) {
      runOngoingMeleeRounds(cells, ordersByUnit, le, ph)
      sweepCorpses(cells)
      for (const o of list) {
        processSingleAttackOrder(cells, o, ordersByUnit, le, ph, movedInstanceIds)
        sweepCorpses(cells)
      }
      syncMeleeLinksAfterCasualties(cells)
      continue
    }

    if (ph === PHASE_KEYS.ambush) {
      defendAmbushPhase.processAmbushPhase(cells, list, le, ph, {
        findUnitOnField,
        validateUnitOrdersAllowed,
        isArtilleryUnit,
        isArtilleryDeployedForBattle,
        isValidDefendFacing,
        maxShootRangeStepsForUnit,
        computeDefendSectorIds,
        cellBlocksLineOfSight,
      })
      continue
    }

    if (ph === PHASE_KEYS.move) {
      movePhase.processMovePhase(cells, list, ordersByUnit, le, ph, movedInstanceIds, {
        findUnitOnField,
        validateUnitOrdersAllowed,
        getMovePoint,
        moveBudgetForOrderKey,
        computeRevealedCellIdsForFaction,
        unitFaction,
        findReachable,
        findPath,
        tryDefendOverwatchOnMovePath,
        getStr,
        terrainEntryCost,
        removeUnitFromCell,
        addUnitToCell,
        syncUnitCoor,
        setMovePoint,
        revealAmbushesAdjacentToCell,
        isTruckUnit,
        syncCargoAfterTransportMove,
      })
    }
  }
  resolveDefendSectorIdleFire(
    cells,
    ordersByUnit,
    le,
    PHASE_KEYS.move,
    movedInstanceIds,
    sectorAggression,
    sectorReturnFired,
  )

  resetTurnResources(cells)
}

module.exports = {
  resolveTurn,
  normalizeFireObject,
  splitNums,
  PHASE_KEYS,
  phaseForOrderKey,
  findUnitOnField,
  hexDist,
  unitFaction,
  factionsOpposed: opposing,
  isMoveOrderValid,
  isAttackOrderValid,
  validateUnitOrdersAllowed,
  validateLogisticsOrder,
  isInfantryUnit,
  isArtilleryUnit,
  isArmoredVehicleTarget,
  isArtilleryDeployedForBattle,
  isArtilleryFireTargetCellAllowed,
  getAmmoForValidate: getAmmo,
  canSpotAmbushTarget,
  unitHasPropKey,
  validateArtilleryAreaFireOnCellOnly,
  shootingAccuracyAtHexDistance,
  hexDistCells,
}

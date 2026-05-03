'use strict'

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
  for (const o of list) {
    const atk = findUnitOnField(cells, o.unitId)
    if (!atk) continue
    const tidRaw = o.targetUnitInstanceId
    const tcidRaw = o.targetCellId
    const tidHas = tidRaw != null && Number.isFinite(Number(tidRaw))
    const tcidHas = tcidRaw != null && Number.isFinite(Number(tcidRaw))
    if (!tidHas && tcidHas) {
      const okOrder = isSup ? 'fireHard' : 'fire'
      const errCell = validateArtilleryAreaFireOnCellOnly(cells, atk, Number(tcidRaw), okOrder)
      if (errCell) {
        le(ph, `Юнит ${atk.unit.instanceId}: ${errCell}`)
        continue
      }
      const tcOnly = cells.find((c) => Number(c.id) === Number(tcidRaw))
      if (!tcOnly) continue
      const nOpp = countOpposingHostilesOnCell(tcOnly, atk.unit)
      if (nOpp === 0) {
        setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
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
      const targetsAll = collectOpposingHostilesOnCell(tcOnly, atk.unit)
      if (!targetsAll.length) {
        setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
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
        let blockedArmor = false
        for (let ti = 0; ti < targetsAll.length; ti++) {
          if (isArmoredVehicleTarget(targetsAll[ti])) {
            blockedArmor = true
            break
          }
        }
        if (blockedArmor) {
          le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
          continue
        }
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
      const raAf = rangeArrayFor(atk.unit)
      const rModeAf = fireRangeTableMode(raAf)
      const outOfRangeAf =
        rModeAf === 'ranged' ? dAf < 1 || dAf >= raAf.length : dAf > raAf.length
      if (outOfRangeAf) {
        le(ph, `Юнит ${atk.unit.instanceId}: цель вне дальности (${dAf})`)
        continue
      }
      if (getAmmo(atk.unit) < ammoCost) {
        le(
          ph,
          isSup
            ? `Юнит ${atk.unit.instanceId}: мало БК для подавления (нужно ${ammoCost})`
            : `Юнит ${atk.unit.instanceId}: нет боеприпасов`,
        )
        continue
      }
      const losClearAf =
        artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, tcOnly, cells)
      if (!losClearAf && !unitHasPropKey(atk.unit, 'concealedTargetFire')) {
        le(
          ph,
          `Юнит ${atk.unit.instanceId}: нет прямой видимости на цель (нужно свойство «Стрельба по закрытым целям»)`,
        )
        continue
      }
      const stackDivAf = 1
      const artilleryClosedSalvo =
        !losClearAf && unitHasPropKey(atk.unit, 'concealedTargetFire')
      const salvoAf = computeShootSalvoCore(
        atk.unit,
        primary,
        tcOnly,
        dAf,
        raAf,
        isSup,
        undefined,
        artilleryClosedSalvo,
        stackDivAf,
      )
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
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
    if (isArtilleryUnit(atk.unit)) {
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
    const ra = rangeArrayFor(atk.unit)
    const rMode = fireRangeTableMode(ra)
    const outOfRange =
      rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
    if (outOfRange) {
      le(ph, `Юнит ${atk.unit.instanceId}: цель вне дальности (${d})`)
      continue
    }
    if (getAmmo(atk.unit) < ammoCost) {
      le(
        ph,
        isSup
          ? `Юнит ${atk.unit.instanceId}: мало БК для подавления (нужно ${ammoCost})`
          : `Юнит ${atk.unit.instanceId}: нет боеприпасов`,
      )
      continue
    }
    const losClear =
      artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, def.cell, cells)
    let artilleryClosed = false
    if (!losClear) {
      if (!unitHasPropKey(atk.unit, 'concealedTargetFire')) {
        le(
          ph,
          `Юнит ${atk.unit.instanceId}: нет прямой видимости на цель (нужно свойство «Стрельба по закрытым целям»)`,
        )
        continue
      }
      artilleryClosed = true
    }
    const isAreaArt = unitHasPropKey(atk.unit, 'areaFire')

    if (isAreaArt) {
      const targetsAll = collectOpposingHostilesOnCell(def.cell, atk.unit)
      if (isInfantryUnit(atk.unit)) {
        let blockedArmor2 = false
        for (let ti = 0; ti < targetsAll.length; ti++) {
          if (isArmoredVehicleTarget(targetsAll[ti])) {
            blockedArmor2 = true
            break
          }
        }
        if (blockedArmor2) {
          le(ph, `Юнит ${atk.unit.instanceId}: пехота не стреляет по бронетехнике и танкам`)
          continue
        }
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
      const salvo = computeShootSalvoCore(
        atk.unit,
        def.unit,
        def.cell,
        d,
        ra,
        isSup,
        undefined,
        artilleryClosed,
        stackDiv,
      )
      if (clearAmbushOrderFully(atk.unit)) {
        le(ph, `Засада снята: юнит ${atk.unit.instanceId} (открытый огонь)`, {
          unitInstanceId: Number(atk.unit.instanceId),
          ambushCleared: true,
        })
      }
      setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
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
      const res = computeShoot(
        atk.unit,
        def.unit,
        def.cell,
        d,
        ia,
        ra,
        isSup,
        undefined,
        warDef,
        undefined,
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
      setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
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

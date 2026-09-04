'use strict'

const recon = require('../lib/recon/battleReconResolve')
const { getStorageAmmo, setStorageAmmo, hasStorage } = require('../lib/map/battleStorage')
const { startMedicalJob, clearMedicalJob } = require('../lib/unit/battleMedical')
const { unitUsesGunDeploy } = require('../core/battleUnitType')

function resolveSpecialPhaseOrder(cells, o, le, ph, deps) {
  const {
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
  } = deps

  const k = String(o.orderKey || '').trim()
  const cur = findUnitOnField(cells, o.unitId)
  if (!cur) {
    le(ph, `Спецприказ: юнит ${o.unitId} не на поле`)
    return
  }
  const stBlock = validateUnitOrdersAllowed(cur.unit, k)
  if (stBlock) {
    le(ph, `Спецприказ: юнит ${o.unitId} — ${stBlock}`)
    return
  }
  if (k === 'getSup') {
    const tid = o.targetUnitInstanceId
    const tgt = findUnitOnField(cells, tid)
    if (!tgt || !isTruckUnit(cur.unit) || !alliesSameFaction(cur.unit, tgt.unit)) {
      le(ph, `Передача БК: юнит ${cur.unit.instanceId} — отклонено`)
      return
    }
    if (hexDistCells(cur.cell, tgt.cell) > 1) {
      le(ph, `Передача БК: ${cur.unit.instanceId} — цель не рядом`)
      return
    }
    const special = require('../lib/map/battleSpecialTerrain')
    if (special.unitInvolvesWaterUnit(cur.unit, tgt.unit) && hexDistCells(cur.cell, tgt.cell) !== 1) {
      le(ph, `Передача БК: ${cur.unit.instanceId} — у водного отряда цель должна быть в соседнем гексе`)
      return
    }
    const want = Math.floor(Number(o.transferAmmo))
    if (!Number.isFinite(want) || want < 1) {
      le(ph, `Передача БК: ${cur.unit.instanceId} — неверное количество`)
      return
    }
    const have = getAmmo(cur.unit)
    const cap = getAmmoCapacityMax(tgt.unit)
    const rec = getAmmo(tgt.unit)
    const headroom = Math.max(0, cap - rec)
    const give = Math.min(want, have, headroom)
    if (give < 1) {
      le(ph, `Передача БК: ${cur.unit.instanceId} → ${tgt.unit.instanceId} — нельзя передать`)
      return
    }
    setAmmo(cur.unit, have - give)
    setAmmo(tgt.unit, rec + give)
    le(ph, `Передача БК: грузовик ${cur.unit.instanceId} → ${tgt.unit.instanceId}, +${give}`, {
      logisticsLine: {
        orderKey: 'getSup',
        fromInstanceId: Number(cur.unit.instanceId),
        toInstanceId: Number(tgt.unit.instanceId),
        amount: give,
      },
    })
    return
  }
  if (k === 'loadingSup') {
    const cid = Number(o.targetCellId)
    const wh = cells.find((c) => Number(c.id) === cid)
    if (!wh || !isTruckUnit(cur.unit)) {
      le(ph, `Загрузка со склада: юнит ${cur.unit.instanceId} — отклонено`)
      return
    }
    if (hexDistCells(cur.cell, wh) > 1) {
      le(ph, `Загрузка со склада: ${cur.unit.instanceId} — склад не рядом`)
      return
    }
    const specialWh = require('../lib/map/battleSpecialTerrain')
    if (specialWh.unitInvolvesWaterUnit(cur.unit) && hexDistCells(cur.cell, wh) !== 1) {
      le(ph, `Загрузка со склада: ${cur.unit.instanceId} — у водного отряда склад должен быть в соседнем гексе`)
      return
    }
    if (!hasStorage(wh)) {
      le(ph, `Загрузка со склада: ${cur.unit.instanceId} — нет склада`)
      return
    }
    const want = Math.floor(Number(o.transferAmmo))
    if (!Number.isFinite(want) || want < 1) {
      le(ph, `Загрузка со склада: ${cur.unit.instanceId} — неверное количество`)
      return
    }
    const stock = getStorageAmmo(wh)
    const have = getAmmo(cur.unit)
    const cap = getAmmoCapacityMax(cur.unit)
    const headroom = Math.max(0, cap - have)
    const take = Math.min(want, stock, headroom)
    if (take < 1) {
      le(ph, `Загрузка со склада: ${cur.unit.instanceId} — нельзя взять БК`)
      return
    }
    setStorageAmmo(wh, stock - take)
    setAmmo(cur.unit, have + take)
    le(ph, `Загрузка со склада: грузовик ${cur.unit.instanceId} ← кл. ${cid}, +${take}`, {
      logisticsLine: {
        orderKey: 'loadingSup',
        fromInstanceId: Number(cur.unit.instanceId),
        toCellId: cid,
        amount: take,
      },
    })
    return
  }
  if (k === 'loading') {
    const tid = o.targetUnitInstanceId
    const tgt = findUnitOnField(cells, tid)
    if (!tgt || !isTruckUnit(cur.unit) || !isInfantryUnit(tgt.unit) || !alliesSameFaction(cur.unit, tgt.unit)) {
      le(ph, `Погрузка: ${cur.unit.instanceId} — отклонено`)
      return
    }
    if (hexDistCells(cur.cell, tgt.cell) !== 1) {
      le(ph, `Погрузка: ${cur.unit.instanceId} — пехота не рядом`)
      return
    }
    if (isUnitInAnyCarriedUnits(cells, tgt.unit.instanceId)) {
      le(ph, `Погрузка: ${tgt.unit.instanceId} уже в транспорте`)
      return
    }
    const tacP = tgt.unit.tactical
    if (tacP && tacP.embarkedTransportInstanceId) {
      le(ph, `Погрузка: ${tgt.unit.instanceId} уже в транспорте`)
      return
    }
    const cap = getStr(cur.unit)
    const used = sumEmbarkedInfantryStrengthForTruck(cells, cur.unit.instanceId)
    if (used + getStr(tgt.unit) > cap) {
      le(ph, `Погрузка: превышена грузоподъёмность пехоты (${used}+${getStr(tgt.unit)} > ${cap})`)
      return
    }
    const trenchLoad = require('../lib/map/battleTrench')
    trenchLoad.leaveTrench(tgt.unit, tgt.cell)
    removeUnitFromCell(tgt.cell, tgt.unit.instanceId)
    const passTac = ensureTacticalBattle(tgt.unit)
    delete passTac.embarkedTransportInstanceId
    delete passTac.towedByInstanceId
    delete passTac.towingTargetInstanceId
    syncUnitCoor(tgt.unit, cur.cell)
    ensureCarriedUnits(cur.unit).push(tgt.unit)
    le(ph, `Погрузка: пехота ${tgt.unit.instanceId} в кузов ${cur.unit.instanceId}`, {
      logisticsLine: {
        orderKey: 'loading',
        fromInstanceId: Number(cur.unit.instanceId),
        toInstanceId: Number(tgt.unit.instanceId),
      },
    })
    return
  }
  if (k === 'unloading') {
    if (!isTruckUnit(cur.unit)) {
      le(ph, `Выгрузка: приказ отдаёт грузовик`)
      return
    }
    const cargoId = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(cargoId)) {
      le(ph, `Выгрузка: укажите груз (targetUnitInstanceId)`)
      return
    }
    const arr = ensureCarriedUnits(cur.unit)
    const idx = arr.findIndex((u) => Number(u.instanceId) === cargoId)
    if (idx < 0) {
      le(ph, `Выгрузка: юнит ${cargoId} не в кузове ${cur.unit.instanceId}`)
      return
    }
    const cargo = arr[idx]
    const cid = o.targetCellId
    const tc = cells.find((c) => Number(c.id) === Number(cid))
    if (!tc) {
      le(ph, `Выгрузка: клетка не найдена`)
      return
    }
    if (hexDistCells(cur.cell, tc) > 1) {
      le(ph, `Выгрузка: клетка ${cid} не рядом с грузовиком`)
      return
    }
    if (!canUnloadToCell(tc, unitFaction(cargo), cargoId)) {
      le(ph, `Выгрузка: на клетку ${cid} нельзя`)
      return
    }
    arr.splice(idx, 1)
    addUnitToCell(tc, cargo)
    syncUnitCoor(cargo, tc)
    le(ph, `Выгрузка: ${cargoId} → клетка ${tc.id}`, {
      logisticsLine: {
        orderKey: 'unloading',
        fromInstanceId: Number(cur.unit.instanceId),
        toInstanceId: Number(cargoId),
        toCellId: Number(tc.id),
      },
    })
    return
  }
  if (k === 'tow') {
    const tid = o.targetUnitInstanceId
    const tgt = findUnitOnField(cells, tid)
    if (!tgt || !isTruckUnit(cur.unit) || !isArtilleryUnit(tgt.unit) || !alliesSameFaction(cur.unit, tgt.unit)) {
      le(ph, `Буксир: ${cur.unit.instanceId} — отклонено`)
      return
    }
    if (!isArtilleryCollapsedForTow(tgt.unit)) {
      le(ph, `Буксир: орудие должно быть свёрнуто (свёртывание)`)
      return
    }
    if (hexDistCells(cur.cell, tgt.cell) !== 1) {
      le(ph, `Буксир: орудие не рядом`)
      return
    }
    if (isUnitInAnyCarriedUnits(cells, tgt.unit.instanceId)) {
      le(ph, `Буксир: цель уже в транспорте`)
      return
    }
    if (tgt.unit.tactical && tgt.unit.tactical.embarkedTransportInstanceId) {
      le(ph, `Буксир: цель погружена`)
      return
    }
    const cap = getStr(cur.unit)
    const used = sumEmbarkedArtilleryStrengthForTruck(cells, cur.unit.instanceId)
    if (used + getStr(tgt.unit) > cap) {
      le(ph, `Буксир: превышена грузоподъёмность артиллерии (${used}+${getStr(tgt.unit)} > ${cap})`)
      return
    }
    const trenchTow = require('../lib/map/battleTrench')
    trenchTow.leaveTrench(tgt.unit, tgt.cell)
    removeUnitFromCell(tgt.cell, tgt.unit.instanceId)
    const tTowed = ensureTacticalBattle(tgt.unit)
    delete tTowed.embarkedTransportInstanceId
    delete tTowed.towedByInstanceId
    delete tTowed.towingTargetInstanceId
    syncUnitCoor(tgt.unit, cur.cell)
    ensureCarriedUnits(cur.unit).push(tgt.unit)
    le(ph, `Буксир: орудие ${tgt.unit.instanceId} в кузов ${cur.unit.instanceId}`, {
      logisticsLine: {
        orderKey: 'tow',
        fromInstanceId: Number(cur.unit.instanceId),
        toInstanceId: Number(tgt.unit.instanceId),
      },
    })
    return
  }
  if (k === 'clotting') {
    if (!unitUsesGunDeploy(cur.unit)) {
      le(ph, `Свёртывание: только орудие с сектором стрельбы`)
      return
    }
    const t = ensureTacticalBattle(cur.unit)
    t.artilleryDeployed = false
    delete t.defendOrder
    delete t.ambushOrder
    const trench = require('../lib/map/battleTrench')
    trench.leaveTrench(cur.unit, cur.cell)
    clearArtillerySectorGeometry(cur.unit)
    le(ph, `Артиллерия ${cur.unit.instanceId}: свёрнута — можно передвигаться`)
    return
  }
  if (k === 'deploy') {
    if (!unitUsesGunDeploy(cur.unit)) {
      le(ph, `Развёртывание: только орудие с сектором стрельбы`)
      return
    }
    if (isArtilleryDeployedForBattle(cur.unit)) {
      le(ph, `Артиллерия ${cur.unit.instanceId} уже развёрнута`)
      return
    }
    const fidA = o.defendFacingCellId
    if (fidA == null || !isValidDefendFacing(cur.cell, fidA, cells)) {
      le(ph, `Развёртывание: артиллерия ${cur.unit.instanceId} — укажите соседний гекс направления орудия`)
      return
    }
    const fCellA = cells.find((c) => Number(c.id) === Number(fidA))
    if (!fCellA) {
      le(ph, `Развёртывание: артиллерия ${cur.unit.instanceId} — клетка направления не найдена`)
      return
    }
    const rcapA = Number(o.defendMaxRangeSteps)
    if (!Number.isFinite(rcapA) || rcapA < 1) {
      le(ph, `Развёртывание: артиллерия ${cur.unit.instanceId} — укажите дистанцию сектора обстрела`)
      return
    }
    const wmaxA = maxShootRangeStepsForUnit(cur.unit)
    if (rcapA > wmaxA) {
      le(ph, `Развёртывание: артиллерия ${cur.unit.instanceId} — дистанция больше максимальной для орудия`)
      return
    }
    const sectorIdsA = computeDefendSectorIds(cells, cur.cell, fCellA, cur.unit, rcapA)
    if (!sectorIdsA.length) {
      le(ph, `Развёртывание: артиллерия ${cur.unit.instanceId} — пустой сектор обстрела`)
      return
    }
    const t = ensureTacticalBattle(cur.unit)
    t.artilleryDeployed = true
    delete t.defendOrder
    delete t.ambushOrder
    t.artilleryFireSector = true
    cur.unit.defendFacingCellId = Number(fidA)
    cur.unit.defendMaxRangeSteps = Math.floor(rcapA)
    cur.unit.defendSectorCellIds = sectorIdsA
    le(ph, `Артиллерия ${cur.unit.instanceId}: развёрнута, сектор ${sectorIdsA.length} кл., дист. ${Math.floor(rcapA)}`, {
      deploySector: true,
      defendFacingCellId: Number(fidA),
      defendMaxRangeSteps: Math.floor(rcapA),
      defendSectorCellIds: sectorIdsA,
      unitInstanceId: Number(cur.unit.instanceId),
    })
    return
  }
  if (k === 'changeSector') {
    if (!unitUsesGunDeploy(cur.unit)) {
      le(ph, `Смена сектора: только орудие с сектором стрельбы`)
      return
    }
    if (!isArtilleryDeployedForBattle(cur.unit)) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — сначала «Развёртывание»`)
      return
    }
    const fidA = o.defendFacingCellId
    if (fidA == null || !isValidDefendFacing(cur.cell, fidA, cells)) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — укажите соседний гекс направления орудия`)
      return
    }
    const fCellA = cells.find((c) => Number(c.id) === Number(fidA))
    if (!fCellA) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — клетка направления не найдена`)
      return
    }
    const rcapA = Number(o.defendMaxRangeSteps)
    if (!Number.isFinite(rcapA) || rcapA < 1) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — укажите дистанцию сектора`)
      return
    }
    const wmaxA = maxShootRangeStepsForUnit(cur.unit)
    if (rcapA > wmaxA) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — дистанция больше максимальной`)
      return
    }
    const sectorIdsA = computeDefendSectorIds(cells, cur.cell, fCellA, cur.unit, rcapA)
    if (!sectorIdsA.length) {
      le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId} — пустой сектор`)
      return
    }
    const t = ensureTacticalBattle(cur.unit)
    delete t.defendOrder
    delete t.ambushOrder
    t.artilleryFireSector = true
    cur.unit.defendFacingCellId = Number(fidA)
    cur.unit.defendMaxRangeSteps = Math.floor(rcapA)
    cur.unit.defendSectorCellIds = sectorIdsA
    le(ph, `Смена сектора: артиллерия ${cur.unit.instanceId}, ${sectorIdsA.length} кл., дист. ${Math.floor(rcapA)}`, {
      changeSector: true,
      defendFacingCellId: Number(fidA),
      defendMaxRangeSteps: Math.floor(rcapA),
      defendSectorCellIds: sectorIdsA,
      unitInstanceId: Number(cur.unit.instanceId),
    })
    return
  }

  if (k === 'enterDot') {
    const dotMod = require('../lib/map/battleDot')
    dotMod.resolveEnterDot(cells, cur, o, le, ph, {
      hexDistCells,
      isInfantryUnit,
      isArtilleryUnit,
      getStr,
      removeUnitFromCell,
      addUnitToCell,
      syncUnitCoor,
      ensureTacticalBattle,
      clearDefendOnUnit: deps.clearDefendOnUnit,
      findUnitOnField,
    })
    return
  }

  if (k === 'exitDot') {
    const dotMod = require('../lib/map/battleDot')
    dotMod.resolveExitDot(cells, cur, o, le, ph, {
      isInfantryUnit,
      isArtilleryUnit,
      ensureTacticalBattle,
      hexDistCells,
      getStr,
    })
    return
  }

  if (k === 'trenches') {
    const trench = require('../lib/map/battleTrench')
    if (trench.isTrenchDigging(cur.unit)) {
      le(ph, `Окопаться: ${cur.unit.instanceId} уже копает окоп`)
      return
    }
    if (getStr(cur.unit) < trench.TRENCH_DIG_MIN_STR) {
      le(ph, `Окопаться: ${cur.unit.instanceId} — нужна численность не менее ${trench.TRENCH_DIG_MIN_STR}`)
      return
    }
    if (trench.isTrenchForbiddenOnCell(cur.cell)) {
      le(ph, `Окопаться: на кл. ${cur.cell.id} нельзя ставить окоп`)
      return
    }
    const fid = o.defendFacingCellId != null ? o.defendFacingCellId : o.targetCellId
    if (fid == null) {
      le(ph, `Окопаться: ${cur.unit.instanceId} — укажите соседний гекс направления`)
      return
    }
    const fCell = cells.find((c) => Number(c.id) === Number(fid))
    if (!fCell) {
      le(ph, `Окопаться: ${cur.unit.instanceId} — клетка направления не найдена`)
      return
    }
    if (hexDistCells(cur.cell, fCell) !== 1) {
      le(ph, `Окопаться: ${cur.unit.instanceId} — направление должно быть соседним гексом`)
      return
    }
    const dir = trench.findMoveDir(cur.cell, fCell)
    if (dir < 0) {
      le(ph, `Окопаться: ${cur.unit.instanceId} — неверное направление`)
      return
    }
    const visualEdge = trench.moveDirToVisualEdge(dir)
    if (trench.hasTrenchOnEdge(cur.cell.builds, visualEdge)) {
      le(ph, `Окопаться: на кл. ${cur.cell.id} окоп с этой стороны уже есть`)
      return
    }
    const duration = trench.readTrenchDigDuration(cur.unit)
    trench.startTrenchDig(cur.unit, cur.cell, visualEdge, duration)
    le(ph, `Окопаться: юнит ${cur.unit.instanceId} начал копать окоп на кл. ${cur.cell.id} (${duration} ход.)`, {
      trenchDigging: true,
      trenchDigTurnsLeft: duration,
      trenchCellId: Number(cur.cell.id),
      trenchEdgeDir: visualEdge,
      unitInstanceId: Number(cur.unit.instanceId),
    })
    return
  }

  if (k === 'cutWire') {
    const wireEdges = require('../lib/map/battleWireEdges')
    const tid = o.targetCellId
    if (tid == null) {
      le(ph, `Снятие проволоки: ${cur.unit.instanceId} — не указана цель`)
      return
    }
    const tgtCell = cells.find((c) => Number(c.id) === Number(tid))
    if (!tgtCell) {
      le(ph, `Снятие проволоки: ${cur.unit.instanceId} — клетка не найдена`)
      return
    }
    const dist = hexDistCells(cur.cell, tgtCell)
    if (dist > 1) {
      le(ph, `Снятие проволоки: ${cur.unit.instanceId} — цель дальше соседней`)
      return
    }
    let cleared = false
    if (dist === 0) {
      const edgeDir = Math.floor(Number(o.wireEdgeDir != null ? o.wireEdgeDir : o.trenchEdgeDir))
      if (!Number.isFinite(edgeDir) || edgeDir < 0 || edgeDir > 5) {
        le(ph, `Снятие проволоки: ${cur.unit.instanceId} — укажите грань с проволокой`)
        return
      }
      cleared = wireEdges.cutWireOnCellEdge(tgtCell, edgeDir)
    } else {
      cleared = wireEdges.cutWireAlongSharedEdge(cur.cell, tgtCell)
    }
    if (!cleared) {
      le(ph, `Снятие проволоки: на указанной грани нет проволоки`)
      return
    }
    le(ph, `Снятие проволоки: юнит ${cur.unit.instanceId} снял проволоку у кл. ${tgtCell.id}`)
    return
  }

  if (k === 'buildPonton') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startBuildPonton(cells, cur, o, le, ph, {
      getStr,
      hexDistCells,
      unitFaction,
      removeUnitFromCell,
      addUnitToCell,
      syncUnitCoor,
    })
    return
  }

  if (k === 'cutEj') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startCutEj(cells, cur, o, le, ph, { hexDistCells })
    return
  }

  if (k === 'demining') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startDemining(cells, cur, o, le, ph, { hexDistCells })
    return
  }

  if (k === 'mining') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startMining(cells, cur, o, le, ph)
    return
  }

  if (k === 'svzy') {
    return
  }

  if (k === 'razvedka') {
    recon.resolveGroundReconAnalog({
      unit: cur.unit,
      scoutCell: cur.cell,
      cells,
      radiusSteps: o.reconRangeSteps,
      le,
      ph,
    })
    return
  }

  if (k === 'railLoading') {
    const railway = require('../lib/map/battleRailway')
    railway.startRailLoading(cells, cur, o, le, ph, {
      hexDistCells,
      findUnitOnField,
      getStr,
      isUnitInAnyCarriedUnits,
      alliesSameFaction,
    })
    return
  }

  if (k === 'railUnloading') {
    const railway = require('../lib/map/battleRailway')
    railway.startRailUnloading(cells, cur, o, le, ph, {
      hexDistCells,
      canUnloadToCell,
      unitFaction,
      ensureCarriedUnits,
    })
    return
  }

  if (k === 'explomost' || k === 'demolition') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startDemolition(cells, cur, o, le, ph, { hexDistCells })
    return
  }

  if (k === 'repairRailway') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startRepairRailway(cells, cur, o, le, ph, { hexDistCells })
    return
  }

  if (k === 'arson') {
    const sapper = require('../lib/map/battleSapperJobs')
    sapper.startArson(cells, cur, o, le, ph)
    return
  }

  if (k === 'medical') {
    const tid = o.targetUnitInstanceId
    const tgt = tid != null && Number.isFinite(Number(tid)) ? findUnitOnField(cells, tid) : null
    if (!tgt) {
      clearMedicalJob(cur.unit)
      le(ph, `Лечение: юнит ${cur.unit.instanceId} — цель не на поле`)
      return
    }
    if (hexDistCells(cur.cell, tgt.cell) > 1) {
      clearMedicalJob(cur.unit)
      le(ph, `Лечение: помощь отряду ${tgt.unit.instanceId} прервана — цель вне области санитара`)
      return
    }
    startMedicalJob(cur.unit, tgt.unit.instanceId)
    le(
      ph,
      `Лечение: юнит ${cur.unit.instanceId} оказывает помощь отряду ${tgt.unit.instanceId} (+1 З, пока цель рядом)`,
    )
    return
  }
}

module.exports = {
  resolveSpecialPhaseOrder,
}

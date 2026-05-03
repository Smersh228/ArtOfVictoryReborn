'use strict'

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
  const stBlock = validateUnitOrdersAllowed(cur.unit)
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
    if (hexDistCells(cur.cell, tgt.cell) !== 1) {
      le(ph, `Передача БК: ${cur.unit.instanceId} — цель не рядом`)
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
    if (!isArtilleryUnit(cur.unit)) {
      le(ph, `Свёртывание: только артиллерия`)
      return
    }
    const t = ensureTacticalBattle(cur.unit)
    t.artilleryDeployed = false
    delete t.defendOrder
    delete t.ambushOrder
    clearArtillerySectorGeometry(cur.unit)
    le(ph, `Артиллерия ${cur.unit.instanceId}: свёрнута — можно передвигаться`)
    return
  }
  if (k === 'deploy') {
    if (!isArtilleryUnit(cur.unit)) {
      le(ph, `Развёртывание: только артиллерия`)
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
    if (!isArtilleryUnit(cur.unit)) {
      le(ph, `Смена сектора: только артиллерия`)
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
}

module.exports = {
  resolveSpecialPhaseOrder,
}

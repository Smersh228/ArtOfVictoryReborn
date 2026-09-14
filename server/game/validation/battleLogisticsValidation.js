'use strict'

const { hasStorage } = require('../lib/map/battleStorage')
const supply = require('../lib/unit/battleSupplyTransfer')

function validateLogisticsOrder(cells, o, deps) {
  const {
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
    canTechTowArtillery,
    sumEmbarkedArtilleryStrengthForTruck,
  } = deps

  const ok = String(o.orderKey || '').trim()
  if (!['getSup', 'loadingSup', 'loading', 'unloading', 'tow'].includes(ok)) return null
  const uid = Number(o.unitInstanceId)
  if (!Number.isFinite(uid)) return 'нет unitInstanceId'
  const cur = findUnitOnField(cells, uid)
  if (!cur) return 'юнит не на поле'

  if (ok === 'getSup') {
    const tid = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(tid)) return 'нужна цель (targetUnitInstanceId)'
    const want = supply.readTransferWants(o)
    if (!isTruckUnit(cur.unit)) return 'передаёт припасы только грузовик'
    const tgt = findUnitOnField(cells, tid)
    if (!tgt) return 'цель не на поле'
    if (!alliesSameFaction(cur.unit, tgt.unit)) return 'можно снабжать только союзника'
    const special = require('../lib/map/battleSpecialTerrain')
    const dist = hexDistCells(cur.cell, tgt.cell)
    if (special.unitInvolvesWaterUnit(cur.unit, tgt.unit)) {
      if (dist !== 1) return 'у водного отряда припасы должны быть в соседнем гексе'
    } else if (dist > 1) {
      return 'цель в соседнем гексе или на том же'
    }
    const maxes = supply.maxTruckToUnit(cur.unit, tgt.unit)
    if (supply.wantsTotal(maxes) < 1) return 'нет припасов для передачи или у получателя нет места'
    return supply.validateWantsAgainstMax(want, maxes)
  }
  if (ok === 'loadingSup') {
    const cid = Number(o.targetCellId)
    const want = supply.readTransferWants(o)
    if (!Number.isFinite(cid)) return 'нужна клетка склада (targetCellId)'
    if (!isTruckUnit(cur.unit)) return 'со склада грузит только грузовик'
    const wh = cells.find((c) => Number(c.id) === cid)
    if (!wh) return 'клетка не существует'
    if (!hasStorage(wh)) return 'на клетке нет склада'
    const special = require('../lib/map/battleSpecialTerrain')
    const distWh = hexDistCells(cur.cell, wh)
    if (special.unitInvolvesWaterUnit(cur.unit)) {
      if (distWh !== 1) return 'у водного отряда склад должен быть в соседнем гексе'
    } else if (distWh > 1) {
      return 'склад должен быть в своём или соседнем гексе'
    }
    const maxes = supply.maxWarehouseToTruck(cur.unit, wh)
    if (supply.wantsTotal(maxes) < 1) return 'на складе нет припасов или у грузовика нет места'
    return supply.validateWantsAgainstMax(want, maxes)
  }
  if (ok === 'loading') {
    const tid = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(tid)) return 'нужна цель (пехота)'
    if (!isTruckUnit(cur.unit)) return 'погрузку задаёт грузовик'
    const tgt = findUnitOnField(cells, tid)
    if (!tgt) return 'цель не на поле'
    if (!isInfantryUnit(tgt.unit)) return 'погружается только пехота'
    if (!alliesSameFaction(cur.unit, tgt.unit)) return 'только союзник'
    if (hexDistCells(cur.cell, tgt.cell) !== 1) return 'пехота должна быть в соседнем гексе'
    if (isUnitInAnyCarriedUnits(cells, tid)) return 'пехота уже в транспорте'
    if (tgt.unit.tactical && tgt.unit.tactical.embarkedTransportInstanceId) return 'пехота уже в транспорте'
    const cap = getStr(cur.unit)
    const used = sumEmbarkedInfantryStrengthForTruck(cells, cur.unit.instanceId)
    if (used + getStr(tgt.unit) > cap) return 'превышена грузоподъёмность пехоты (численность)'
    return null
  }
  if (ok === 'unloading') {
    if (!isTruckUnit(cur.unit)) return 'выгрузку задаёт грузовик'
    const cargoId = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(cargoId)) return 'укажите, кого выгрузить (targetUnitInstanceId)'
    const arr = cur.unit.tactical && cur.unit.tactical.carriedUnits
    if (!Array.isArray(arr) || !arr.some((u) => Number(u.instanceId) === cargoId)) return 'этого юнита нет в кузове'
    const cargo = arr.find((u) => Number(u.instanceId) === cargoId)
    const cid = Number(o.targetCellId)
    if (!Number.isFinite(cid)) return 'нужна клетка выгрузки (targetCellId)'
    const tc = cells.find((c) => Number(c.id) === cid)
    if (!tc) return 'клетка не существует'
    if (hexDistCells(cur.cell, tc) > 1) return 'выгрузка в гексе на дистанции 1 от грузовика'
    if (!canUnloadToCell(tc, unitFaction(cargo), cargoId)) return 'на эту клетку нельзя выгрузить'
    return null
  }
  if (ok === 'tow') {
    const tid = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(tid)) return 'нужна цель (артиллерия)'
    if (!isTruckUnit(cur.unit)) return 'буксир только у грузовика'
    const tgt = findUnitOnField(cells, tid)
    if (!tgt) return 'цель не на поле'
    if (!isArtilleryUnit(tgt.unit)) return 'буксируется только артиллерия'
    if (!canTechTowArtillery(cur.unit, tgt.unit)) {
      return 'лёгкая техника буксирует только лёгкую артиллерию'
    }
    if (!isArtilleryCollapsedForTow(tgt.unit)) return 'орудие должно быть свёрнуто'
    if (!alliesSameFaction(cur.unit, tgt.unit)) return 'только союзник'
    if (hexDistCells(cur.cell, tgt.cell) !== 1) return 'орудие в соседнем гексе'
    if (isUnitInAnyCarriedUnits(cells, tid)) return 'цель уже в транспорте'
    if (tgt.unit.tactical && tgt.unit.tactical.embarkedTransportInstanceId) return 'цель в транспорте'
    const cap = getStr(cur.unit)
    const used = sumEmbarkedArtilleryStrengthForTruck(cells, cur.unit.instanceId)
    if (used + getStr(tgt.unit) > cap) return 'превышена грузоподъёмность артиллерии (численность)'
    return null
  }
  return null
}

module.exports = {
  validateLogisticsOrder,
}

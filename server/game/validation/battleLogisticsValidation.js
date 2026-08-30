'use strict'

const { getStorageAmmo, setStorageAmmo, hasStorage } = require('../lib/map/battleStorage')

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
    const n = Number(o.transferAmmo)
    if (!Number.isFinite(n) || n < 1) return 'укажите transferAmmo (целое >= 1)'
    if (!isTruckUnit(cur.unit)) return 'передаёт боеприпасы только грузовик'
    const tgt = findUnitOnField(cells, tid)
    if (!tgt) return 'цель не на поле'
    if (!alliesSameFaction(cur.unit, tgt.unit)) return 'можно снабжать только союзника'
    if (hexDistCells(cur.cell, tgt.cell) > 1) return 'цель в соседнем гексе или на том же'
    if (getAmmo(cur.unit) < 1) return 'нет БК для передачи'
    const cap = getAmmoCapacityMax(tgt.unit)
    const headroom = Math.max(0, cap - getAmmo(tgt.unit))
    const giveMax = Math.min(getAmmo(cur.unit), headroom)
    if (giveMax < 1) return 'у получателя нет места под БК'
    if (n > giveMax) return `можно передать не больше ${giveMax}`
    return null
  }
  if (ok === 'loadingSup') {
    const cid = Number(o.targetCellId)
    const n = Number(o.transferAmmo)
    if (!Number.isFinite(cid)) return 'нужна клетка склада (targetCellId)'
    if (!Number.isFinite(n) || n < 1) return 'укажите transferAmmo (целое >= 1)'
    if (!isTruckUnit(cur.unit)) return 'со склада грузит только грузовик'
    const wh = cells.find((c) => Number(c.id) === cid)
    if (!wh) return 'клетка не существует'
    if (!hasStorage(wh)) return 'на клетке нет склада'
    if (hexDistCells(cur.cell, wh) > 1) return 'склад должен быть в своём или соседнем гексе'
    const stock = getStorageAmmo(wh)
    if (stock < 1) return 'на складе нет БК'
    const cap = getAmmoCapacityMax(cur.unit)
    const headroom = Math.max(0, cap - getAmmo(cur.unit))
    const takeMax = Math.min(stock, headroom)
    if (takeMax < 1) return 'у грузовика нет места под БК'
    if (n > takeMax) return `можно взять не больше ${takeMax}`
    return null
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

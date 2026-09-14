'use strict'

const {
  getAmmo,
  setAmmo,
  getAmmoCapacityMax,
  getMines,
  setMines,
  getMinesCapacityMax,
  getExplosives,
  setExplosives,
  getExplosivesCapacityMax,
} = require('./battleUnitResources')
const { getSmokeShells, setSmokeShells, getSmokeShellsCapacityMax } = require('../map/battleSmoke')
const {
  getStorageAmmo,
  setStorageAmmo,
  getStorageMines,
  setStorageMines,
  getStorageExplosives,
  setStorageExplosives,
  getStorageSmoke,
  setStorageSmoke,
} = require('../map/battleStorage')

function floorWant(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function readTransferWants(o) {
  return {
    ammo: floorWant(o && o.transferAmmo),
    mines: floorWant(o && o.transferMines),
    explosives: floorWant(o && o.transferExplosives),
    smoke: floorWant(o && o.transferSmoke),
  }
}

function wantsTotal(w) {
  return (w.ammo || 0) + (w.mines || 0) + (w.explosives || 0) + (w.smoke || 0)
}

function headroom(have, cap) {
  return Math.max(0, Math.floor(Number(cap) || 0) - Math.floor(Number(have) || 0))
}

function emptyWants() {
  return { ammo: 0, mines: 0, explosives: 0, smoke: 0 }
}

function maxTruckToUnit(truck, unit) {
  return {
    ammo: Math.min(getAmmo(truck), headroom(getAmmo(unit), getAmmoCapacityMax(unit))),
    mines: Math.min(getMines(truck), headroom(getMines(unit), getMinesCapacityMax(unit))),
    explosives: Math.min(
      getExplosives(truck),
      headroom(getExplosives(unit), getExplosivesCapacityMax(unit)),
    ),
    smoke: Math.min(
      getSmokeShells(truck),
      headroom(getSmokeShells(unit), getSmokeShellsCapacityMax(unit)),
    ),
  }
}

function maxWarehouseToTruck(truck, cell) {
  return {
    ammo: Math.min(getStorageAmmo(cell), headroom(getAmmo(truck), getAmmoCapacityMax(truck))),
    mines: Math.min(getStorageMines(cell), headroom(getMines(truck), getMinesCapacityMax(truck))),
    explosives: Math.min(
      getStorageExplosives(cell),
      headroom(getExplosives(truck), getExplosivesCapacityMax(truck)),
    ),
    smoke: Math.min(
      getStorageSmoke(cell),
      headroom(getSmokeShells(truck), getSmokeShellsCapacityMax(truck)),
    ),
  }
}

function clampWants(want, maxes) {
  return {
    ammo: Math.min(want.ammo, maxes.ammo),
    mines: Math.min(want.mines, maxes.mines),
    explosives: Math.min(want.explosives, maxes.explosives),
    smoke: Math.min(want.smoke, maxes.smoke),
  }
}

function validateWantsAgainstMax(want, maxes) {
  if (wantsTotal(want) < 1) return 'укажите количество припасов (хотя бы 1)'
  if (want.ammo > maxes.ammo) return `можно передать не больше ${maxes.ammo} БК`
  if (want.mines > maxes.mines) return `можно передать не больше ${maxes.mines} мин`
  if (want.explosives > maxes.explosives) return `можно передать не больше ${maxes.explosives} взрывчатки`
  if (want.smoke > maxes.smoke) return `можно передать не больше ${maxes.smoke} дымовых`
  return null
}

function applyTruckToUnit(truck, unit, give) {
  if (give.ammo > 0) {
    setAmmo(truck, getAmmo(truck) - give.ammo)
    setAmmo(unit, getAmmo(unit) + give.ammo)
  }
  if (give.mines > 0) {
    setMines(truck, getMines(truck) - give.mines)
    setMines(unit, getMines(unit) + give.mines)
  }
  if (give.explosives > 0) {
    setExplosives(truck, getExplosives(truck) - give.explosives)
    setExplosives(unit, getExplosives(unit) + give.explosives)
  }
  if (give.smoke > 0) {
    setSmokeShells(truck, getSmokeShells(truck) - give.smoke)
    setSmokeShells(unit, getSmokeShells(unit) + give.smoke)
  }
}

function applyWarehouseToTruck(cell, truck, take) {
  if (take.ammo > 0) {
    setStorageAmmo(cell, getStorageAmmo(cell) - take.ammo)
    setAmmo(truck, getAmmo(truck) + take.ammo)
  }
  if (take.mines > 0) {
    setStorageMines(cell, getStorageMines(cell) - take.mines)
    setMines(truck, getMines(truck) + take.mines)
  }
  if (take.explosives > 0) {
    setStorageExplosives(cell, getStorageExplosives(cell) - take.explosives)
    setExplosives(truck, getExplosives(truck) + take.explosives)
  }
  if (take.smoke > 0) {
    setStorageSmoke(cell, getStorageSmoke(cell) - take.smoke)
    setSmokeShells(truck, getSmokeShells(truck) + take.smoke)
  }
}

function formatSupplyParts(give) {
  const parts = []
  if (give.ammo > 0) parts.push(`+${give.ammo} БК`)
  if (give.mines > 0) parts.push(`+${give.mines} мин`)
  if (give.explosives > 0) parts.push(`+${give.explosives} взр.`)
  if (give.smoke > 0) parts.push(`+${give.smoke} дым`)
  return parts.join(', ')
}

function logisticsLineAmounts(give) {
  return {
    amount: give.ammo || 0,
    ammo: give.ammo || 0,
    mines: give.mines || 0,
    explosives: give.explosives || 0,
    smoke: give.smoke || 0,
  }
}

function fillMaxWants(maxes) {
  return { ...maxes }
}

function unitNeedsSpecialResupply(unit) {
  const checks = [
    [getAmmo(unit), getAmmoCapacityMax(unit)],
    [getMines(unit), getMinesCapacityMax(unit)],
    [getExplosives(unit), getExplosivesCapacityMax(unit)],
    [getSmokeShells(unit), getSmokeShellsCapacityMax(unit)],
  ]
  for (const [have, cap] of checks) {
    if (!Number.isFinite(cap) || cap <= 0) continue
    if (!Number.isFinite(have) || have >= cap) continue
    if (have < cap * 0.5) return true
  }
  return false
}

function truckNeedsWarehouseStock(truck) {
  if (truckHasNoSpecialCargo(truck)) return wantsTotal(maxTruckCargoFree(truck)) > 0
  return unitNeedsSpecialResupply(truck)
}

function maxTruckCargoFree(truck) {
  return {
    ammo: headroom(getAmmo(truck), getAmmoCapacityMax(truck)),
    mines: headroom(getMines(truck), getMinesCapacityMax(truck)),
    explosives: headroom(getExplosives(truck), getExplosivesCapacityMax(truck)),
    smoke: headroom(getSmokeShells(truck), getSmokeShellsCapacityMax(truck)),
  }
}

function truckHasNoSpecialCargo(truck) {
  return getAmmo(truck) < 1 && getMines(truck) < 1 && getExplosives(truck) < 1 && getSmokeShells(truck) < 1
}

module.exports = {
  emptyWants,
  readTransferWants,
  wantsTotal,
  maxTruckToUnit,
  maxWarehouseToTruck,
  clampWants,
  validateWantsAgainstMax,
  applyTruckToUnit,
  applyWarehouseToTruck,
  formatSupplyParts,
  logisticsLineAmounts,
  fillMaxWants,
  unitNeedsSpecialResupply,
  maxTruckCargoFree,
  truckHasNoSpecialCargo,
  truckNeedsWarehouseStock,
}

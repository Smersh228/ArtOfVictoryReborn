'use strict'

const DEFAULT_STORAGE_AMMO = 40
const DEFAULT_STORAGE_SMOKE = 2
const DEFAULT_STORAGE_EXPLOSIVES = 2
const DEFAULT_STORAGE_MINES = 4

function hasStorage(cell) {
  const mb = cell && cell.mapBuilding
  if (mb && mb.destroyed === true) return false
  if (Number(cell && cell.builds && cell.builds.storage) > 0) return true
  const t = String(cell && cell.type ? cell.type : '')
    .trim()
    .toLowerCase()
  if (t === 'warehouse' || t.includes('склад')) return true
  return Boolean(mb && /склад/i.test(String(mb.name || '')))
}

function getStorageCount(cell, key, fallback) {
  if (!hasStorage(cell)) return 0
  const n = Number(cell.builds && cell.builds[key])
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

function setStorageCount(cell, key, n) {
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  const stock = Number(cell.builds.storage)
  cell.builds.storage = Number.isFinite(stock) && stock > 0 ? stock : 1
  cell.builds[key] = Math.max(0, Math.floor(Number(n) || 0))
}

function getStorageAmmo(cell) {
  return getStorageCount(cell, 'storageAmmo', DEFAULT_STORAGE_AMMO)
}

function setStorageAmmo(cell, n) {
  setStorageCount(cell, 'storageAmmo', n)
}

function getStorageSmoke(cell) {
  return getStorageCount(cell, 'storageSmoke', DEFAULT_STORAGE_SMOKE)
}

function setStorageSmoke(cell, n) {
  setStorageCount(cell, 'storageSmoke', n)
}

function getStorageExplosives(cell) {
  return getStorageCount(cell, 'storageExplosives', DEFAULT_STORAGE_EXPLOSIVES)
}

function setStorageExplosives(cell, n) {
  setStorageCount(cell, 'storageExplosives', n)
}

function getStorageMines(cell) {
  return getStorageCount(cell, 'storageMines', DEFAULT_STORAGE_MINES)
}

function setStorageMines(cell, n) {
  setStorageCount(cell, 'storageMines', n)
}

function destroyWarehouse(cell) {
  if (!cell) return
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  cell.builds.storage = 0
  cell.builds.storageAmmo = 0
  cell.builds.storageSmoke = 0
  cell.builds.storageExplosives = 0
  cell.builds.storageMines = 0
  if (cell.builds.structureHp && cell.builds.structureHp.kind === 'storage') {
    cell.builds.structureHp.str = 0
    cell.builds.structureHp.def = 0
  }
  if (cell.mapBuilding && typeof cell.mapBuilding === 'object') {
    cell.mapBuilding.destroyed = true
  }
}

module.exports = {
  DEFAULT_STORAGE_AMMO,
  DEFAULT_STORAGE_SMOKE,
  DEFAULT_STORAGE_EXPLOSIVES,
  DEFAULT_STORAGE_MINES,
  hasStorage,
  getStorageAmmo,
  setStorageAmmo,
  getStorageSmoke,
  setStorageSmoke,
  getStorageExplosives,
  setStorageExplosives,
  getStorageMines,
  setStorageMines,
  destroyWarehouse,
}

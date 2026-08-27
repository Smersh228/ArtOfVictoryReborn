'use strict'

const DEFAULT_STORAGE_AMMO = 40

function hasStorage(cell) {
  return Number(cell && cell.builds && cell.builds.storage) > 0
}

function getStorageAmmo(cell) {
  if (!hasStorage(cell)) return 0
  const n = Number(cell.builds.storageAmmo)
  if (!Number.isFinite(n)) return DEFAULT_STORAGE_AMMO
  return Math.max(0, Math.floor(n))
}

function setStorageAmmo(cell, n) {
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  const stock = Number(cell.builds.storage)
  cell.builds.storage = Number.isFinite(stock) && stock > 0 ? stock : 1
  cell.builds.storageAmmo = Math.max(0, Math.floor(Number(n) || 0))
}

module.exports = {
  DEFAULT_STORAGE_AMMO,
  hasStorage,
  getStorageAmmo,
  setStorageAmmo,
}

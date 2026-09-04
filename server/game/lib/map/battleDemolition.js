'use strict'

const { getExplosives, setExplosives, getMines, setMines } = require('../unit/battleUnitResources')
const { getStr, setStr } = require('../unit/battleUnitField')
const mines = require('./battleMines')

function ensureHexExtra(cell) {
  if (!cell.hexExtra || typeof cell.hexExtra !== 'object') cell.hexExtra = {}
  return cell.hexExtra
}

function structureKind(cell) {
  if (!cell) return null
  const ponton = require('./battlePonton')
  if (ponton.hasPontonOnCell(cell.builds)) return 'ponton'
  const dot = require('./battleDot')
  if (dot.hasDotOnCell(cell.builds)) return 'dot'
  const storage = require('./battleStorage')
  if (storage.hasStorage(cell)) return 'storage'
  const special = require('./battleSpecialTerrain')
  const railway = require('./battleRailway')
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
  const flaggedRailBridge = Boolean(ex && ex.isRailwayBridge === true)
  const flaggedBridge = Boolean(ex && ex.isBridge === true)
  const flaggedRailway = Boolean(ex && (ex.isRailway === true || ex.railway === true || ex.rail === true))
  if (!special.isDestroyedBridgeHex(cell)) {
    if ((special.isIntactBridgeHex(cell) && special.isRailwayBridgeHex(cell)) || flaggedRailBridge) {
      return 'railBridge'
    }
    if (special.isIntactBridgeHex(cell) || flaggedBridge) return 'bridge'
  }
  if (
    !special.isDestroyedBridgeHex(cell) &&
    !railway.isDestroyedRailwayHex(cell) &&
    (railway.isRailwayCell(cell) || flaggedRailway)
  ) {
    return 'railway'
  }
  return null
}

function structureLabel(kind) {
  if (kind === 'ponton') return 'понтонный мост'
  if (kind === 'dot') return 'ДОТ'
  if (kind === 'storage') return 'склад боеприпасов'
  if (kind === 'railBridge') return 'железнодорожный мост'
  if (kind === 'bridge') return 'мост'
  if (kind === 'railway') return 'железная дорога'
  return 'сооружение'
}

function cellsEligibleForDemolition(fromCell, cells) {
  const { hexDistCells } = require('./battleHexGeometry')
  const out = []
  if (!fromCell || !Array.isArray(cells)) return out
  for (const c of cells) {
    if (hexDistCells(fromCell, c) !== 1) continue
    if (structureKind(c)) out.push(c)
  }
  return out
}

function unitPaysWithMines(unit) {
  return mines.isSapperUnit(unit)
}

function canPayDemolitionCharge(unit) {
  if (!unit) return false
  if (unitPaysWithMines(unit)) return getMines(unit) >= 1
  return getExplosives(unit) >= 1
}

function consumeDemolitionCharge(unit) {
  if (!unit) return { ok: false, via: null }
  if (unitPaysWithMines(unit)) {
    const have = getMines(unit)
    if (have < 1) return { ok: false, via: 'mine' }
    setMines(unit, have - 1)
    return { ok: true, via: 'mine' }
  }
  const have = getExplosives(unit)
  if (have < 1) return { ok: false, via: 'explosives' }
  setExplosives(unit, have - 1)
  return { ok: true, via: 'explosives' }
}

function destroyUnitsOnCell(cells, cell, le, ph, deps) {
  const { logUnitDestroyed } = deps || {}
  const us = (cell && cell.units) || []
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    const prev = getStr(u)
    if (prev <= 0) continue
    setStr(u, 0)
    if (typeof logUnitDestroyed === 'function') {
      logUnitDestroyed(le, ph, u, prev, 'подрыв сооружения', cell.id)
    } else if (typeof le === 'function') {
      le(ph, `Юнит ${u.instanceId} уничтожен (подрыв сооружения)`)
    }
  }
}

function destroyWarehouse(cell) {
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  cell.builds.storage = 0
  cell.builds.storageAmmo = 0
  cell.builds.storageSmoke = 0
  cell.builds.storageExplosives = 0
  cell.builds.storageMines = 0
  if (cell.mapBuilding && typeof cell.mapBuilding === 'object') {
    cell.mapBuilding.destroyed = true
  }
}

function destroyStructure(cells, cell, kind, le, ph, deps) {
  if (!cell || !kind) return false
  destroyUnitsOnCell(cells, cell, le, ph, deps)
  const ex = ensureHexExtra(cell)
  if (kind === 'ponton') {
    require('./battlePonton').destroyPonton(cell, le, ph, 'подрыв')
  } else if (kind === 'dot') {
    const dot = require('./battleDot')
    const findUnitOnField = deps && deps.findUnitOnField
    const ensureTacticalBattle = deps && deps.ensureTacticalBattle
    dot.destroyDot(cells, cell, le, ph, 'подрыв', { findUnitOnField, ensureTacticalBattle })
  } else if (kind === 'storage') {
    destroyWarehouse(cell)
    if (typeof le === 'function') le(ph, `Склад на кл. ${cell.id} уничтожен (подрыв)`)
  } else if (kind === 'railBridge') {
    ex.isDestroyedBridge = true
    ex.railwayDestroyed = true
    require('./battleStructureHp').zeroHpOnArsonDestroy(cell)
    if (typeof le === 'function') le(ph, `Железнодорожный мост на кл. ${cell.id} разрушен (подрыв)`)
  } else if (kind === 'bridge') {
    ex.isDestroyedBridge = true
    require('./battleStructureHp').zeroHpOnArsonDestroy(cell)
    if (typeof le === 'function') le(ph, `Мост на кл. ${cell.id} разрушен (подрыв)`)
  } else if (kind === 'railway') {
    require('./battleRailway').markRailwayDestroyed(cell)
    if (typeof le === 'function') le(ph, `Железная дорога на кл. ${cell.id} разрушена (подрыв)`)
  }
  return true
}

module.exports = {
  structureKind,
  structureLabel,
  cellsEligibleForDemolition,
  unitPaysWithMines,
  canPayDemolitionCharge,
  consumeDemolitionCharge,
  destroyStructure,
  ensureHexExtra,
}

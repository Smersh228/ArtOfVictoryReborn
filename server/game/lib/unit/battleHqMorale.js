'use strict'

const { unitHasPropKey } = require('../../core/battleUnitType')
const { getStr, unitFaction } = require('./battleUnitField')
const { hexDistCells } = require('../map/battleHexGeometry')

const { readHqZoneRadiusWithHill } = require('../map/battleElevation')

const HQ_ZONE_MORALE_BONUS = 2

function readHqZoneRadiusFromUnit(unit, hqCell) {
  return readHqZoneRadiusWithHill(unit, hqCell)
}

function collectFriendlyHqZoneCellIds(cells, faction) {
  const fac = String(faction || '').trim()
  if (!fac) return new Set()
  const ids = new Set()
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (unitFaction(u) !== fac) continue
      const radius = readHqZoneRadiusFromUnit(u, c)
      if (radius <= 0) continue
      for (let j = 0; j < cells.length; j++) {
        const tc = cells[j]
        if (hexDistCells(c, tc) <= radius) ids.add(Number(tc.id))
      }
    }
  }
  return ids
}

function isCellInFriendlyHqZone(cellId, cells, faction) {
  const id = Number(cellId)
  if (!Number.isFinite(id)) return false
  return collectFriendlyHqZoneCellIds(cells, faction).has(id)
}

/** +2 морали своим в зоне штаба; от нескольких штабов не суммируется — только один бонус. */
function getHqMoraleZoneBonusForUnit(unit, unitCell, cells) {
  if (!unit || !unitCell || !Array.isArray(cells)) return 0
  if (getStr(unit) <= 0) return 0
  const fac = unitFaction(unit)
  for (let i = 0; i < cells.length; i++) {
    const hqCell = cells[i]
    for (const hq of hqCell.units || []) {
      if (getStr(hq) <= 0) continue
      if (unitFaction(hq) !== fac) continue
      const radius = readHqZoneRadiusFromUnit(hq, hqCell)
      if (radius <= 0) continue
      if (hexDistCells(hqCell, unitCell) > radius) continue
      return HQ_ZONE_MORALE_BONUS
    }
  }
  return 0
}

function getHqMoraleBonusForUnit(unit, unitCell, cells) {
  return getHqMoraleZoneBonusForUnit(unit, unitCell, cells)
}

function getHqMoraleBonus(unit, cells, findUnitOnField) {
  if (!unit || !cells || typeof findUnitOnField !== 'function') return 0
  const iid = Number(unit.instanceId)
  if (!Number.isFinite(iid)) return 0
  const found = findUnitOnField(cells, iid)
  if (!found) return 0
  return getHqMoraleBonusForUnit(unit, found.cell, cells)
}

function hasAviationChallengeOnField(cells, ownsUnit) {
  if (!Array.isArray(cells) || typeof ownsUnit !== 'function') return false
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!unitHasPropKey(u, 'aviationChallenge')) continue
      if (ownsUnit(u)) return true
    }
  }
  return false
}

module.exports = {
  HQ_ZONE_MORALE_BONUS,
  readHqZoneRadiusFromUnit,
  collectFriendlyHqZoneCellIds,
  isCellInFriendlyHqZone,
  getHqMoraleZoneBonusForUnit,
  getHqMoraleBonusForUnit,
  getHqMoraleBonus,
  hasAviationChallengeOnField,
}

'use strict'

const { getStr, unitFaction } = require('../unit/battleUnitField')

function hasShootingSector(unit) {
  if (!unit) return false
  const ids = unit.defendSectorCellIds
  if (Array.isArray(ids) && ids.length > 0) return true
  const t = unit.tactical
  if (t && (t.defendOrder || t.ambushOrder || t.artilleryFireSector)) return true
  const fid = Number(unit.defendFacingCellId)
  return Number.isFinite(fid) && fid > 0
}

function isApproachInSector(defender, approachCell) {
  if (!defender || !approachCell) return false
  const fid = Number(defender.defendFacingCellId)
  if (Number.isFinite(fid) && Number(approachCell.id) === fid) return true
  const ids = defender.defendSectorCellIds
  if (!Array.isArray(ids) || !ids.length) return false
  const aid = Number(approachCell.id)
  return ids.some((id) => Number(id) === aid)
}

function isFlankOrRearAttack(defender, approachCell) {
  if (!hasShootingSector(defender)) return false
  return !isApproachInSector(defender, approachCell)
}

function flanksCoveredOnCell(defender, cell, deps) {
  const { getStr: gs, unitFaction: uf } = deps || {}
  const getS = gs || getStr
  const facOf = uf || unitFaction
  if (!defender || !cell) return false
  if (!hasShootingSector(defender)) return false
  const fac = facOf(defender)
  for (const u of cell.units || []) {
    if (Number(u.instanceId) === Number(defender.instanceId)) continue
    if (getS(u) <= 0) continue
    if (facOf(u) !== fac) continue
    if (!hasShootingSector(u)) return true
  }
  return false
}

function trenchCoverIgnoredForAttack(defender, approachCell, cell, deps) {
  if (!isFlankOrRearAttack(defender, approachCell)) return false
  if (flanksCoveredOnCell(defender, cell, deps)) return false
  return true
}

module.exports = {
  hasShootingSector,
  isApproachInSector,
  isFlankOrRearAttack,
  flanksCoveredOnCell,
  trenchCoverIgnoredForAttack,
}

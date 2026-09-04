'use strict'

const { isInfantryUnit, isTruckUnit } = require('../../core/battleUnitType')
const { getStr, unitFaction, opposing } = require('./battleUnitField')
const { hexDistCells, getNeighbor, findCellByCoor } = require('../map/battleHexGeometry')
const flank = require('../map/battleFlank')
const morale = require('../../core/battleMorale')

function cellHasEnemy(cell, faction, deps) {
  const { getStr: gs, unitFaction: uf, opposing: opp } = deps
  const getS = gs || getStr
  const facOf = uf || unitFaction
  const isOpp = opp || opposing
  for (const u of (cell && cell.units) || []) {
    if (getS(u) <= 0) continue
    if (isOpp(faction, facOf(u))) return true
  }
  return false
}

function cellHasOtherMelee(cell, selfId, cells, deps) {
  const { getStr: gs, getMeleeOpponentId, findUnitOnField, hexDistCells: dist } = deps
  const getS = gs || getStr
  const hd = dist || hexDistCells
  for (const u of (cell && cell.units) || []) {
    if (getS(u) <= 0) continue
    if (Number(u.instanceId) === Number(selfId)) continue
    const oid = getMeleeOpponentId(u)
    if (oid == null) continue
    if (Number(oid) === Number(selfId)) continue
    const oth = findUnitOnField(cells, oid)
    if (!oth || getS(oth.unit) <= 0) continue
    if (hd(cell, oth.cell) <= 1) return true
  }
  return false
}

function isValidMeleeRetreatCell(fromCell, toCell, unit, cells, deps) {
  if (!fromCell || !toCell || !unit) return false
  if (hexDistCells(fromCell, toCell) !== 1) return false
  const { terrainEntryCost, unitFaction: uf } = deps
  if (typeof terrainEntryCost === 'function' && terrainEntryCost(toCell, unit) === 0) return false
  const { unitHasPropKey } = require('../../core/battleUnitType')
  const special = require('../map/battleSpecialTerrain')
  if (!special.canEnterElevation3(unit, toCell)) return false
  if (!special.waterUnitCanEnterCell(unit, toCell)) return false
  if (require('../map/battleSettlementFire').hasSettlementFire(toCell)) return false
  if (unitHasPropKey(unit, 'railwayDetachment')) {
    const railway = require('../map/battleRailway')
    if (!railway.cellAllowsRailwayDetachment(toCell) || !railway.cellAllowsRailwayDetachment(fromCell)) return false
  }
  const fac = (uf || unitFaction)(unit)
  if (cellHasEnemy(toCell, fac, deps)) return false
  if (cellHasOtherMelee(toCell, unit.instanceId, cells, deps)) return false
  return true
}

function breakMeleeLink(unit, cells, deps) {
  const { findUnitOnField } = deps
  if (!unit) return
  const oid = unit.tactical && unit.tactical.meleeOpponentInstanceId
  if (unit.tactical) delete unit.tactical.meleeOpponentInstanceId
  if (oid == null) return
  const oth = findUnitOnField(cells, oid)
  if (oth && oth.unit.tactical) delete oth.unit.tactical.meleeOpponentInstanceId
}

function friendlyHasAmmoInMelee(unit, cells, deps) {
  const { getMeleeOpponentId, findUnitOnField, getAmmo, getStr: gs, unitFaction: uf } = deps
  const oid = getMeleeOpponentId(unit)
  if (oid == null) return false
  const fac = (uf || unitFaction)(unit)
  const getS = gs || getStr
  const opp = findUnitOnField(cells, oid)
  const hexes = []
  const pack = findUnitOnField(cells, unit.instanceId)
  if (pack) hexes.push(pack.cell)
  if (opp) hexes.push(opp.cell)
  const seen = new Set()
  for (const cell of hexes) {
    if (!cell || seen.has(Number(cell.id))) continue
    seen.add(Number(cell.id))
    for (const u of cell.units || []) {
      if (getS(u) <= 0) continue
      if (Number(u.instanceId) === Number(unit.instanceId)) continue
      if ((uf || unitFaction)(u) !== fac) continue
      const uOpp = getMeleeOpponentId(u)
      const linked =
        Number(uOpp) === Number(oid) ||
        Number(u.instanceId) === Number(oid) ||
        Number(uOpp) === Number(unit.instanceId)
      if (!linked) continue
      if (getAmmo(u) >= 1) return true
    }
  }
  return false
}

function captureUnit(cells, unit, le, ph, deps, reason) {
  const { findUnitOnField, setStr, getStr: gs } = deps
  const pack = findUnitOnField(cells, unit.instanceId)
  if (!pack || (gs || getStr)(pack.unit) <= 0) return
  le(ph, `Плен: юнит ${unit.instanceId} — ${reason}`)
  setStr(pack.unit, 0)
}

function captureMeleeWithoutAmmo(cells, ordersByUnit, le, ph, deps) {
  const { getMeleeOpponentId, getAmmo, getStr: gs, findUnitOnField } = deps
  const getS = gs || getStr
  const toCapture = []
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getS(u) <= 0) continue
      if (getMeleeOpponentId(u) == null) continue
      if (getAmmo(u) >= 1) continue
      if (friendlyHasAmmoInMelee(u, cells, deps)) continue
      const spec = ordersByUnit && ordersByUnit.get(Number(u.instanceId))
      const k = spec ? String(spec.orderKey || '').trim() : ''
      if (k === 'move') {
        const cid = spec.targetCellId
        const tc = cells.find((x) => Number(x.id) === Number(cid))
        if (tc && isValidMeleeRetreatCell(c, tc, u, cells, deps)) continue
      }
      toCapture.push(u)
    }
  }
  for (const u of toCapture) {
    captureUnit(cells, u, le, ph, deps, 'нет БК и нет пути отхода')
  }
}

function oppositeNeighbor(fromCell, towardCell, cells) {
  if (!fromCell || !towardCell || !fromCell.coor || !towardCell.coor) return null
  const dx = fromCell.coor.x - towardCell.coor.x
  const dy = fromCell.coor.y - towardCell.coor.y
  const dz = fromCell.coor.z - towardCell.coor.z
  return findCellByCoor(cells, {
    x: fromCell.coor.x + dx,
    y: fromCell.coor.y + dy,
    z: fromCell.coor.z + dz,
  })
}

function forcedRetreatCandidates(defCell, approachCell, cells) {
  const out = []
  const opp = oppositeNeighbor(defCell, approachCell, cells)
  if (opp) out.push(opp)
  for (let dir = 0; dir < 6; dir++) {
    const nb = getNeighbor(defCell.coor, dir)
    const c = findCellByCoor(cells, nb)
    if (!c) continue
    if (approachCell && Number(c.id) === Number(approachCell.id)) continue
    if (opp && Number(c.id) === Number(opp.id)) continue
    if (opp && hexDistCells(c, opp) === 1) out.push(c)
  }
  const seen = new Set()
  return out.filter((c) => {
    const id = Number(c.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function tryForcedRetreat(cells, defender, approachCell, le, ph, deps) {
  const { findUnitOnField, getStr: gs, removeUnitFromCell, addUnitToCell, syncUnitCoor } = deps
  const pack = findUnitOnField(cells, defender.instanceId)
  if (!pack || (gs || getStr)(pack.unit) <= 0) return false
  const cands = forcedRetreatCandidates(pack.cell, approachCell, cells)
  for (const tc of cands) {
    if (!isValidMeleeRetreatCell(pack.cell, tc, pack.unit, cells, deps)) continue
    breakMeleeLink(pack.unit, cells, deps)
    removeUnitFromCell(pack.cell, pack.unit.instanceId)
    addUnitToCell(tc, pack.unit)
    syncUnitCoor(pack.unit, tc)
    le(ph, `Вынужденный отход: юнит ${defender.instanceId} → кл. ${tc.id}`)
    return true
  }
  captureUnit(cells, pack.unit, le, ph, deps, 'некуда отходить из подавления')
  return false
}

function disembarkInfantryAfterTransportMelee(cells, truck, attacker, le, ph, deps) {
  const { getStr: gs, addUnitToCell, findUnitOnField, linkMeleeOpponents, ensureTacticalBattle } = deps
  const isInf = deps.isInfantryUnit || isInfantryUnit
  if (!truck || !isTruckUnit(truck)) return
  if (truck.tactical && truck.tactical.fireSuppression) return
  const pack = findUnitOnField(cells, truck.instanceId)
  if (!pack) return
  const arr = truck.tactical && Array.isArray(truck.tactical.carriedUnits) ? truck.tactical.carriedUnits : []
  const stay = []
  for (const u of arr) {
    if (!isInf(u) || (gs || getStr)(u) <= 0) {
      stay.push(u)
      continue
    }
    addUnitToCell(pack.cell, u)
    if (u.tactical) delete u.tactical.embarkedTransportInstanceId
    if (typeof linkMeleeOpponents === 'function' && attacker) {
      linkMeleeOpponents(u, attacker, { ensureTacticalBattle })
    }
    le(ph, `Высадка: пехота ${u.instanceId} с транспорта ${truck.instanceId} на кл. ${pack.cell.id} — связана боем`)
  }
  if (truck.tactical) truck.tactical.carriedUnits = stay
}

function tryFlankSteadfastness(le, ph, defender, defenderCell, approachCell, deps) {
  try {
    if (!flank.isFlankOrRearAttack(defender, approachCell)) return true
    if (flank.flanksCoveredOnCell(defender, defenderCell, deps)) {
      le(ph, `Фланг: юнит ${defender.instanceId} — фланги прикрыты союзником без сектора`)
      return true
    }
    morale.rollTankFearSteadfastness(
      le,
      ph,
      defender,
      'Атака во фланг/тыл',
      true,
      false,
      deps || {},
    )
    return true
  } catch (err) {
    console.error('tryFlankSteadfastness', err)
    if (typeof le === 'function') {
      le(ph, `Фланг: юнит ${defender && defender.instanceId} — сбой теста стойкости`)
    }
    return true
  }
}

module.exports = {
  isValidMeleeRetreatCell,
  captureMeleeWithoutAmmo,
  tryForcedRetreat,
  disembarkInfantryAfterTransportMelee,
  tryFlankSteadfastness,
  breakMeleeLink,
  cellHasEnemy,
  cellHasOtherMelee,
}

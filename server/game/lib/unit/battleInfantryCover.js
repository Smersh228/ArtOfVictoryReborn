'use strict'

const { isInfantryUnit } = require('../../core/battleUnitType')
const { getStr, unitFaction } = require('./battleUnitField')

function isCoverPartnerType(u) {
  const t = String((u && u.type) || '').toLowerCase()
  return t === 'armor' || t === 'lighttank' || t === 'mediumtank' || t === 'heavytank'
}

function facingId(unit) {
  const n = Number(unit && unit.defendFacingCellId)
  return Number.isFinite(n) && n > 0 ? n : null
}

function orderKeyOf(unit, ordersByUnit) {
  if (!ordersByUnit || typeof ordersByUnit.get !== 'function') return ''
  const spec = ordersByUnit.get(Number(unit.instanceId))
  return spec ? String(spec.orderKey || '').trim() : ''
}

function pathKeyOf(unit, ordersByUnit) {
  if (!ordersByUnit || typeof ordersByUnit.get !== 'function') return ''
  const spec = ordersByUnit.get(Number(unit.instanceId))
  if (!spec) return ''
  const k = String(spec.orderKey || '').trim()
  if (k !== 'attack' && k !== 'hardMove' && k !== 'moveWar') return ''
  if (Array.isArray(spec.flightPathCellIds) && spec.flightPathCellIds.length) {
    return spec.flightPathCellIds.map((x) => Number(x)).join(',')
  }
  const bits = [k]
  if (spec.targetCellId != null) bits.push(`c${spec.targetCellId}`)
  if (spec.targetUnitInstanceId != null) bits.push(`u${spec.targetUnitInstanceId}`)
  return bits.join(':')
}

function sameDefendFacing(a, b) {
  const fa = facingId(a)
  const fb = facingId(b)
  if (fa == null || fb == null || fa !== fb) return false
  const da = a.tactical && a.tactical.defendOrder
  const db = b.tactical && b.tactical.defendOrder
  return Boolean(da && db)
}

function sameCoverMoveOrders(inf, partner, ordersByUnit) {
  const ki = orderKeyOf(inf, ordersByUnit)
  const kp = orderKeyOf(partner, ordersByUnit)
  if (ki !== kp) return false
  if (ki !== 'attack' && ki !== 'hardMove' && ki !== 'moveWar') return false
  const a = pathKeyOf(inf, ordersByUnit)
  const b = pathKeyOf(partner, ordersByUnit)
  return Boolean(a) && a === b
}

function sameDefendThisTurn(inf, partner, ordersByUnit) {
  const ki = orderKeyOf(inf, ordersByUnit)
  const kp = orderKeyOf(partner, ordersByUnit)
  if (ki !== 'defend' || kp !== 'defend') return false
  const si = ordersByUnit.get(Number(inf.instanceId))
  const sp = ordersByUnit.get(Number(partner.instanceId))
  const fa = Number(si && si.targetCellId)
  const fb = Number(sp && sp.targetCellId)
  return Number.isFinite(fa) && fa > 0 && fa === fb
}

function applyInfantryCoverFlags(cells, ordersByUnit) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (u && u.tactical) delete u.tactical.infantryCover
    }
  }
  for (const c of cells) {
    const live = (c.units || []).filter((u) => getStr(u) > 0)
    const infs = live.filter((u) => isInfantryUnit(u))
    const partners = live.filter((u) => isCoverPartnerType(u))
    if (!infs.length || !partners.length) continue
    for (const inf of infs) {
      const fac = unitFaction(inf)
      for (const p of partners) {
        if (unitFaction(p) !== fac) continue
        if (sameDefendFacing(inf, p) || sameDefendThisTurn(inf, p, ordersByUnit) || sameCoverMoveOrders(inf, p, ordersByUnit)) {
          if (!inf.tactical) inf.tactical = {}
          inf.tactical.infantryCover = true
          break
        }
      }
    }
  }
}

function infantryCoverDefenseBonus(unit) {
  return unit && unit.tactical && unit.tactical.infantryCover ? 1 : 0
}

function infantryCoverMoraleBonus(unit) {
  return unit && unit.tactical && unit.tactical.infantryCover ? 1 : 0
}

module.exports = {
  applyInfantryCoverFlags,
  infantryCoverDefenseBonus,
  infantryCoverMoraleBonus,
  isCoverPartnerType,
}

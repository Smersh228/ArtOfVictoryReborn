'use strict'

const { isInfantryUnit } = require('./battleUnitType')

function applyFireSuppression(unit, le, ph, deps) {
  if (!unit) return false
  const { ensureTacticalBattle, clearDefendOnUnit, cells, findUnitOnField, ordersByUnit } = deps || {}
  const t = typeof ensureTacticalBattle === 'function' ? ensureTacticalBattle(unit) : (unit.tactical || (unit.tactical = {}))
  t.fireSuppression = true
  if (typeof clearDefendOnUnit === 'function') clearDefendOnUnit(unit)
  if (isInfantryUnit(unit) && Array.isArray(cells)) {
    const trench = require('../lib/map/battleTrench')
    const pack = typeof findUnitOnField === 'function' ? findUnitOnField(cells, unit.instanceId) : null
    trench.leaveTrench(unit, pack ? pack.cell : null)
  }
  cancelRemainingOrders(unit, ordersByUnit, le, ph)
  return true
}

function cancelRemainingOrders(unit, ordersByUnit, le, ph) {
  if (!ordersByUnit || typeof ordersByUnit.delete !== 'function') return
  const id = Number(unit && unit.instanceId)
  if (!Number.isFinite(id) || !ordersByUnit.has(id)) return
  const spec = ordersByUnit.get(id)
  const k = spec && spec.orderKey ? String(spec.orderKey) : '?'
  ordersByUnit.delete(id)
  if (typeof le === 'function') {
    le(ph, `Подавление: юнит ${id} — невыполненные приказы отменены («${k}»)`)
  }
}

function suppressionMeleeAccuracy(unit, rangeArrayForAtCell, cell) {
  const ra =
    typeof rangeArrayForAtCell === 'function' && cell
      ? rangeArrayForAtCell(unit, cell)
      : Array.isArray(unit && unit.fireParsed && unit.fireParsed.range)
        ? unit.fireParsed.range
        : [3, 2, 1]
  const n = Number(ra && ra[0])
  return Number.isFinite(n) && n > 0 ? n : 1
}

module.exports = {
  applyFireSuppression,
  cancelRemainingOrders,
  suppressionMeleeAccuracy,
}

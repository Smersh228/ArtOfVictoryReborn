'use strict'

const { getStr, unitFaction } = require('../unit/battleUnitField')
const { isBattleAirUnitType } = require('../map/battleElevation')
const { observerVisionCellIds } = require('../map/battleFogVisibility')
const { unitHasPropKey, unitHasOrderKey, isArtilleryUnit, unitUsesGunDeploy } = require('../../core/battleUnitType')

function isUnitInTransport(u) {
  const id = Number(u?.tactical?.embarkedTransportInstanceId)
  return Number.isFinite(id) && id > 0
}

function unitIsFireAdjustmentSpotter(u) {
  return unitHasOrderKey(u, 'fireAdjustment') || unitHasPropKey(u, 'fireAdjustment')
}

function orderKeyOf(o) {
  return String((o && (o.orderKey || o.order_key || o.key)) || '').trim()
}

function orderUnitId(o) {
  const n = Number(o && (o.unitInstanceId ?? o.unitId))
  return Number.isFinite(n) ? n : null
}

function spotterSeesCell(spotterFound, targetCell, cells) {
  if (!spotterFound || !targetCell || !Array.isArray(cells)) return false
  const seen = observerVisionCellIds(spotterFound.cell, spotterFound.unit, cells)
  const want = Number(targetCell.id)
  if (seen.has(want) || seen.has(targetCell.id)) return true
  for (const id of seen) {
    if (Number(id) === want) return true
  }
  return false
}

function collectAdjustmentOrders(list, ordersByUnit) {
  const out = []
  const seen = new Set()
  const push = (o) => {
    if (!o || typeof o !== 'object') return
    const sid = orderUnitId(o)
    const key = `${sid}:${orderKeyOf(o)}:${Number(o.targetUnitInstanceId)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(o)
  }
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) push(list[i])
  }
  if (ordersByUnit && typeof ordersByUnit.forEach === 'function') {
    ordersByUnit.forEach((spec, uid) => {
      push({ unitId: uid, ...spec })
    })
  }
  return out
}

function findFireAdjustmentSpotter(list, artilleryInstanceId, cells, findUnitOnFieldFn, ordersByUnit) {
  const artId = Number(artilleryInstanceId)
  if (!Number.isFinite(artId)) return null
  const orders = collectAdjustmentOrders(list, ordersByUnit)
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    if (orderKeyOf(o) !== 'fireAdjustment') continue
    const tgtId = Number(o.targetUnitInstanceId ?? o.targetId)
    if (tgtId !== artId) continue
    const sid = orderUnitId(o)
    if (sid == null) continue
    const sp = findUnitOnFieldFn(cells, sid)
    if (!sp || getStr(sp.unit) <= 0) continue
    if (isBattleAirUnitType(sp.unit) || isUnitInTransport(sp.unit)) continue
    return sp
  }
  return null
}

function liveUnitOf(targetUnit) {
  if (!targetUnit) return null
  if (targetUnit.unit && typeof targetUnit.unit === 'object') return targetUnit.unit
  return targetUnit
}

function shooterFireOrderWantsAdjustment(shooterFound, list, ordersByUnit) {
  const sid = Number(shooterFound && shooterFound.unit && shooterFound.unit.instanceId)
  if (!Number.isFinite(sid)) return false
  if (ordersByUnit && typeof ordersByUnit.get === 'function') {
    const spec = ordersByUnit.get(sid) || ordersByUnit.get(String(sid))
    if (spec && spec.useFireAdjustment) return true
  }
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      if (!o) continue
      if (Number(o.unitId ?? o.unitInstanceId) !== sid) continue
      if (o.useFireAdjustment) return true
    }
  }
  return false
}

function canRerollFireWithAdjustment(opts) {
  const { isSuppression, targetUnit, shooterFound, list, cells, findUnitOnFieldFn, ordersByUnit } = opts || {}
  if (isSuppression) return false
  if (!shooterFound) return false
  const tgt = liveUnitOf(targetUnit)
  if (tgt && isBattleAirUnitType(tgt)) return false
  if (shooterFireOrderWantsAdjustment(shooterFound, list, ordersByUnit)) return true
  const sp = findFireAdjustmentSpotter(list, shooterFound.unit.instanceId, cells, findUnitOnFieldFn, ordersByUnit)
  if (!sp) return false
  if (unitFaction(sp.unit) !== unitFaction(shooterFound.unit)) return false
  return true
}

function canShooterUseFireAdjustmentOrder(shooterUnit, orderKey) {
  if (String(orderKey || '').trim() !== 'fire') return false
  if (isBattleAirUnitType(shooterUnit)) return false
  return isArtilleryUnit(shooterUnit)
}

function resolveArtilleryFireVisibility(atk, targetCell, cells, deps) {
  const { artilleryAreaClosedIgnoresTerrainLos, isHexVisible, unitHasPropKey: hasProp } = deps
  const propFn = typeof hasProp === 'function' ? hasProp : unitHasPropKey
  const directClear =
    artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, targetCell, cells)

  if (directClear) {
    return { allowed: true, artilleryClosed: false, usedFireAdjustment: false }
  }

  if (propFn(atk.unit, 'concealedTargetFire')) {
    return { allowed: true, artilleryClosed: true, usedFireAdjustment: false }
  }

  return {
    allowed: false,
    reason: 'нет прямой видимости на цель (нужно свойство «Стрельба по закрытым целям»)',
  }
}

function countFireAdjustmentOrders(orders, cells, findUnitOnFieldFn) {
  const counts = Object.create(null)
  if (!Array.isArray(orders)) return counts
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    if (orderKeyOf(o) !== 'fireAdjustment') continue
    const sid = orderUnitId(o)
    if (sid == null) continue
    const found = findUnitOnFieldFn(cells, sid)
    if (!found) continue
    const fac = unitFaction(found.unit)
    counts[fac] = (counts[fac] || 0) + 1
  }
  return counts
}

module.exports = {
  isUnitInTransport,
  unitIsFireAdjustmentSpotter,
  spotterSeesCell,
  findFireAdjustmentSpotter,
  canRerollFireWithAdjustment,
  canShooterUseFireAdjustmentOrder,
  resolveArtilleryFireVisibility,
  countFireAdjustmentOrders,
  countFireAdjustmentUsesInOrders: countFireAdjustmentOrders,
}

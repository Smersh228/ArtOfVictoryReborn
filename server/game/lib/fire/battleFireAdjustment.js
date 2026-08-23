'use strict'

const { getStr, unitFaction } = require('../unit/battleUnitField')
const { isBattleAirUnitType } = require('../map/battleElevation')
const { observerVisionCellIds } = require('../map/battleFogVisibility')

function isUnitInTransport(u) {
  const id = Number(u?.tactical?.embarkedTransportInstanceId)
  return Number.isFinite(id) && id > 0
}

function hasActiveFireAdjustmentSpotter(cells, faction) {
  if (!Array.isArray(cells) || !faction || faction === 'none') return false
  for (let ci = 0; ci < cells.length; ci++) {
    const us = cells[ci].units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (unitFaction(u) !== faction) continue
      if (isBattleAirUnitType(u)) continue
      if (!unitHasPropKeyLocal(u)) continue
      if (isUnitInTransport(u)) continue
      return true
    }
  }
  return false
}

function unitHasPropKeyLocal(u) {
  const props = u?.properties
  if (!Array.isArray(props)) return false
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    if (p && typeof p === 'object' && String(p.prop_key || '').trim() === 'fireAdjustment') return true
  }
  return false
}

function isCellVisibleToAnyFriendly(cells, faction, targetCell) {
  if (!targetCell || !Array.isArray(cells) || !faction || faction === 'none') return false
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (unitFaction(u) !== faction) continue
      if (isBattleAirUnitType(u)) continue
      const seen = observerVisionCellIds(cell, u, cells)
      if (seen.has(targetCell.id)) return true
    }
  }
  return false
}

function canShooterUseFireAdjustmentOrder(shooterUnit, orderKey, isArtilleryUnitFn) {
  if (String(orderKey || '').trim() !== 'fire') return false
  const t = String(shooterUnit?.type ?? '')
  if (t === 'lightAir' || t === 'heavyAir') return false
  return isArtilleryUnitFn(shooterUnit)
}

function resolveArtilleryFireVisibility(atk, targetCell, cells, deps, options) {
  const {
    unitHasPropKey,
    isArtilleryUnit,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
  } = deps
  const useFireAdjustment = !!(options && options.useFireAdjustment)
  const atkFac = unitFaction(atk.unit)

  const directClear =
    artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, targetCell, cells)

  if (directClear) {
    return { allowed: true, artilleryClosed: false, usedFireAdjustment: false }
  }

  if (
    useFireAdjustment &&
    canShooterUseFireAdjustmentOrder(atk.unit, 'fire', isArtilleryUnit)
  ) {
    if (!hasActiveFireAdjustmentSpotter(cells, atkFac)) {
      return { allowed: false, reason: 'нет доступного корректировщика огня (живой, не в транспорте)' }
    }
    if (!isCellVisibleToAnyFriendly(cells, atkFac, targetCell)) {
      return { allowed: false, reason: 'цель не видна союзным отрядам' }
    }
    return { allowed: true, artilleryClosed: true, usedFireAdjustment: true }
  }

  if (unitHasPropKey(atk.unit, 'concealedTargetFire')) {
    return { allowed: true, artilleryClosed: true, usedFireAdjustment: false }
  }

  return {
    allowed: false,
    reason:
      'нет прямой видимости на цель (нужно «Стрельба по закрытым целям» или корректировка огня)',
  }
}

function countFireAdjustmentUsesInOrders(orders, cells, findUnitOnFieldFn) {
  const counts = Object.create(null)
  if (!Array.isArray(orders)) return counts
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    if (!o || !o.useFireAdjustment) continue
    const found = findUnitOnFieldFn(cells, Number(o.unitInstanceId))
    if (!found) continue
    const fac = unitFaction(found.unit)
    counts[fac] = (counts[fac] || 0) + 1
  }
  return counts
}

module.exports = {
  isUnitInTransport,
  hasActiveFireAdjustmentSpotter,
  isCellVisibleToAnyFriendly,
  canShooterUseFireAdjustmentOrder,
  resolveArtilleryFireVisibility,
  countFireAdjustmentUsesInOrders,
}

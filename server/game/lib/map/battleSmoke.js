'use strict'

const { hexDistCells } = require('./battleHexGeometry')

const SMOKE_BLOCKED_ORDERS = new Set([
  'attack',
  'hardMove',
  'ambush',
  'move',
  'moveWar',
  'fireMove',
  'loading',
  'unloading',
  'tow',
  'getSup',
  'loadingSup',
  'clotting',
  'deploy',
  'changeSector',
  'explomost',
  'medical',
  'razvedka',
  'svzy',
  'buildPonton',
  'cutEj',
  'cutWire',
  'demining',
  'mining',
  'trenches',
  'enterDot',
  'exitDot',
  'railLoading',
  'railUnloading',
  'desant',
  'cutGlade',
  'repairRailway',
  'arson',
  'demolition',
])

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return {}
  return builds
}

function hasSmokeOnCell(builds) {
  const b = ensureBuilds(builds)
  if (b.smoke && typeof b.smoke === 'object') return true
  return Number(b.smoke) > 0
}

function smokeMeta(builds) {
  const b = ensureBuilds(builds)
  return b.smoke && typeof b.smoke === 'object' ? b.smoke : null
}

function placeSmokeOnCell(cell, meta) {
  if (!cell) return false
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  cell.builds.smoke = {
    groupId: meta.groupId,
    placedTurn: Number(meta.placedTurn) || 0,
    originCellId: Number(meta.originCellId) || Number(cell.id),
    offset: 0,
    fromFire: meta.fromFire === true,
  }
  return true
}

function clearSmokeOnCell(cell) {
  if (!cell || !cell.builds) return
  delete cell.builds.smoke
}

function nextSmokeGroupId(cells) {
  let max = 0
  for (const c of cells) {
    const m = smokeMeta(c.builds)
    const id = m && Number(m.groupId)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

function markUnitsOnSmoke(cells) {
  const fire = require('./battleSettlementFire')
  for (const c of cells) {
    const on = hasSmokeOnCell(c.builds)
    const burning = fire.hasSettlementFire(c)
    for (const u of c.units || []) {
      if (!u.tactical) u.tactical = {}
      if (on) u.tactical.onSmoke = true
      else delete u.tactical.onSmoke
      if (burning) u.tactical.onSettlementFire = true
      else delete u.tactical.onSettlementFire
    }
  }
}

function smokeBlocksOrderKey(orderKey) {
  return SMOKE_BLOCKED_ORDERS.has(String(orderKey || '').trim())
}

function cancelOrdersOnSmokeHexes(cells, ordersByUnit, le, ph) {
  if (!ordersByUnit || typeof ordersByUnit.delete !== 'function') return
  for (const c of cells) {
    if (!hasSmokeOnCell(c.builds)) continue
    for (const u of c.units || []) {
      const id = Number(u.instanceId)
      if (!Number.isFinite(id) || !ordersByUnit.has(id)) continue
      const spec = ordersByUnit.get(id)
      const k = spec && spec.orderKey ? String(spec.orderKey) : ''
      if (!smokeBlocksOrderKey(k)) continue
      const fire = require('./battleSettlementFire')
      if (fire.hasSettlementFire(c) && (k === 'move' || k === 'moveWar')) continue
      ordersByUnit.delete(id)
      if (typeof le === 'function') {
        le(ph, `Дым: юнит ${id} на кл. ${c.id} — приказ «${k}» отменён`)
      }
    }
  }
}

function fireSectorAllowsSmokeHex(unit, unitCell, targetCell, cells) {
  const {
    unitUsesGunDeploy,
    isArtilleryDeployedForBattle,
    isArtilleryFireTargetCellAllowed,
  } = require('../../core/battleUnitType')
  const dotMod = require('./battleDot')
  if (dotMod.unitInDot(unit) && !dotMod.unitDotExiting(unit)) {
    return dotMod.isDotFireTargetCellAllowed(unit, unitCell, targetCell.id, cells)
  }
  if (unitUsesGunDeploy(unit)) {
    if (!isArtilleryDeployedForBattle(unit)) return false
    return isArtilleryFireTargetCellAllowed(unit, targetCell.id)
  }
  return true
}

function friendlyCanSpotSmokeHex(cells, shooter, targetCell, deps) {
  const { unitFaction, getStr, isHexVisible, maxShootRangeStepsForUnit, hexDistCells: dist } = deps
  if (!shooter || !targetCell) return false
  const fac = unitFaction(shooter)
  const hd = dist || hexDistCells
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (unitFaction(u) !== fac) continue
      const shootR = typeof maxShootRangeStepsForUnit === 'function' ? maxShootRangeStepsForUnit(u) : 0
      if (!(shootR > 0)) continue
      const d = hd(c, targetCell)
      if (d > shootR) continue
      if (typeof isHexVisible === 'function' && !isHexVisible(c, targetCell, cells)) continue
      return true
    }
  }
  return false
}

function getSmokeShells(u) {
  const n = Number(u && u.smokeShells)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function setSmokeShells(u, n) {
  if (!u) return
  u.smokeShells = Math.max(0, Math.floor(Number(n) || 0))
}

function resolveSmokeOrders(cells, list, ordersByUnit, le, ph, turnIndex, deps) {
  const { findUnitOnField, validateUnitOrdersAllowed } = deps
  for (const o of list) {
    if (String(o.orderKey || '').trim() !== 'smoke') continue
    const cur = findUnitOnField(cells, o.unitId)
    if (!cur) continue
    const block = validateUnitOrdersAllowed(cur.unit, 'smoke')
    if (block) {
      le(ph, `Дым: юнит ${o.unitId} — ${block}`)
      continue
    }
    if (getSmokeShells(cur.unit) < 1) {
      le(ph, `Дым: юнит ${o.unitId} — нет дымовых снарядов`)
      continue
    }
    const cid = Number(o.targetCellId)
    const tc = cells.find((c) => Number(c.id) === cid)
    if (!tc) {
      le(ph, `Дым: юнит ${o.unitId} — клетка не найдена`)
      continue
    }
    if (!fireSectorAllowsSmokeHex(cur.unit, cur.cell, tc, cells)) {
      le(ph, `Дым: юнит ${o.unitId} — гекс вне сектора стрельбы (или артиллерия не развёрнута)`)
      continue
    }
    if (!friendlyCanSpotSmokeHex(cells, cur.unit, tc, deps)) {
      le(ph, `Дым: юнит ${o.unitId} — гекс вне видимости/дальности (своей или союзника)`)
      continue
    }
    const groupId = nextSmokeGroupId(cells)
    placeSmokeOnCell(tc, {
      groupId,
      placedTurn: turnIndex,
      originCellId: tc.id,
    })
    setSmokeShells(cur.unit, getSmokeShells(cur.unit) - 1)
    le(ph, `Дымовая завеса: юнит ${o.unitId} → кл. ${tc.id} (−1 дым. снаряд)`)
  }
  markUnitsOnSmoke(cells)
  cancelOrdersOnSmokeHexes(cells, ordersByUnit, le, ph)
}

function tickSmokeAtTurnStart(cells, turnIndex, env, le, ph) {
  void env
  const groups = new Map()
  for (const c of cells) {
    const m = smokeMeta(c.builds)
    if (!m) continue
    const gid = Number(m.groupId) || 0
    if (!groups.has(gid)) groups.set(gid, { meta: m, cells: [] })
    groups.get(gid).cells.push(c)
  }
  for (const [, g] of groups) {
    if (g.meta && g.meta.fromFire) continue
    const placed = Number(g.meta.placedTurn) || 0
    const dt = turnIndex - placed
    if (dt >= 4) {
      for (const c of g.cells) clearSmokeOnCell(c)
      le(ph, `Дымовая завеса снята (кл. ${g.cells.map((x) => x.id).join(', ')})`)
    }
  }
  markUnitsOnSmoke(cells)
}

function truncatePathBeforeSmoke(path) {
  if (!Array.isArray(path) || path.length < 2) return path
  for (let i = 1; i < path.length; i++) {
    if (hasSmokeOnCell(path[i] && path[i].builds)) return path.slice(0, i)
  }
  return path
}

module.exports = {
  hasSmokeOnCell,
  smokeMeta,
  placeSmokeOnCell,
  clearSmokeOnCell,
  markUnitsOnSmoke,
  smokeBlocksOrderKey,
  cancelOrdersOnSmokeHexes,
  fireSectorAllowsSmokeHex,
  friendlyCanSpotSmokeHex,
  getSmokeShells,
  setSmokeShells,
  resolveSmokeOrders,
  tickSmokeAtTurnStart,
  truncatePathBeforeSmoke,
  SMOKE_BLOCKED_ORDERS,
}

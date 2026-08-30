'use strict'

const { applyIntensityPenalty } = require('../scenario/battleEnvironment')
const { getDef, terrainDefenseBonusFromCell } = require('./battleTerrain')
const trench = require('./battleTrench')
const { unitHasPropKey } = require('../../core/battleUnitType')

const MINE_ACCURACY = 2

const SAPPER_ORDER_KEYS = new Set([
  'buildponton',
  'cutej',
  'cutwire',
  'demining',
  'mining',
  'trenches',
])

const INFANTRY_MINE_INTENSITY = {
  infantry: 6,
  artillery: 6,
  truck: 5,
}

const TANK_MINE_INTENSITY = {
  artillery: 4,
  truck: 12,
  armor: 10,
  lighttank: 9,
  mediumtank: 8,
  heavytank: 7,
}

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return { mine: 0 }
  return builds
}

function hasMineOnCell(builds) {
  return Number(ensureBuilds(builds).mine) > 0
}

function getMineKind(builds) {
  return ensureBuilds(builds).mineKind === 'tank' ? 'tank' : 'infantry'
}

function readMineTeam(builds) {
  const n = Math.floor(Number(ensureBuilds(builds).mineTeam))
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

function mineOwnerBattleFaction(builds) {
  const team = readMineTeam(builds)
  if (team == null) return 'none'
  return team % 2 === 1 ? 'rkka' : 'wehrmacht'
}

function normalizeViewerFaction(faction) {
  const raw = String(faction || '').toLowerCase()
  if (raw === 'ussr' || raw === 'rkka') return 'rkka'
  if (raw === 'germany' || raw === 'wehrmacht') return 'wehrmacht'
  return 'none'
}

function isMineFriendlyToUnit(cell, unit) {
  const mf = mineOwnerBattleFaction(cell && cell.builds)
  const uf = normalizeViewerFaction(unit && unit.faction)
  return mf !== 'none' && uf !== 'none' && mf === uf
}

function isMineRevealed(builds) {
  return hasMineOnCell(builds) && Boolean(ensureBuilds(builds).mineRevealed)
}

function revealMineOnCell(cell) {
  if (!cell) return
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = { mine: 0 }
  if (Number(cell.builds.mine) <= 0) return
  cell.builds.mineRevealed = true
  if (cell.builds.mineKind !== 'tank') cell.builds.mineKind = 'infantry'
}

function isMineDiscoveredForUnit(cell, unit) {
  if (!cell || !hasMineOnCell(cell.builds)) return false
  if (isMineRevealed(cell.builds)) return true
  return isMineFriendlyToUnit(cell, unit)
}

function placeMineOnCell(cell, opts) {
  if (!cell) return false
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  if (Number(cell.builds.mine) > 0) return false
  const kind = opts && opts.kind === 'tank' ? 'tank' : 'infantry'
  const team = Math.floor(Number(opts && opts.team))
  cell.builds.mine = 1
  cell.builds.mineKind = kind
  if (Number.isFinite(team) && team >= 1) cell.builds.mineTeam = team
  delete cell.builds.mineRevealed
  return true
}

function removeMineFromCell(cell) {
  if (!cell || !cell.builds) return false
  if (Number(cell.builds.mine) <= 0) return false
  cell.builds.mine = 0
  delete cell.builds.mineKind
  delete cell.builds.mineTeam
  delete cell.builds.mineRevealed
  return true
}

function unitTypeKey(unit) {
  return String(unit && unit.type ? unit.type : '')
    .trim()
    .toLowerCase()
}

function isSapperUnit(unit) {
  const orders = unit && unit.orders
  if (!Array.isArray(orders)) return false
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    const k = String((o && (o.order_key || o.key)) || '')
      .trim()
      .toLowerCase()
    if (SAPPER_ORDER_KEYS.has(k)) return true
  }
  return false
}

function mineIntensityForUnit(kind, unit, isTruckUnit) {
  if (!unit) return null
  const truck = typeof isTruckUnit === 'function' && isTruckUnit(unit)
  if (kind === 'infantry') {
    if (truck) return INFANTRY_MINE_INTENSITY.truck
    const t = unitTypeKey(unit)
    if (t === 'infantry') return INFANTRY_MINE_INTENSITY.infantry
    if (t === 'artillery') return INFANTRY_MINE_INTENSITY.artillery
    return null
  }
  if (truck) return TANK_MINE_INTENSITY.truck
  const t = unitTypeKey(unit)
  if (t === 'artillery') return TANK_MINE_INTENSITY.artillery
  if (t === 'armor') return TANK_MINE_INTENSITY.armor
  if (t === 'lighttank') return TANK_MINE_INTENSITY.lighttank
  if (t === 'mediumtank') return TANK_MINE_INTENSITY.mediumtank
  if (t === 'heavytank') return TANK_MINE_INTENSITY.heavytank
  return null
}

function mineAffectsUnit(cell, unit, isTruckUnit) {
  if (!cell || !hasMineOnCell(cell.builds)) return false
  if (isMineFriendlyToUnit(cell, unit)) return false
  return mineIntensityForUnit(getMineKind(cell.builds), unit, isTruckUnit) != null
}

function isCombatMoveOrder(orderKey) {
  return String(orderKey || '').trim() === 'moveWar'
}

function unitHasMineDetection(unit) {
  return Boolean(unit) && unitHasPropKey(unit, 'mineDetection')
}

function canDetectMinesWithoutBlast(unit, orderKey) {
  return unitHasMineDetection(unit) && isCombatMoveOrder(orderKey)
}

function hasEnemyMineOnCell(cell, unit) {
  if (!cell || !hasMineOnCell(cell.builds)) return false
  return !isMineFriendlyToUnit(cell, unit)
}

function planMinePath(path, unit, orderKey, isTruckUnit) {
  const empty = { endIndex: 0, blasts: [], reveals: [] }
  if (!Array.isArray(path) || path.length < 1 || !unit) return empty
  let endIndex = path.length - 1
  const blasts = []
  const reveals = []
  const detectWar = canDetectMinesWithoutBlast(unit, orderKey)
  if (detectWar) {
    if (hasEnemyMineOnCell(path[0], unit)) {
      reveals.push({ index: 0, reason: 'start' })
    }
    for (let i = 1; i <= endIndex; i++) {
      if (!hasEnemyMineOnCell(path[i], unit)) continue
      endIndex = i
      reveals.push({ index: i, reason: 'enter' })
      break
    }
    return { endIndex, blasts, reveals }
  }
  if (mineAffectsUnit(path[0], unit, isTruckUnit) && path.length >= 2) {
    endIndex = Math.min(endIndex, 1)
    blasts.push({ index: 0, reason: 'start' })
  }
  for (let i = 1; i <= endIndex; i++) {
    if (!mineAffectsUnit(path[i], unit, isTruckUnit)) continue
    endIndex = i
    blasts.push({ index: i, reason: 'enter' })
    break
  }
  return { endIndex, blasts, reveals }
}

function blastsReachedOnMove(plan, endStepIndex) {
  const out = []
  const blasts = plan && Array.isArray(plan.blasts) ? plan.blasts : []
  for (let i = 0; i < blasts.length; i++) {
    const b = blasts[i]
    const idx = Number(b.index)
    if (b.reason === 'start') {
      if (endStepIndex >= 1) out.push(b)
      continue
    }
    if (idx >= 1 && idx <= endStepIndex) out.push(b)
  }
  return out
}

function rollDice(diceCount, rng) {
  const results = []
  const rand = rng || Math.random
  const n = Math.max(0, Math.floor(Number(diceCount) || 0))
  for (let i = 0; i < n; i++) {
    results.push(Math.floor(rand() * 6) + 1)
  }
  return results
}

function resolveOneMineBlast(cell, unit, cells, le, ph, blast, deps) {
  const {
    getStr,
    setStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
  } = deps
  if (!cell || !unit || getStr(unit) <= 0) return false
  if (!hasMineOnCell(cell.builds)) return false
  const kind = getMineKind(cell.builds)
  const intensity = mineIntensityForUnit(kind, unit, isTruckUnit)
  if (intensity == null) return false
  revealMineOnCell(cell)
  const diceCount = applyIntensityPenalty(intensity)
  const accuracy = MINE_ACCURACY
  const rolls = rollDice(diceCount)
  const hits = rolls.filter((r) => r <= accuracy).length
  const defense = trench.isTrenchDigging(unit)
    ? 0
    : getDef(unit) + terrainDefenseBonusFromCell(cell, unit) + trench.unitCoverDefenseBonus(unit, null, cell)
  const damages = Math.max(0, hits - defense)
  const prevStr = getStr(unit)
  setStr(unit, prevStr - damages)
  const kindLabel = kind === 'tank' ? 'танковая' : 'пехотная'
  const reason = blast && blast.reason === 'start' ? 'старт на минном поле' : 'проход через минное поле'
  le(
    ph,
    `Подрыв: юнит ${unit.instanceId} на кл. ${cell.id}, мина ${kindLabel}, урон ${damages} (выпало: [${rolls.join(',')}])`,
    {
      mineLine: {
        unitInstanceId: Number(unit.instanceId),
        cellId: Number(cell.id),
        mineKind: kind,
        intensity: diceCount,
        accuracy,
        hits,
        damages,
        rollResults: rolls,
        diceCount,
        reason,
      },
    },
  )
  logUnitDestroyed(le, ph, unit, prevStr, 'подрыв на мине', cell.id)
  if (isTruckUnit(unit) && damages > 0) applyCargoDamageFromTruckHit(cells, unit, damages)
  if (typeof sweepCorpses === 'function') sweepCorpses(cells)
  return getStr(unit) <= 0
}

function resolveMineBlastsAfterMove(cells, unit, path, plan, endStepIndex, le, ph, deps) {
  const { findUnitOnField, getStr } = deps
  const reached = blastsReachedOnMove(plan, endStepIndex)
  for (let i = 0; i < reached.length; i++) {
    const b = reached[i]
    const live = findUnitOnField(cells, unit.instanceId)
    if (!live || getStr(live.unit) <= 0) break
    const cell = path[b.index]
    if (!cell) continue
    const died = resolveOneMineBlast(cell, live.unit, cells, le, ph, b, deps)
    if (died) break
  }
}

function revealsReachedOnMove(plan, endStepIndex) {
  const out = []
  const reveals = plan && Array.isArray(plan.reveals) ? plan.reveals : []
  for (let i = 0; i < reveals.length; i++) {
    const r = reveals[i]
    const idx = Number(r.index)
    if (r.reason === 'start') {
      out.push(r)
      continue
    }
    if (idx >= 1 && idx <= endStepIndex) out.push(r)
  }
  return out
}

function resolveMineRevealsAfterMove(cells, unit, path, plan, endStepIndex, le, ph) {
  const reached = revealsReachedOnMove(plan, endStepIndex)
  for (let i = 0; i < reached.length; i++) {
    const r = reached[i]
    const cell = path[r.index]
    if (!cell || !hasMineOnCell(cell.builds)) continue
    const already = isMineRevealed(cell.builds)
    revealMineOnCell(cell)
    const kind = getMineKind(cell.builds)
    const kindLabel = kind === 'tank' ? 'танковая' : 'пехотная'
    const reason = r.reason === 'start' ? 'старт на минном поле' : 'боевое движение через минное поле'
    le(
      ph,
      `Обнаружение мин: юнит ${unit.instanceId} на кл. ${cell.id}, ${kindLabel}${already ? ' (уже открыто)' : ''}`,
      {
        mineReveal: {
          unitInstanceId: Number(unit.instanceId),
          cellId: Number(cell.id),
          mineKind: kind,
          reason,
        },
      },
    )
  }
}

function maskUnrevealedMines(cells, viewerFaction) {
  if (!Array.isArray(cells)) return cells
  const vf = normalizeViewerFaction(viewerFaction)
  let changed = false
  const out = new Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const b = c && c.builds
    if (!b || Number(b.mine) <= 0 || b.mineRevealed) {
      out[i] = c
      continue
    }
    if (vf !== 'none' && mineOwnerBattleFaction(b) === vf) {
      out[i] = c
      continue
    }
    changed = true
    const builds = { ...b, mine: 0 }
    delete builds.mineKind
    delete builds.mineRevealed
    delete builds.mineTeam
    out[i] = { ...c, builds }
  }
  return changed ? out : cells
}

module.exports = {
  MINE_ACCURACY,
  hasMineOnCell,
  getMineKind,
  isMineRevealed,
  isMineDiscoveredForUnit,
  revealMineOnCell,
  placeMineOnCell,
  removeMineFromCell,
  isSapperUnit,
  mineIntensityForUnit,
  mineAffectsUnit,
  planMinePath,
  resolveMineBlastsAfterMove,
  resolveMineRevealsAfterMove,
  maskUnrevealedMines,
}

'use strict'

const { isInfantryUnit, isArtilleryUnit } = require('../../core/battleUnitType')

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
]

const EMPTY_BUILDS = {
  trench: 0,
  trenchEdges: 0,
  wire: 0,
  wireEdges: 0,
  antiTankBuild: 0,
  antiTankEdges: 0,
  storage: 0,
  mine: 0,
  trenchTank: 0,
  dot: 0,
  pontonBridge: 0,
}

const FORBIDDEN_TYPES = new Set([
  'river',
  'swamp',
  'marsh',
  'bog',
  'lake',
  'water',
  'ford',
  'stones',
  'stone',
  'rock',
  'rocks',
  'bridge',
  'railwaybridge',
  'railbridge',
  'rail_bridge',
])

const FORBIDDEN_NAME_RE =
  /река|болот|озер|озёр|брод|камн|мост|железнодорожн/i

const TRENCH_DIG_MIN_STR = 3
const DEFAULT_TRENCH_DIG_TURNS = 2

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return { ...EMPTY_BUILDS }
  return { ...EMPTY_BUILDS, ...builds }
}

function getTrenchEdgesMask(builds) {
  const b = ensureBuilds(builds)
  const raw = b.trenchEdges
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw & 0x3f
  const legacy = b.trench
  if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) return 0x3f
  return 0
}

function hasTrenchOnCell(builds) {
  return getTrenchEdgesMask(builds) !== 0
}

function hasTrenchOnEdge(builds, edgeDir) {
  if (edgeDir < 0 || edgeDir > 5) return false
  return (getTrenchEdgesMask(builds) & (1 << edgeDir)) !== 0
}

function moveDirToVisualEdge(moveDir) {
  if (moveDir <= 0) return 0
  if (moveDir >= 6) return 0
  return moveDir === 3 ? 3 : 6 - moveDir
}

function findMoveDir(fromCell, toCell) {
  if (!fromCell || !toCell) return -1
  for (let dir = 0; dir < 6; dir++) {
    const d = CUBE_NEIGHBOR_DIRS[dir]
    const nx = fromCell.coor.x + d.x
    const ny = fromCell.coor.y + d.y
    const nz = fromCell.coor.z + d.z
    if (nx === toCell.coor.x && ny === toCell.coor.y && nz === toCell.coor.z) return dir
  }
  return -1
}

function addTrenchEdgeOnBuilds(builds, edgeDir) {
  const base = ensureBuilds(builds)
  if (edgeDir < 0 || edgeDir > 5) return base
  const mask = getTrenchEdgesMask(base)
  return { ...base, trenchEdges: (mask | (1 << edgeDir)) & 0x3f, trench: 0 }
}

function hexExtraObj(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function isTrenchForbiddenOnCell(cell) {
  if (!cell) return true
  const ex = hexExtraObj(cell)
  if (ex && ex.placementAllowed && ex.placementAllowed.trench === false) return true
  if (ex && ex.isBridge === true) return true
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
  if (FORBIDDEN_TYPES.has(t)) return true
  const name = String((ex && (ex.name || ex.label)) || cell.name || '')
  if (FORBIDDEN_NAME_RE.test(name) || FORBIDDEN_NAME_RE.test(String(cell.type || ''))) return true
  return false
}

function canUnitTypeOccupyTrench(unit) {
  if (!unit) return false
  if (isInfantryUnit(unit)) return true
  if (isArtilleryUnit(unit)) return true
  return false
}

function isTrenchDigging(unit) {
  const n = Number(unit && unit.tactical && unit.tactical.trenchDigTurnsLeft)
  return Number.isFinite(n) && n > 0
}

function readTrenchDigDuration(unit) {
  const orders = unit && unit.orders
  if (Array.isArray(orders)) {
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i]
      if (!o || typeof o !== 'object') continue
      const k = String(o.order_key || o.key || '').trim()
      if (k !== 'trenches') continue
      for (const field of ['turns', 'duration', 'time', 'orderTurns', 'turns_count']) {
        const n = Number(o[field])
        if (Number.isFinite(n) && n >= 1) return Math.floor(n)
      }
      const m = String(o.name || '').match(/(\d+)/)
      if (m) {
        const n = Number(m[1])
        if (Number.isFinite(n) && n >= 1) return Math.floor(n)
      }
    }
  }
  return DEFAULT_TRENCH_DIG_TURNS
}

function clearTrenchDig(unit) {
  if (!unit || !unit.tactical) return
  delete unit.tactical.trenchDigTurnsLeft
  delete unit.tactical.trenchDigEdgeDir
  delete unit.tactical.trenchDigCellId
}

function startTrenchDig(unit, cell, edgeDir, duration) {
  if (!unit) return
  if (!unit.tactical) unit.tactical = {}
  const turns = Math.max(1, Math.floor(Number(duration) || DEFAULT_TRENCH_DIG_TURNS))
  unit.tactical.trenchDigTurnsLeft = turns
  unit.tactical.trenchDigEdgeDir = edgeDir
  unit.tactical.trenchDigCellId = cell ? Number(cell.id) : null
}

function completeTrenchDigOnUnit(unit, cell) {
  if (!unit || !cell) return false
  const edgeDir = Math.floor(Number(unit.tactical && unit.tactical.trenchDigEdgeDir))
  if (!Number.isFinite(edgeDir) || edgeDir < 0 || edgeDir > 5) {
    clearTrenchDig(unit)
    return false
  }
  if (hasTrenchOnEdge(cell.builds, edgeDir)) {
    clearTrenchDig(unit)
    return false
  }
  cell.builds = addTrenchEdgeOnBuilds(cell.builds, edgeDir)
  clearTrenchDig(unit)
  return true
}

function tickTrenchDigging(cells, le, ph) {
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isTrenchDigging(u)) continue
      let left = Number(u.tactical.trenchDigTurnsLeft)
      left -= 1
      if (left <= 0) {
        const edgeDir = Math.floor(Number(u.tactical.trenchDigEdgeDir))
        const placed = completeTrenchDigOnUnit(u, c)
        if (placed) {
          le(ph, `Окопаться: юнит ${u.instanceId} установил окоп на кл. ${c.id}`, {
            trenchPlaced: true,
            trenchCellId: Number(c.id),
            trenchEdgeDir: edgeDir,
            unitInstanceId: Number(u.instanceId),
          })
        } else {
          le(ph, `Окопаться: юнит ${u.instanceId} не установил окоп на кл. ${c.id}`)
        }
      } else {
        u.tactical.trenchDigTurnsLeft = left
        le(ph, `Окопаться: юнит ${u.instanceId} копает окоп (осталось ${left} ход.)`, {
          trenchDigging: true,
          trenchDigTurnsLeft: left,
          unitInstanceId: Number(u.instanceId),
        })
      }
    }
  }
}

function unitInTrench(unit) {
  return Boolean(unit && unit.tactical && unit.tactical.inTrench)
}

function trenchOccupantId(cell) {
  const id = Number(cell && cell.builds && cell.builds.trenchOccupantId)
  return Number.isFinite(id) && id > 0 ? id : null
}

function isTrenchOccupiedByOther(cell, unitId, cells, findUnitOnField) {
  const occ = trenchOccupantId(cell)
  if (occ == null || Number(occ) === Number(unitId)) return false
  if (typeof findUnitOnField !== 'function') return true
  const found = findUnitOnField(cells, occ)
  return Boolean(found && unitInTrench(found.unit))
}

function leaveTrench(unit, cell) {
  if (unit && unit.tactical) {
    delete unit.tactical.inTrench
    clearTrenchDig(unit)
  }
  if (!cell || !cell.builds) return
  const occ = trenchOccupantId(cell)
  if (occ != null && unit && Number(occ) === Number(unit.instanceId)) {
    delete cell.builds.trenchOccupantId
  }
}

function occupyTrench(unit, cell) {
  if (!unit) return
  if (!unit.tactical) unit.tactical = {}
  unit.tactical.inTrench = true
  if (cell) {
    if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
    cell.builds.trenchOccupantId = Number(unit.instanceId)
  }
}

function facingMatchesTrench(unitCell, facingCell) {
  if (!hasTrenchOnCell(unitCell && unitCell.builds)) return false
  const moveDir = findMoveDir(unitCell, facingCell)
  if (moveDir < 0) return false
  return hasTrenchOnEdge(unitCell.builds, moveDirToVisualEdge(moveDir))
}

function tryOccupyTrenchFromDefend(unit, unitCell, facingCell, cells, deps) {
  const { findUnitOnField, isArtilleryDeployedForBattle } = deps || {}
  if (!canUnitTypeOccupyTrench(unit)) return false
  if (isArtilleryUnit(unit) && typeof isArtilleryDeployedForBattle === 'function') {
    if (!isArtilleryDeployedForBattle(unit)) return false
  }
  if (!facingMatchesTrench(unitCell, facingCell)) return false
  if (isTrenchOccupiedByOther(unitCell, unit.instanceId, cells, findUnitOnField)) return false
  occupyTrench(unit, unitCell)
  return true
}

function unitCoverDefenseBonus(unit, attackerCell, unitCell, opts) {
  if (!unit) return 0
  const ignoreTrench = opts && opts.ignoreTrench === true
  let n = 0
  if (!ignoreTrench && unitInTrench(unit)) {
    if (!attackerCell) n += 2
    else if (unitCell && Number(attackerCell.id) === Number(unitCell.id)) n += 2
    else {
      const sector = unit.defendSectorCellIds
      if (!Array.isArray(sector) || !sector.length) n += 2
      else if (sector.some((id) => Number(id) === Number(attackerCell.id))) n += 2
    }
  }
  if (unit.tactical && unit.tactical.defendOrder) n += 1
  return n
}

module.exports = {
  getTrenchEdgesMask,
  hasTrenchOnCell,
  hasTrenchOnEdge,
  addTrenchEdgeOnBuilds,
  findMoveDir,
  moveDirToVisualEdge,
  isTrenchForbiddenOnCell,
  canUnitTypeOccupyTrench,
  isTrenchDigging,
  readTrenchDigDuration,
  startTrenchDig,
  tickTrenchDigging,
  clearTrenchDig,
  TRENCH_DIG_MIN_STR,
  unitInTrench,
  leaveTrench,
  occupyTrench,
  facingMatchesTrench,
  tryOccupyTrenchFromDefend,
  unitCoverDefenseBonus,
  isTrenchOccupiedByOther,
}

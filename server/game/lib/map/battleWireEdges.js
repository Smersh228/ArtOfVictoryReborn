'use strict'

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
  antiTankBuild: 0,
  antiTankEdges: 0,
  storage: 0,
  mine: 0,
  trenchTank: 0,
  dot: 0,
  pontonBridge: 0,
  wireEdges: 0,
}

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return { ...EMPTY_BUILDS }
  return { ...EMPTY_BUILDS, ...builds }
}

function getWireEdgesMask(builds) {
  const b = ensureBuilds(builds)
  const raw = b.wireEdges
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw & 0x3f
  const legacy = b.wire
  if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) return 0x3f
  return 0
}

function hasWireOnCell(builds) {
  return getWireEdgesMask(builds) !== 0
}

function hasWireOnEdge(builds, edgeDir) {
  if (edgeDir < 0 || edgeDir > 5) return false
  return (getWireEdgesMask(builds) & (1 << edgeDir)) !== 0
}

function clearAllWireOnBuilds(builds) {
  return { ...ensureBuilds(builds), wireEdges: 0, wire: 0 }
}

function clearWireEdgeOnBuilds(builds, edgeDir) {
  const base = ensureBuilds(builds)
  if (edgeDir < 0 || edgeDir > 5) return base
  return { ...base, wireEdges: getWireEdgesMask(base) & ~(1 << edgeDir), wire: 0 }
}

function findMoveDir(fromCell, toCell) {
  for (let dir = 0; dir < 6; dir++) {
    const d = CUBE_NEIGHBOR_DIRS[dir]
    const nx = fromCell.coor.x + d.x
    const ny = fromCell.coor.y + d.y
    const nz = fromCell.coor.z + d.z
    if (nx === toCell.coor.x && ny === toCell.coor.y && nz === toCell.coor.z) return dir
  }
  return -1
}

/** Визуальный индекс грани (редактор) ↔ направление соседа (движение). */
function moveDirToVisualEdge(moveDir) {
  if (moveDir <= 0) return 0
  if (moveDir >= 6) return 0
  return moveDir === 3 ? 3 : 6 - moveDir
}

function hasWireOnMoveDir(builds, moveDir) {
  return hasWireOnEdge(builds, moveDirToVisualEdge(moveDir))
}

function isGroundUnitType(type) {
  const t = String(type || '').trim()
  return t !== 'lightAir' && t !== 'heavyAir'
}

function wireBlocksGroundMove(fromCell, toCell, unit, unitHasPropKey) {
  if (!isGroundUnitType(unit.type)) return false
  const dir = findMoveDir(fromCell, toCell)
  if (dir < 0) return false
  const oppDir = (dir + 3) % 6
  const blockedExit = hasWireOnMoveDir(fromCell.builds, dir)
  const blockedEntry = hasWireOnMoveDir(toCell.builds, oppDir)
  if (!blockedExit && !blockedEntry) return false
  if (unitHasPropKey(unit, 'breakingThroughBarbedWire')) return false
  return true
}

function applyWireBreakthroughOnStep(fromCell, toCell, unit, unitHasPropKey) {
  if (typeof unitHasPropKey !== 'function') return false
  if (!unitHasPropKey(unit, 'breakingThroughBarbedWire')) return false
  const dir = findMoveDir(fromCell, toCell)
  if (dir < 0) return false
  const oppDir = (dir + 3) % 6
  let cleared = false
  if (hasWireOnMoveDir(fromCell.builds, dir)) {
    fromCell.builds = clearWireEdgeOnBuilds(fromCell.builds, moveDirToVisualEdge(dir))
    cleared = true
  }
  if (hasWireOnMoveDir(toCell.builds, oppDir)) {
    toCell.builds = clearWireEdgeOnBuilds(toCell.builds, moveDirToVisualEdge(oppDir))
    cleared = true
  }
  return cleared
}

function cutWireAlongSharedEdge(fromCell, toCell) {
  const dir = findMoveDir(fromCell, toCell)
  if (dir < 0) return false
  const oppDir = (dir + 3) % 6
  let cleared = false
  if (hasWireOnMoveDir(fromCell.builds, dir)) {
    fromCell.builds = clearWireEdgeOnBuilds(fromCell.builds, moveDirToVisualEdge(dir))
    cleared = true
  }
  if (hasWireOnMoveDir(toCell.builds, oppDir)) {
    toCell.builds = clearWireEdgeOnBuilds(toCell.builds, moveDirToVisualEdge(oppDir))
    cleared = true
  }
  return cleared
}

function cutWireOnCellEdge(cell, edgeDir) {
  if (!cell || !hasWireOnEdge(cell.builds, edgeDir)) return false
  cell.builds = clearWireEdgeOnBuilds(cell.builds, edgeDir)
  return true
}

function listWireEdgeDirs(builds) {
  const mask = getWireEdgesMask(builds)
  const out = []
  for (let d = 0; d < 6; d++) {
    if ((mask & (1 << d)) !== 0) out.push(d)
  }
  return out
}

function tryDestroyBarbedWireFromFire(targetCell, attacker, unitHasPropKey, le, ph) {
  if (!targetCell || !attacker) return false
  if (!unitHasPropKey(attacker, 'destructionOfBarbedWire')) return false
  const edges = listWireEdgeDirs(targetCell.builds)
  if (!edges.length) return false
  const edgeDir = edges[Math.floor(Math.random() * edges.length)]
  targetCell.builds = clearWireEdgeOnBuilds(targetCell.builds, edgeDir)
  const left = listWireEdgeDirs(targetCell.builds).length
  le(ph, `Подрыв проволоки: юнит ${attacker.instanceId} уничтожил колючую проволоку на кл. ${targetCell.id}`, {
    wireDestroyed: {
      unitInstanceId: Number(attacker.instanceId),
      cellId: Number(targetCell.id),
      edgeDir,
      remaining: left,
    },
  })
  return true
}

module.exports = {
  ensureBuilds,
  getWireEdgesMask,
  hasWireOnCell,
  hasWireOnEdge,
  clearAllWireOnBuilds,
  clearWireEdgeOnBuilds,
  findMoveDir,
  hasWireOnMoveDir,
  wireBlocksGroundMove,
  applyWireBreakthroughOnStep,
  listWireEdgeDirs,
  tryDestroyBarbedWireFromFire,
  cutWireAlongSharedEdge,
  cutWireOnCellEdge,
}

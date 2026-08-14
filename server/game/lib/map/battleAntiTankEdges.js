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

function getAntiTankEdgesMask(builds) {
  const b = ensureBuilds(builds)
  const raw = b.antiTankEdges
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw & 0x3f
  const legacy = b.antiTankBuild
  if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) return 0x3f
  return 0
}

function hasAntiTankOnCell(builds) {
  return getAntiTankEdgesMask(builds) !== 0
}

function hasAntiTankOnEdge(builds, edgeDir) {
  if (edgeDir < 0 || edgeDir > 5) return false
  return (getAntiTankEdgesMask(builds) & (1 << edgeDir)) !== 0
}

function clearAllAntiTankOnBuilds(builds) {
  return { ...ensureBuilds(builds), antiTankEdges: 0, antiTankBuild: 0 }
}

function clearAntiTankEdgeOnBuilds(builds, edgeDir) {
  const base = ensureBuilds(builds)
  if (edgeDir < 0 || edgeDir > 5) return base
  return { ...base, antiTankEdges: getAntiTankEdgesMask(base) & ~(1 << edgeDir), antiTankBuild: 0 }
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

function moveDirToVisualEdge(moveDir) {
  if (moveDir <= 0) return 0
  if (moveDir >= 6) return 0
  return moveDir === 3 ? 3 : 6 - moveDir
}

function hasAntiTankOnMoveDir(builds, moveDir) {
  return hasAntiTankOnEdge(builds, moveDirToVisualEdge(moveDir))
}

function isAntiTankBlockedUnitType(type) {
  const t = String(type || '').trim()
  return t === 'tech' || t === 'armor' || t === 'lightTank' || t === 'mediumTank' || t === 'heavyTank'
}

/** Танки и бронетехника не проходят через грань с танковым ежом. */
function antiTankBlocksGroundMove(fromCell, toCell, unit) {
  if (!isAntiTankBlockedUnitType(unit.type)) return false
  const dir = findMoveDir(fromCell, toCell)
  if (dir < 0) return false
  const oppDir = (dir + 3) % 6
  const blockedExit = hasAntiTankOnMoveDir(fromCell.builds, dir)
  const blockedEntry = hasAntiTankOnMoveDir(toCell.builds, oppDir)
  return blockedExit || blockedEntry
}

module.exports = {
  ensureBuilds,
  getAntiTankEdgesMask,
  hasAntiTankOnCell,
  hasAntiTankOnEdge,
  clearAllAntiTankOnBuilds,
  clearAntiTankEdgeOnBuilds,
  findMoveDir,
  antiTankBlocksGroundMove,
}

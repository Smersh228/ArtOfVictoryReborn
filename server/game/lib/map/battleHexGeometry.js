'use strict'

function hexDist(ax, ay, az, bx, by, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
}

function getNeighbor(hex, dir) {
  const dirs = [
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
  ]
  return { x: hex.x + dirs[dir].x, y: hex.y + dirs[dir].y, z: hex.z + dirs[dir].z }
}

function findCellByCoor(cells, coor) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.coor.x === coor.x && c.coor.y === coor.y && c.coor.z === coor.z) return c
  }
  return null
}

function hexDistCells(ca, cb) {
  return hexDist(ca.coor.x, ca.coor.y, ca.coor.z, cb.coor.x, cb.coor.y, cb.coor.z)
}

module.exports = {
  hexDist,
  getNeighbor,
  findCellByCoor,
  hexDistCells,
}

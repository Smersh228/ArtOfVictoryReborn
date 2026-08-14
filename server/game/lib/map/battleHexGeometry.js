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

/** Округление дробных кубических координат к ближайшему целому гексу. */
function cubeRound(fr) {
  let rx = Math.round(fr.x)
  let ry = Math.round(fr.y)
  let rz = Math.round(fr.z)
  const xDiff = Math.abs(rx - fr.x)
  const yDiff = Math.abs(ry - fr.y)
  const zDiff = Math.abs(rz - fr.z)
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz
  } else if (yDiff > zDiff) {
    ry = -rx - rz
  } else {
    rz = -rx - ry
  }
  return { x: rx, y: ry, z: rz }
}

function cubeLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

function dedupeConsecutiveCubes(arr) {
  const res = []
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    const last = res[res.length - 1]
    if (!last || last.x !== c.x || last.y !== c.y || last.z !== c.z) res.push(c)
  }
  return res
}

/** Дискретная прямая между двумя гексами в кубических координатах (линия на сетке). */
function cubeLineThroughCube(a, b) {
  const N = hexDist(a.x, a.y, a.z, b.x, b.y, b.z)
  const out = []
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N
    out.push(cubeRound(cubeLerp(a, b, t)))
  }
  return dedupeConsecutiveCubes(out)
}

/**
 * Цепочка id клеток по прямой от точки вылета до назначения (только существующие на поле гексы).
 * @returns {number[]|null} null если какой-то шаг выходит за пределы загруженной сетки
 */
function hexFlightPathCellIds(cells, ca, cb) {
  const line = cubeLineThroughCube(ca.coor, cb.coor)
  const ids = []
  for (let i = 0; i < line.length; i++) {
    const cell = findCellByCoor(cells, line[i])
    if (!cell) return null
    const id = Number(cell.id)
    if (!ids.length || ids[ids.length - 1] !== id) ids.push(id)
  }
  return ids
}

/** Маршрут по прямой; если линия выходит за сетку — минимум «вылет → цель». */
function buildFlightPathCellIds(cells, ca, cb) {
  const pathIds = hexFlightPathCellIds(cells, ca, cb)
  if (Array.isArray(pathIds) && pathIds.length) return pathIds
  const depId = Number(ca?.id)
  const tgtId = Number(cb?.id)
  if (!Number.isFinite(depId) || !Number.isFinite(tgtId)) return []
  return depId === tgtId ? [depId] : [depId, tgtId]
}

module.exports = {
  hexDist,
  getNeighbor,
  findCellByCoor,
  hexDistCells,
  hexFlightPathCellIds,
  buildFlightPathCellIds,
  cubeLineThroughCube,
}

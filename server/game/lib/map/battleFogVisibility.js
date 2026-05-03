'use strict'

const { getStr, unitFaction, opposing } = require('../unit/battleUnitField')
const { readVisionRange } = require('../unit/battleUnitVision')

const LOS_BLOCKING = new Set([
  'mountain',
  'forest',
  'hill',
  'city',
  'village',
  'openforest',
  'bushs',
  'лес',
  'редколесье',
  'кустарники',
  'город',
  'деревня',
])

function cellToCube(c) {
  return { x: c.coor.x, y: c.coor.y, z: c.coor.z }
}

function cubeDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z))
}

function cubeLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

function cubeRound(frac) {
  let rx = Math.round(frac.x)
  let ry = Math.round(frac.y)
  let rz = Math.round(frac.z)
  const xDiff = Math.abs(rx - frac.x)
  const yDiff = Math.abs(ry - frac.y)
  const zDiff = Math.abs(rz - frac.z)
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz
  } else if (yDiff > zDiff) {
    ry = -rx - rz
  } else {
    rz = -rx - ry
  }
  return { x: rx, y: ry, z: rz }
}

function cubeLineDraw(a, b) {
  const n = cubeDistance(a, b)
  if (n === 0) return [a]
  const raw = []
  for (let i = 0; i <= n; i++) {
    raw.push(cubeRound(cubeLerp(a, b, (1 / n) * i)))
  }
  const dedup = []
  for (const c of raw) {
    const last = dedup[dedup.length - 1]
    if (!last || last.x !== c.x || last.y !== c.y || last.z !== c.z) dedup.push(c)
  }
  return dedup
}

function findCellByCube(cells, cube) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.coor.x === cube.x && c.coor.y === cube.y && c.coor.z === cube.z) return c
  }
  return null
}

function cellBlocksLineOfSight(cell) {
  if (cell.mapBuilding != null) return true
  const vb = cell.visionBlock
  if (vb === true || vb === 'true' || vb === 1 || vb === '1') return true
  if (cell.visible === false) return true
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
  return LOS_BLOCKING.has(t)
}

function isHexVisible(observer, target, cells) {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target))
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i])
    if (!c) return false
    if (cellBlocksLineOfSight(c)) return false
  }
  return true
}

function visibleCellIdsInRange(observer, maxRange, cells) {
  const obs = cellToCube(observer)
  const out = new Set()
  out.add(observer.id)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.id === observer.id) continue
    if (cubeDistance(obs, cellToCube(c)) > maxRange) continue
    if (isHexVisible(observer, c, cells)) out.add(c.id)
  }
  return out
}

function isCellSeenByAnyHostileUnit(subjectUnit, targetCell, cells) {
  if (!subjectUnit || !targetCell || !cells || !cells.length) return false
  const mySide = unitFaction(subjectUnit)
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (!opposing(mySide, unitFaction(u))) continue
      const seen = visibleCellIdsInRange(cell, readVisionRange(u), cells)
      if (seen.has(targetCell.id)) return true
    }
  }
  return false
}

function computeRevealedCellIdsForFaction(cells, faction) {
  if (faction === 'none') return null
  const revealed = new Set()
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (unitFaction(u) !== faction) continue
      if (getStr(u) <= 0) continue
      const r = readVisionRange(u)
      const ids = visibleCellIdsInRange(cell, r, cells)
      ids.forEach((id) => revealed.add(id))
    }
  }
  return revealed
}

module.exports = {
  computeRevealedCellIdsForFaction,
  visibleCellIdsInRange,
  cellBlocksLineOfSight,
  isHexVisible,
  isCellSeenByAnyHostileUnit,
}

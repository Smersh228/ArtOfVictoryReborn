'use strict'

const { getStr, unitFaction, opposing } = require('../unit/battleUnitField')
const { readVisionRange } = require('../unit/battleUnitVision')
const { hexDistCells } = require('./battleHexGeometry')
const { dotOccupantVisionCellIds } = require('./battleDot')
const {
  effectiveElevationLevel,
  isRavine,
  isBattleAirUnitType,
  elevationLoSBonusSteps,
} = require('./battleElevation')

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

function isRavineLikeRiver(cell) {
  if (!cell) return false
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
  const flag = (v) => v === true || v === 'true' || v === 1 || v === '1'
  if (ex) {
    if (flag(ex.moveWithRiverProp) || flag(ex.moveWithWaterUnitProp)) return true
    if (flag(ex.isRiver) || flag(ex.river)) return true
    const cat = String(ex.category || '')
      .trim()
      .toLowerCase()
    if (cat === 'rivers' || cat === 'river' || cat === 'water' || cat === 'waters') return true
  }
  const rawType = String((cell && cell.type) || '').trim()
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '')
  if (t === 'river' || t === 'rivers' || t === 'water') return true
  const name = String((cell && cell.name) || (ex && (ex.name || ex.label)) || '')
  const img = String((cell && (cell.img || cell.imagePath)) || '')
  const blob = `${rawType} ${name} ${img}`
  return /река|руч(?:ей|ья|ью)?|канал|речн|водн|брод|river|water|ford/i.test(blob) && !/озер|озёр|болот|swamp|marsh|lake/i.test(blob)
}

function cellBlocksLineOfSight(cell) {
  if (isRavineLikeRiver(cell)) return false
  if (cell.mapBuilding != null) return true
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
  const vb = cell.visionBlock != null ? cell.visionBlock : ex && ex.visionBlock
  if (vb === true || vb === 'true' || vb === 1 || vb === '1') return true
  if (cell.visible === false) return true
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
  return LOS_BLOCKING.has(t)
}

function cellHasSmoke(cell) {
  if (!cell || !cell.builds) return false
  const raw = cell.builds.smoke
  if (raw && typeof raw === 'object') return true
  return Number(raw) > 0
}

function lineOpenThroughSmoke(observer, target, cells) {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target))
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i])
    if (!c) return false
    if (cellHasSmoke(c)) return false
  }
  return true
}

function ravineBlocksHexLoS(observer, target, dist, options) {
  if (options && options.airObserver) return false
  if (isRavine(observer) && !isRavineLikeRiver(observer) && dist > 1) return true
  if (isRavine(target) && !isRavineLikeRiver(target) && dist > 1) return true
  return false
}

/** Гребень выше наблюдателя закрывает клетки за собой; сам гребень виден как цель. */
function lineOpenWithElevationRidge(observer, target, cells) {
  const obsE = effectiveElevationLevel(observer)
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target))
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i])
    if (!c) return false
    if (isRavineLikeRiver(c)) continue
    if (effectiveElevationLevel(c) > obsE) return false
  }
  return true
}

/** Тень в один гекс сразу за преградой для видимости. */
function lineOpenWithOneHexShadow(observer, target, cells) {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target))
  const targetCube = cellToCube(target)
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i])
    if (!c) return false
    if (!cellBlocksLineOfSight(c)) continue
    const shadowCube = line[i + 1]
    if (
      shadowCube &&
      shadowCube.x === targetCube.x &&
      shadowCube.y === targetCube.y &&
      shadowCube.z === targetCube.z
    ) {
      return false
    }
  }
  return true
}

function isHexVisible(observer, target, cells, options) {
  if (!observer || !target) return false
  const dist = hexDistCells(observer, target)
  if (dist <= 0) return true
  if (ravineBlocksHexLoS(observer, target, dist, options)) return false
  if (!(options && options.airObserver) && !lineOpenWithElevationRidge(observer, target, cells)) return false
  if (!lineOpenThroughSmoke(observer, target, cells)) return false
  return lineOpenWithOneHexShadow(observer, target, cells)
}

function observerVisionCellIds(observer, unit, cells) {
  const fromDot = dotOccupantVisionCellIds(observer, unit, cells)
  if (fromDot) {
    const out = new Set()
    out.add(Number(observer.id))
    for (const id of fromDot) {
      const c = cells.find((x) => Number(x.id) === Number(id))
      if (!c) continue
      if (lineOpenThroughSmoke(observer, c, cells)) out.add(Number(c.id))
    }
    return out
  }
  return visibleCellIdsInRange(observer, readVisionRange(unit), cells, {
    airObserver: isBattleAirUnitType(unit),
  })
}

function visibleCellIdsInRange(observer, maxRange, cells, options) {
  const obs = cellToCube(observer)
  const out = new Set()
  out.add(observer.id)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.id === observer.id) continue
    const dist = cubeDistance(obs, cellToCube(c))
    const bonus = elevationLoSBonusSteps(observer, c)
    if (dist > maxRange + bonus) continue
    if (isHexVisible(observer, c, cells, options)) out.add(c.id)
  }
  return out
}

function isUnitVisibleFromCell(observerCell, observerUnit, targetCell, targetUnit, cells) {
  if (!observerCell || !targetCell) return false
  const dist = hexDistCells(observerCell, targetCell)
  if (dist <= 0) return true
  const airObs = observerUnit && isBattleAirUnitType(observerUnit)
  if (isRavine(observerCell) && !isRavineLikeRiver(observerCell) && dist > 1 && !airObs) return false
  if (isRavine(targetCell) && !isRavineLikeRiver(targetCell) && dist > 1 && !airObs) return false
  return isHexVisible(observerCell, targetCell, cells, { airObserver: airObs })
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
      const fromDot = dotOccupantVisionCellIds(cell, u, cells)
      if (fromDot) {
        if (fromDot.has(targetCell.id)) return true
        continue
      }
      const seen = observerVisionCellIds(cell, u, cells)
      if (seen.has(targetCell.id)) return true
      if (isUnitVisibleFromCell(cell, u, targetCell, null, cells)) return true
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
      const ids = observerVisionCellIds(cell, u, cells)
      ids.forEach((id) => revealed.add(id))
    }
  }
  return revealed
}

module.exports = {
  computeRevealedCellIdsForFaction,
  visibleCellIdsInRange,
  observerVisionCellIds,
  cellBlocksLineOfSight,
  isHexVisible,
  isUnitVisibleFromCell,
  isCellSeenByAnyHostileUnit,
}

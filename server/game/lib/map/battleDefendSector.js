'use strict'

const CUBE_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
]

function rangeArrayFromFire(fire) {
  if (!fire || typeof fire !== 'object') return []
  const raw = fire.range
  if (Array.isArray(raw) && raw.length) return raw.map((x) => Number(x) || 0)
  if (raw == null || raw === '') return []
  return String(raw)
    .split(',')
    .map((x) => Number(String(x).trim()) || 0)
}

function rangeArrayForUnitQuick(attacker) {
  const fromParsed = rangeArrayFromFire(attacker && attacker.fireParsed)
  if (fromParsed.length) return fromParsed
  const fromFire = rangeArrayFromFire(attacker && attacker.fire)
  if (fromFire.length) return fromFire
  return [3, 2, 1]
}

function stepsFromRangeArray(ra) {
  if (!Array.isArray(ra) || !ra.length) return 0
  return ra.length >= 2 ? Math.max(0, ra.length - 1) : ra.length
}

function maxShootRangeStepsForUnit(attacker) {
  const regular = stepsFromRangeArray(rangeArrayForUnitQuick(attacker))
  const reactive = stepsFromRangeArray(rangeArrayFromFire(attacker && attacker.fireReactive))
  return Math.max(regular, reactive)
}

function hexDistCells(a, b) {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  )
}

function isValidDefendFacing(unitCell, facingCellId, allCells) {
  const id = Number(facingCellId)
  const f = allCells.find((c) => Number(c.id) === id)
  if (!f) return false
  return hexDistCells(unitCell, f) === 1
}

function findDirIndexFromDelta(du) {
  for (let k = 0; k < 6; k++) {
    const d = CUBE_DIRS[k]
    if (d.x === du.x && d.y === du.y && d.z === du.z) return k
  }
  return -1
}

function findCellByCoor(allCells, coor) {
  for (let i = 0; i < allCells.length; i++) {
    const c = allCells[i]
    if (c.coor.x === coor.x && c.coor.y === coor.y && c.coor.z === coor.z) return c
  }
  return null
}

function computeDefendSectorIds(allCells, unitCell, facingCell, attacker, rangeCapSteps) {
  const weaponMax = maxShootRangeStepsForUnit(attacker)
  let cap = weaponMax
  if (rangeCapSteps != null && Number.isFinite(Number(rangeCapSteps))) {
    cap = Math.max(1, Math.min(Number(rangeCapSteps), weaponMax))
  }

  const du = {
    x: facingCell.coor.x - unitCell.coor.x,
    y: facingCell.coor.y - unitCell.coor.y,
    z: facingCell.coor.z - unitCell.coor.z,
  }
  const k0 = findDirIndexFromDelta(du)
  if (k0 < 0) return []

  const d0 = CUBE_DIRS[k0]
  const dLeft = CUBE_DIRS[(k0 + 1) % 6]
  const dRight = CUBE_DIRS[(k0 + 5) % 6]

  const seen = new Set()
  const out = []
  for (const d1 of [dLeft, dRight]) {
    for (let s = 1; s <= cap; s++) {
      for (let i = 1; i <= s; i++) {
        const j = s - i
        const coor = {
          x: unitCell.coor.x + i * d0.x + j * d1.x,
          y: unitCell.coor.y + i * d0.y + j * d1.y,
          z: unitCell.coor.z + i * d0.z + j * d1.z,
        }
        const c = findCellByCoor(allCells, coor)
        if (!c || Number(c.id) === Number(unitCell.id)) continue
        const cid = Number(c.id)
        if (seen.has(cid)) continue
        seen.add(cid)
        out.push(cid)
      }
    }
  }
  out.sort((a, b) => a - b)
  return out
}

module.exports = {
  maxShootRangeStepsForUnit,
  computeDefendSectorIds,
  isValidDefendFacing,
  hexDistCells,
}

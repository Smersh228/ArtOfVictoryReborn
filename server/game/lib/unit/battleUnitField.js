'use strict'

function getStr(u) {
  const n = Number(u.str ?? u.strength)
  return Number.isFinite(n) ? n : 1
}

function setStr(u, n) {
  const v = Math.max(0, n)
  if ('str' in u) u.str = v
  u.strength = v
}

function unitFaction(u) {
  const f = String(u.faction || '').toLowerCase()
  if (f === 'germany' || f === 'wehrmacht') return 'wehrmacht'
  if (f === 'ussr' || f === 'rkka') return 'rkka'
  return 'none'
}

function opposing(a, b) {
  if (a === 'none' || b === 'none') return false
  return a !== b
}

let fieldMutGen = 0

function noteFieldMutation() {
  fieldMutGen += 1
  try {
    const fog = require('../map/battleFogVisibility')
    if (typeof fog.invalidateFogMemo === 'function') fog.invalidateFogMemo()
  } catch {
    /* ignore */
  }
}

const unitIndexByCells = new WeakMap()

function rebuildUnitIndex(cells) {
  const map = new Map()
  if (!cells) return map
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (!u) continue
      const id = Number(u.instanceId)
      if (!Number.isFinite(id) || getStr(u) <= 0) continue
      map.set(id, { unit: u, cell })
    }
  }
  return map
}

function findUnitOnField(cells, instanceId) {
  const id = Number(instanceId)
  if (!cells) return null
  let rec = unitIndexByCells.get(cells)
  if (!rec || rec.gen !== fieldMutGen) {
    rec = { gen: fieldMutGen, map: rebuildUnitIndex(cells) }
    unitIndexByCells.set(cells, rec)
  }
  const hit = rec.map.get(id)
  if (hit && getStr(hit.unit) > 0) return hit
  return null
}

module.exports = {
  getStr,
  setStr,
  unitFaction,
  opposing,
  findUnitOnField,
  noteFieldMutation,
}

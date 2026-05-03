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

function findUnitOnField(cells, instanceId) {
  const id = Number(instanceId)
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (Number(u.instanceId) === id && getStr(u) > 0) return { unit: u, cell }
    }
  }
  return null
}

module.exports = {
  getStr,
  setStr,
  unitFaction,
  opposing,
  findUnitOnField,
}

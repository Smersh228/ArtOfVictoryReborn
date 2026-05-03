'use strict'

const { getNeighbor, findCellByCoor, hexDistCells } = require('./battleHexGeometry')
const { getStr, unitFaction, opposing, findUnitOnField } = require('../unit/battleUnitField')
const { terrainEntryCost } = require('./battleTerrain')

function getMeleeOpponentId(u) {
  const t = u.tactical
  if (!t) return null
  const id = Number(t.meleeOpponentInstanceId)
  return Number.isFinite(id) && id > 0 ? id : null
}

function cellForbidsThirdPartyMeleeEntry(allCells, cell, moverUnit) {
  const mid = Number(moverUnit.instanceId)
  if (!Number.isFinite(mid)) return false
  const us = cell.units || []
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (getStr(u) <= 0) continue
    const opp = getMeleeOpponentId(u)
    if (opp == null) continue
    if (Number(u.instanceId) === mid || opp === mid) continue
    const oth = findUnitOnField(allCells, opp)
    if (!oth || getStr(oth.unit) <= 0) continue
    if (!opposing(unitFaction(u), unitFaction(oth.unit))) continue
    if (hexDistCells(cell, oth.cell) <= 1) return true
  }
  return false
}

function canEnterCell(cell, unit, fogRevealedCellIds, allCells) {
  if (!cell) return false
  const us = cell.units || []
  let liveOnHex = 0
  for (let i = 0; i < us.length; i++) {
    if (getStr(us[i]) > 0) liveOnHex++
  }
  if (liveOnHex >= 3) return false
  for (let i = 0; i < us.length; i++) {
    if (unitFaction(us[i]) !== unitFaction(unit) && getStr(us[i]) > 0) {
      if (fogRevealedCellIds != null && !fogRevealedCellIds.has(cell.id)) continue
      return false
    }
  }
  if (allCells && cellForbidsThirdPartyMeleeEntry(allCells, cell, unit)) return false
  if (terrainEntryCost(cell, unit) === 0) return false
  return true
}

function findReachable(start, maxPoints, allCells, unit, fogRevealedCellIds) {
  const result = []
  const visited = Object.create(null)
  const queue = []
  visited[start.id] = 0
  queue.push({ cell: start, spent: 0 })
  while (queue.length > 0) {
    queue.sort((a, b) => a.spent - b.spent)
    const current = queue.shift()
    if (current.spent <= maxPoints) result.push(current.cell)
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir)
      const neighbor = findCellByCoor(allCells, nb)
      if (!neighbor || !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells)) continue
      const cost = terrainEntryCost(neighbor, unit)
      const newSpent = current.spent + cost
      if (newSpent > maxPoints) continue
      const old = visited[neighbor.id]
      if (old === undefined || newSpent < old) {
        visited[neighbor.id] = newSpent
        queue.push({ cell: neighbor, spent: newSpent })
      }
    }
  }
  return result
}

function findPath(start, target, allCells, unit, fogRevealedCellIds) {
  if (start.id === target.id) return [start]
  const visited = Object.create(null)
  const parent = Object.create(null)
  const queue = []
  visited[start.id] = 0
  queue.push({ cell: start, cost: 0 })
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift()
    if (current.cell.id === target.id) {
      const path = []
      let cur = target
      while (cur) {
        path.unshift(cur)
        cur = parent[cur.id]
      }
      return path
    }
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir)
      const neighbor = findCellByCoor(allCells, nb)
      if (!neighbor || !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells)) continue
      const cost = terrainEntryCost(neighbor, unit)
      const newCost = current.cost + cost
      const oldCost = visited[neighbor.id]
      if (oldCost === undefined || newCost < oldCost) {
        visited[neighbor.id] = newCost
        parent[neighbor.id] = current.cell
        queue.push({ cell: neighbor, cost: newCost })
      }
    }
  }
  return null
}

module.exports = {
  getMeleeOpponentId,
  canEnterCell,
  findReachable,
  findPath,
}

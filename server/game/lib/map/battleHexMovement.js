'use strict'

const { getNeighbor, findCellByCoor, hexDistCells } = require('./battleHexGeometry')
const { wireBlocksGroundMove, applyWireBreakthroughOnStep } = require('./battleWireEdges')
const { antiTankBlocksGroundMove } = require('./battleAntiTankEdges')
const { hasDotOnCell, unitInDot } = require('./battleDot')
const { unitHasPropKey } = require('../../core/battleUnitType')
const { getStr, unitFaction, opposing, findUnitOnField } = require('../unit/battleUnitField')
const { terrainEntryCost } = require('./battleTerrain')
const {
  createMoveSlopeCounters,
  slopeCountersAllow,
  ravineCountersAllow,
  applyMoveSlopeCounters,
  moveCountersKey,
  isRavineExitDirection,
  isRavine,
  canUnitTraverseSlope,
  slopeTransition,
} = require('./battleElevation')

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

function canTraverseMoveEdge(fromCell, toCell, unit, counters) {
  if (!fromCell || !toCell || !unit) return false
  if (!slopeCountersAllow(unit, counters, fromCell, toCell)) return false
  if (!ravineCountersAllow(unit, counters, fromCell, toCell)) return false
  if (isRavine(fromCell) && !isRavineExitDirection(fromCell, toCell)) {
    if (!canUnitTraverseSlope(unit, slopeTransition(fromCell, toCell))) return false
  }
  if (wireBlocksGroundMove(fromCell, toCell, unit, unitHasPropKey)) return false
  if (antiTankBlocksGroundMove(fromCell, toCell, unit)) return false
  return true
}

function moveStepCost(fromCell, toCell, unit) {
  return terrainEntryCost(toCell, unit)
}

function canEnterCell(cell, unit, fogRevealedCellIds, allCells, fromCell, counters, allowSmoke) {
  if (!cell) return false
  const us = cell.units || []
  let liveOnHex = 0
  for (let i = 0; i < us.length; i++) {
    if (getStr(us[i]) <= 0) continue
    if (unitInDot(us[i])) continue
    liveOnHex++
  }
  const cap = hasDotOnCell(cell.builds) ? 2 : 3
  if (liveOnHex >= cap) return false
  for (let i = 0; i < us.length; i++) {
    if (unitFaction(us[i]) !== unitFaction(unit) && getStr(us[i]) > 0) {
      if (fogRevealedCellIds != null && !fogRevealedCellIds.has(cell.id)) continue
      return false
    }
  }
  if (allCells && cellForbidsThirdPartyMeleeEntry(allCells, cell, unit)) return false
  const smoke = require('./battleSmoke')
  if (!allowSmoke && smoke.hasSmokeOnCell(cell.builds)) return false
  const railway = require('./battleRailway')
  if (railway.isRailwayUnit(unit)) {
    if (!railway.isRailwayCell(cell)) return false
    if (fromCell && !railway.isRailwayCell(fromCell)) return false
  }
  if (fromCell && counters) {
    if (!canTraverseMoveEdge(fromCell, cell, unit, counters)) return false
  }
  if (terrainEntryCost(cell, unit) === 0) return false
  return true
}

function findReachable(start, maxPoints, allCells, unit, fogRevealedCellIds) {
  const result = []
  const visited = Object.create(null)
  const queue = []
  const startCounters = createMoveSlopeCounters()
  const startKey = `${start.id}:${moveCountersKey(startCounters)}`
  visited[startKey] = 0
  queue.push({ cell: start, spent: 0, counters: startCounters })
  while (queue.length > 0) {
    queue.sort((a, b) => a.spent - b.spent)
    const current = queue.shift()
    if (current.spent <= maxPoints) result.push(current.cell)
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir)
      const neighbor = findCellByCoor(allCells, nb)
      if (
        !neighbor ||
        !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells, current.cell, current.counters)
      ) {
        continue
      }
      const cost = moveStepCost(current.cell, neighbor, unit)
      const newSpent = current.spent + cost
      if (newSpent > maxPoints) continue
      const newCounters = applyMoveSlopeCounters(current.counters, current.cell, neighbor)
      const vKey = `${neighbor.id}:${moveCountersKey(newCounters)}`
      const old = visited[vKey]
      if (old === undefined || newSpent < old) {
        visited[vKey] = newSpent
        queue.push({ cell: neighbor, spent: newSpent, counters: newCounters })
      }
    }
  }
  return result
}

function findPath(start, target, allCells, unit, fogRevealedCellIds, allowSmoke) {
  if (start.id === target.id) return [start]
  const visited = Object.create(null)
  const prev = Object.create(null)
  const queue = []
  const startCounters = createMoveSlopeCounters()
  const startKey = `${start.id}:${moveCountersKey(startCounters)}`
  visited[startKey] = 0
  queue.push({ cell: start, cost: 0, counters: startCounters, key: startKey })
  let goalKey = null
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift()
    if (current.cell.id === target.id) {
      goalKey = current.key
      break
    }
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir)
      const neighbor = findCellByCoor(allCells, nb)
      if (
        !neighbor ||
        !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells, current.cell, current.counters, allowSmoke)
      ) {
        continue
      }
      const cost = moveStepCost(current.cell, neighbor, unit)
      const newCost = current.cost + cost
      const newCounters = applyMoveSlopeCounters(current.counters, current.cell, neighbor)
      const vKey = `${neighbor.id}:${moveCountersKey(newCounters)}`
      const oldCost = visited[vKey]
      if (oldCost === undefined || newCost < oldCost) {
        visited[vKey] = newCost
        prev[vKey] = current.key
        queue.push({ cell: neighbor, cost: newCost, counters: newCounters, key: vKey })
      }
    }
  }
  if (!goalKey) return null
  const idChain = []
  let k = goalKey
  while (k) {
    idChain.unshift(Number(String(k).split(':')[0]))
    k = prev[k]
  }
  const path = []
  for (let i = 0; i < idChain.length; i++) {
    const c = allCells.find((x) => Number(x.id) === idChain[i])
    if (c) path.push(c)
  }
  return path.length ? path : null
}

module.exports = {
  getMeleeOpponentId,
  canEnterCell,
  canTraverseMoveEdge,
  findReachable,
  findPath,
}
















































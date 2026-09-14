'use strict'

const {
  unitFaction,
  factionsOpposed,
  getStr,
  getMovePoint,
  computeRevealedCellIdsForFaction,
} = require('../../battleEngine')
const { canEnterCell } = require('../map/battleHexMovement')
const { getAmmo } = require('../unit/battleUnitResources')
const {
  unitUsesGunDeploy,
  isArtilleryDeployedForBattle,
  unitHasPropKey,
  unitHasOrderKey,
  isArtilleryFireTargetCellAllowed,
  isTruckUnit,
  isArtilleryUnit,
} = require('../../core/battleUnitType')
const { maxShootRangeStepsForUnit } = require('../map/battleDefendSector')
const { hexDistCells, getNeighbor, findCellByCoor, hexFlightPathCellIds } = require('../map/battleHexGeometry')
const { isHexVisible } = require('../map/battleFogVisibility')
const { hasStorage } = require('../map/battleStorage')
const supply = require('../unit/battleSupplyTransfer')
const { createMoveSlopeCounters } = require('../map/battleElevation')
const { terrainEntryCost } = require('../map/battleTerrain')
const {
  normalizeStruggleFaction,
  parseMaxTurns,
} = require('../scenario/battleMissionVictory')

const LONG_RANGE_STEPS = 3
const GUN_RELOCATE_MAX = 6
const GUN_LONG_STAY_MIN = 11
const FIRE_TARGET_CAP = 3
const AIR_STRIKE_CANDIDATE_CAP = 6
const AIR_INTERCEPT_CANDIDATE_CAP = 4
const AIR_VALIDATE_TRIES = 2

function isBotMember(m) {
  if (!m) return false
  if (m.isBot) return true
  return String(m.key || '').startsWith('bot:')
}

function botKey(team) {
  return `bot:${Number(team)}`
}

function factionForTeam(team) {
  return Number(team) % 2 === 1 ? 'rkka' : 'wehrmacht'
}

function lobbyCap(room) {
  const n = Number(room && room.maxPlayers)
  return n === 4 || n === 6 ? n : 2
}

function parseMapBots(payload, teamLimit) {
  const cap = teamLimit === 4 || teamLimit === 6 ? teamLimit : 2
  const rawIn = payload && typeof payload === 'object' ? payload.bots : null
  const o =
    typeof rawIn === 'string'
      ? (() => {
          try {
            return JSON.parse(rawIn)
          } catch {
            return {}
          }
        })()
      : rawIn && typeof rawIn === 'object'
        ? rawIn
        : {}
  const difficulty = o.difficulty === 'easy' || o.difficulty === 'hard' ? o.difficulty : 'normal'
  const slots = []
  const rawSlots = Array.isArray(o.slots) ? o.slots : []
  const byTeam = new Map()
  for (const item of rawSlots) {
    if (!item || typeof item !== 'object') continue
    const team = Math.trunc(Number(item.team))
    if (!Number.isFinite(team) || team < 1 || team > cap) continue
    byTeam.set(team, item.kind === 'bot' ? 'bot' : 'player')
  }
  for (let team = 1; team <= cap; team++) {
    slots.push({ team, kind: byTeam.get(team) === 'bot' ? 'bot' : 'player' })
  }
  return {
    enabled: o.enabled === true,
    difficulty,
    slots,
  }
}

function isSoloPlayerBotMap(payload, teamLimit) {
  const cap = teamLimit === 4 || teamLimit === 6 ? teamLimit : 2
  if (cap !== 2) return false
  const parsed = parseMapBots(payload, 2)
  if (!parsed.enabled) return false
  const bots = parsed.slots.filter((s) => s.kind === 'bot').length
  const players = parsed.slots.filter((s) => s.kind === 'player').length
  return bots === 1 && players === 1
}

function occupiedTeams(room, exceptKey) {
  const taken = new Set()
  for (const m of room.members || []) {
    if (exceptKey && m.key === exceptKey) continue
    const t = Number(m.team)
    if (Number.isFinite(t) && t > 0) taken.add(t)
  }
  return taken
}

function ensureRoomBots(room, payload) {
  if (!room) return
  const cap = lobbyCap(room)
  const parsed = parseMapBots(payload, cap)
  room.botDifficulty = parsed.enabled ? parsed.difficulty : 'normal'
  if (!parsed.enabled) return

  const taken = occupiedTeams(room)
  for (const slot of parsed.slots) {
    if (slot.kind !== 'bot') continue
    const key = botKey(slot.team)
    if ((room.members || []).some((m) => m.key === key)) continue
    if (taken.has(slot.team)) continue
    if ((room.members || []).length >= cap) break
    const mem = {
      key,
      isBot: true,
      faction: factionForTeam(slot.team),
      team: slot.team,
      ready: true,
    }
    room.members.push(mem)
    taken.add(slot.team)
  }

  const host = (room.members || []).find((m) => m.key === room.hostKey)
  if (host && !isBotMember(host) && (host.faction === 'none' || !Number(host.team))) {
    const playerSlot = parsed.slots.find((s) => s.kind === 'player' && !taken.has(s.team))
    const anySlot = parsed.slots.find((s) => !taken.has(s.team))
    const pick = playerSlot || anySlot
    if (pick) {
      host.faction = factionForTeam(pick.team)
      host.team = pick.team
      host.ready = true
      taken.add(pick.team)
    }
  }
}

function memberOwnsUnit(mem, unit) {
  if (!mem || !unit) return false
  if (mem.faction === 'none') return true
  const unitTeam = Number(unit.team)
  const memTeam = Number(mem.team)
  if (Number.isFinite(unitTeam) && unitTeam > 0 && Number.isFinite(memTeam) && memTeam > 0) {
    return unitTeam === memTeam
  }
  const f = String(unit.faction || '').toLowerCase()
  if (mem.faction === 'rkka') return f === 'ussr' || f === 'rkka'
  if (mem.faction === 'wehrmacht') return f === 'germany' || f === 'wehrmacht'
  return false
}

function listFieldUnits(cells) {
  const out = []
  for (const cell of cells || []) {
    for (const unit of cell.units || []) {
      if (!unit || unit.instanceId == null) continue
      out.push({ cell, unit })
    }
  }
  return out
}

function ownedPacks(cells, mem) {
  return listFieldUnits(cells).filter((p) => memberOwnsUnit(mem, p.unit))
}

function enemyPacks(cells, mem) {
  const mineFac = mem.faction
  const out = []
  for (const p of listFieldUnits(cells)) {
    if (getStr(p.unit) <= 0) continue
    const fac = unitFaction(p.unit)
    if (!factionsOpposed(mineFac, fac)) continue
    out.push(p)
  }
  return out
}

function parseNumList(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n))
  return String(raw)
    .split(/[,;\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
}

function captureCellIds(room) {
  const cap = room && room.battleMapConditions && room.battleMapConditions.axisCapture
  if (!cap || cap.enabled !== true) return []
  return [...new Set(parseNumList(cap.hexes))]
}

function countFactionOnHexes(cells, faction, hexIds) {
  let total = 0
  for (const cell of cells || []) {
    if (!hexIds.has(Number(cell.id))) continue
    for (const u of cell.units || []) {
      if (getStr(u) > 0 && unitFaction(u) === faction) total += 1
      const carried = u.tactical && u.tactical.carriedUnits
      if (!Array.isArray(carried)) continue
      for (const c of carried) {
        if (getStr(c) > 0 && unitFaction(c) === faction) total += 1
      }
    }
  }
  return total
}

function findPacksByIds(cells, ids) {
  const want = new Set(ids)
  const out = []
  for (const cell of cells || []) {
    for (const unit of cell.units || []) {
      if (want.has(Number(unit.instanceId)) && getStr(unit) > 0) out.push({ cell, unit })
      const carried = unit.tactical && unit.tactical.carriedUnits
      if (!Array.isArray(carried)) continue
      for (const c of carried) {
        if (want.has(Number(c.instanceId)) && getStr(c) > 0) out.push({ cell, unit: c })
      }
    }
  }
  return out
}

function fogHasCell(fog, cell) {
  if (!fog || !cell) return false
  if (fog.has(cell.id)) return true
  return fog.has(Number(cell.id))
}

function tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, candidate) {
  if (!candidate) return false
  const iid = Number(candidate.unitInstanceId)
  if (Number.isFinite(iid)) {
    for (let i = 0; i < orders.length; i++) {
      if (Number(orders[i] && orders[i].unitInstanceId) === iid) return false
    }
  }
  const err = validateSubmittedOrders(room, mem, [candidate], cells)
  if (err) return false
  orders.push(candidate)
  return true
}

function makeLosMemo(cells) {
  const cache = new Map()
  return (fromCell, toCell) => {
    if (!fromCell || !toCell) return false
    const key = `${Number(fromCell.id)}>${Number(toCell.id)}`
    if (cache.has(key)) return cache.get(key)
    const ok = !!isHexVisible(fromCell, toCell, cells)
    cache.set(key, ok)
    return ok
  }
}

function shooterSeesOrClosed(shooter, fromCell, targetCell, losFn) {
  if (!shooter || !fromCell || !targetCell) return false
  if (unitHasPropKey(shooter, 'concealedTargetFire')) return true
  return typeof losFn === 'function' ? losFn(fromCell, targetCell) : false
}

/** ПВО стоит. Артиллерия 1–6 без ПВО катит к врагу. Остальные орудия на месте. */
function gunRangeBand(unit) {
  if (!unitUsesGunDeploy(unit)) return 'none'
  if (unitIsAaGun(unit)) return 'aa'
  const r = maxShootRangeStepsForUnit(unit)
  if (!Number.isFinite(r) || r < 1) return 'none'
  if (isArtilleryUnit(unit) && r <= GUN_RELOCATE_MAX) return 'relocate'
  if (r >= GUN_LONG_STAY_MIN) return 'long'
  return 'static'
}

function unitHasAirFireRow(unit) {
  const fp = (unit && (unit.fireParsed || unit._fireRaw || unit.fire)) || null
  if (!fp || typeof fp !== 'object') return false
  const keys = ['sa', 'ba']
  for (let i = 0; i < keys.length; i++) {
    const arr = fp[keys[i]]
    if (Array.isArray(arr)) {
      for (let j = 0; j < arr.length; j++) {
        if (Number(arr[j]) > 0) return true
      }
    }
  }
  return false
}

function unitIsAaGun(unit) {
  if (!unit) return false
  if (unitHasPropKey(unit, 'fireAirGun')) return true
  if (!unitUsesGunDeploy(unit)) return false
  return unitHasAirFireRow(unit)
}

function isHqHoldUnit(unit) {
  return unitHasPropKey(unit, 'hqZoneOfAction2') || unitHasPropKey(unit, 'hqZoneOfAction3')
}

function collectEnemyAaSectorSets(cells, mem) {
  const airAa = require('../fire/battleArtilleryAirSector')
  const dummyL = { type: 'lightAir' }
  const dummyH = { type: 'heavyAir' }
  const sets = []
  for (let ci = 0; ci < (cells || []).length; ci++) {
    const cell = cells[ci]
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (memberOwnsUnit(mem, u)) continue
      if (!factionsOpposed(mem.faction, unitFaction(u))) continue
      if (!airAa.artilleryCanSectorFireAtAirUnit(u, dummyL) && !airAa.artilleryCanSectorFireAtAirUnit(u, dummyH)) {
        continue
      }
      const ids = u.defendSectorCellIds
      if (!Array.isArray(ids) || !ids.length) continue
      const set = new Set()
      for (let k = 0; k < ids.length; k++) set.add(Number(ids[k]))
      sets.push(set)
    }
  }
  return sets
}

function pathAaScore(pathIds, aaSets) {
  if (!pathIds || !pathIds.length || !aaSets || !aaSets.length) return 0
  let n = 0
  for (let i = 0; i < pathIds.length; i++) {
    const id = Number(pathIds[i])
    for (let s = 0; s < aaSets.length; s++) {
      if (aaSets[s].has(id)) {
        n += 1
        break
      }
    }
  }
  return n
}

function cellById(cells, id) {
  const want = Number(id)
  if (!Number.isFinite(want)) return null
  for (let i = 0; i < (cells || []).length; i++) {
    if (Number(cells[i].id) === want) return cells[i]
  }
  return null
}

function enemyAirInfo(allEnemies, cells, fogIds) {
  const airSortie = require('../air/battleAirSortie')
  const airborne = []
  const aimCells = []
  const seen = new Set()
  for (let i = 0; i < (allEnemies || []).length; i++) {
    const p = allEnemies[i]
    if (!isAirUnit(p.unit)) continue
    const airborneNow = airSortie.isAirUnitAirborneForInterception(p.unit)
    const posId = airborneNow
      ? airSortie.readAirFlightPositionCellId(p.unit, Number(p.cell.id))
      : Number(p.cell.id)
    const posCell = cellById(cells, posId) || p.cell
    if (fogIds && !fogHasCell(fogIds, posCell)) continue
    if (airborneNow) airborne.push(p)
    const cid = Number(posCell.id)
    if (!seen.has(cid)) {
      seen.add(cid)
      aimCells.push(posCell)
    }
  }
  return { airborne, aimCells }
}

function gunAimCells(pack, intent, visibleEnemies, airInfo) {
  const ground = artilleryDeployAimCells(intent, visibleEnemies)
  if (!unitIsAaGun(pack.unit) || !airInfo || !airInfo.aimCells.length) return ground
  return uniqueCells(airInfo.aimCells.concat(ground))
}

function botCanTryFire(shooter, fromCell, targetPack, losFn) {
  if (!shooter || !targetPack || !targetPack.cell) return false
  if (!(getAmmo(shooter) >= 1)) return false
  const maxR = maxShootRangeStepsForUnit(shooter)
  const dist = hexDistCells(fromCell, targetPack.cell)
  if (Number.isFinite(maxR) && maxR >= 0 && dist > maxR + 2) return false
  if (!shooterSeesOrClosed(shooter, fromCell, targetPack.cell, losFn)) return false
  return true
}

function isLongRangeGun(unit) {
  if (!unitUsesGunDeploy(unit)) return false
  return maxShootRangeStepsForUnit(unit) >= LONG_RANGE_STEPS
}

function sortFireTargets(targets, fromCell, difficulty, preferWeak, priorityIds) {
  const scored = targets.map((p) => ({
    p,
    dist: hexDistCells(fromCell, p.cell),
    str: getStr(p.unit),
    pri: priorityIds && priorityIds.has(Number(p.unit.instanceId)) ? 0 : 1,
  }))
  if (preferWeak) {
    scored.sort((a, b) => {
      if (a.pri !== b.pri) return a.pri - b.pri
      if (a.str !== b.str) return a.str - b.str
      return a.dist - b.dist
    })
    return scored
  }
  if (difficulty === 'easy') {
    for (let i = scored.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = scored[i]
      scored[i] = scored[j]
      scored[j] = t
    }
    scored.sort((a, b) => a.pri - b.pri)
    return scored
  }
  scored.sort((a, b) => {
    if (a.pri !== b.pri) return a.pri - b.pri
    if (difficulty === 'hard' && a.str !== b.str) return a.str - b.str
    return a.dist - b.dist
  })
  return scored
}

function neighborCells(cells, fromCell) {
  if (!fromCell || !fromCell.coor) return []
  const out = []
  for (let d = 0; d < 6; d++) {
    const cell = findCellByCoor(cells, getNeighbor(fromCell.coor, d))
    if (cell) out.push(cell)
  }
  return out
}

function pickDeployFacing(cells, fromCell, aimCells) {
  const neighbors = neighborCells(cells, fromCell)
  if (!neighbors.length) return null
  if (!aimCells.length) return neighbors[0]
  let best = neighbors[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const n of neighbors) {
    const score = minDistToFocus(n, aimCells)
    if (score < bestScore) {
      bestScore = score
      best = n
    }
  }
  return best
}

function tryGunDeployOrder(room, mem, cells, validateSubmittedOrders, orders, pack, aimCells) {
  const iid = Number(pack.unit.instanceId)
  const rcap = maxShootRangeStepsForUnit(pack.unit)
  if (!Number.isFinite(rcap) || rcap < 1) return false
  const facing = pickDeployFacing(cells, pack.cell, aimCells || [])
  if (!facing) return false
  const key = isArtilleryDeployedForBattle(pack.unit) ? 'changeSector' : 'deploy'
  return tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
    unitInstanceId: iid,
    orderKey: key,
    defendFacingCellId: Number(facing.id),
    defendMaxRangeSteps: rcap,
  })
}

function uniqueCells(list) {
  const out = []
  const seen = new Set()
  for (const cell of list || []) {
    const id = Number(cell && cell.id)
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    out.push(cell)
  }
  return out
}

function artilleryAimCells(intent, visibleEnemies) {
  const visPri = visibleEnemies.filter((e) => intent.huntIds.has(Number(e.unit.instanceId)))
  const vis = visPri.length ? visPri : visibleEnemies
  if (vis.length) return uniqueCells(vis.map((e) => e.cell))
  return []
}

function artilleryDeployAimCells(intent, visibleEnemies) {
  const vis = artilleryAimCells(intent, visibleEnemies)
  if (vis.length) return vis
  if (intent.capCells && intent.capCells.length) return uniqueCells(intent.capCells)
  return []
}

function anyCellInGunSector(unit, aimCells) {
  if (!aimCells.length) return false
  return aimCells.some((c) => isArtilleryFireTargetCellAllowed(unit, c.id))
}

function tryBotFireAtPack(room, mem, cells, validateSubmittedOrders, orders, iid, shooter, targetPack, fromCell, losFn) {
  if (!botCanTryFire(shooter, fromCell || (targetPack && targetPack.cell), targetPack, losFn)) return false
  const cellId = Number(targetPack.cell.id)
  const tid = Number(targetPack.unit.instanceId)
  const candidates = []
  if (unitHasPropKey(shooter, 'areaFire')) {
    candidates.push({ unitInstanceId: iid, orderKey: 'fire', targetCellId: cellId })
  }
  candidates.push({
    unitInstanceId: iid,
    orderKey: 'fire',
    targetUnitInstanceId: tid,
    targetCellId: cellId,
  })
  for (const c of candidates) {
    if (tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, c)) return true
  }
  return false
}

function tryBotAreaFireOnCells(room, mem, cells, validateSubmittedOrders, orders, iid, shooter, fromCell, aimCells, fogIds, losFn) {
  if (!unitHasPropKey(shooter, 'areaFire') || !aimCells.length) return false
  const spotted = (aimCells || []).filter((cell) => {
    if (!fogHasCell(fogIds, cell)) return false
    return shooterSeesOrClosed(shooter, fromCell, cell, losFn)
  })
  if (!spotted.length) return false
  const sorted = spotted.slice().sort((a, b) => hexDistCells(fromCell, a) - hexDistCells(fromCell, b)).slice(0, 3)
  for (const cell of sorted) {
    if (
      tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
        unitInstanceId: iid,
        orderKey: 'fire',
        targetCellId: Number(cell.id),
      })
    ) {
      return true
    }
  }
  return false
}

function isAirUnit(unit) {
  const t = String(unit && unit.type ? unit.type : '')
  return t === 'lightAir' || t === 'heavyAir'
}

function tryMoveToward(room, mem, cells, validateSubmittedOrders, orders, pack, focusCells, claimedIds, fogIds) {
  const moveTo = pickMoveCell(cells, mem, pack, focusCells, claimedIds, fogIds)
  if (moveTo == null) return false
  const ok = tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
    unitInstanceId: Number(pack.unit.instanceId),
    orderKey: 'move',
    targetCellId: moveTo,
  })
  if (ok && claimedIds) claimedIds.add(Number(moveTo))
  return ok
}

function tryBotGunTurn(ctx) {
  const {
    room,
    mem,
    cells,
    validateSubmittedOrders,
    orders,
    pack,
    intent,
    visibleEnemies,
    claimedIds,
    fogIds,
    losFn,
    difficulty,
    airInfo,
  } = ctx
  const band = gunRangeBand(pack.unit)
  if (band === 'none') return false
  const iid = Number(pack.unit.instanceId)
  const deployed = isArtilleryDeployedForBattle(pack.unit)
  const maxR = maxShootRangeStepsForUnit(pack.unit)
  const deployAim = gunAimCells(pack, intent, visibleEnemies, airInfo)
  const gunFireAim = artilleryAimCells(intent, visibleEnemies)
  const rush = shouldRushMove(pack, intent)

  const inRange = []
  for (let ei = 0; ei < visibleEnemies.length; ei++) {
    const e = visibleEnemies[ei]
    if (isAirUnit(e.unit)) continue
    const dist = hexDistCells(pack.cell, e.cell)
    if (Number.isFinite(maxR) && maxR >= 0 && dist > maxR + 2) continue
    if (!shooterSeesOrClosed(pack.unit, pack.cell, e.cell, losFn)) continue
    inRange.push(e)
  }
  const fireTargets = sortFireTargets(
    inRange,
    pack.cell,
    difficulty,
    isLongRangeGun(pack.unit) || band === 'long',
    intent.huntIds,
  ).slice(0, FIRE_TARGET_CAP)

  if (!deployed && fireTargets.length) {
    return tryGunDeployOrder(room, mem, cells, validateSubmittedOrders, orders, pack, deployAim)
  }

  let placed = false
  for (let i = 0; i < fireTargets.length; i++) {
    const row = fireTargets[i]
    const tid = Number(row.p.unit.instanceId)
    const isPri = intent.huntIds.has(tid)
    if (rush && !isPri) continue
    if (tryBotFireAtPack(room, mem, cells, validateSubmittedOrders, orders, iid, pack.unit, row.p, pack.cell, losFn)) {
      placed = true
      break
    }
  }
  if (!placed) {
    placed = tryBotAreaFireOnCells(
      room,
      mem,
      cells,
      validateSubmittedOrders,
      orders,
      iid,
      pack.unit,
      pack.cell,
      gunFireAim,
      fogIds,
      losFn,
    )
  }
  if (placed) return true

  const sectorAim =
    band === 'aa' && airInfo && airInfo.aimCells.length ? airInfo.aimCells : gunFireAim
  if (deployed && sectorAim.length && !anyCellInGunSector(pack.unit, sectorAim)) {
    if (tryGunDeployOrder(room, mem, cells, validateSubmittedOrders, orders, pack, sectorAim)) return true
  }

  const focus = gunFireAim.length ? gunFireAim : deployAim
  const distFocus = minDistToFocus(pack.cell, focus)

  if (band === 'relocate' && focus.length) {
    const outOfRange = Number.isFinite(maxR) && distFocus > maxR
    const noLos =
      !outOfRange &&
      !unitHasPropKey(pack.unit, 'concealedTargetFire') &&
      !fireTargets.length
    if (outOfRange || noLos) {
      if (deployed) {
        return tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
          unitInstanceId: iid,
          orderKey: 'clotting',
        })
      }
      return tryMoveToward(room, mem, cells, validateSubmittedOrders, orders, pack, focus, claimedIds, fogIds)
    }
    if (!deployed) {
      return tryGunDeployOrder(room, mem, cells, validateSubmittedOrders, orders, pack, deployAim)
    }
  }

  if (!deployed) {
    return tryGunDeployOrder(room, mem, cells, validateSubmittedOrders, orders, pack, deployAim)
  }
  return false
}

function splitCsvLen(raw) {
  if (raw == null || raw === '') return 0
  if (Array.isArray(raw)) return raw.length
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length
}

function bombardmentMaxHexes(unit) {
  const reactive = unit && unit.fireReactive
  const n = splitCsvLen(reactive && reactive.range)
  if (n > 0) return n
  const fp = unit && unit.fireParsed
  if (fp && Array.isArray(fp.range) && fp.range.length) return fp.range.length
  const fire = unit && unit.fire
  const n2 = splitCsvLen(fire && fire.range)
  return n2 > 0 ? n2 : 1
}

function bombardmentLineCells(cells, start, dirCell, maxHexes) {
  const out = [start]
  if (!dirCell || Number(dirCell.id) === Number(start.id) || hexDistCells(start, dirCell) !== 1) return out
  out.push(dirCell)
  let prev = start
  let cur = dirCell
  const cap = Math.max(1, maxHexes)
  while (out.length < cap) {
    const nxt = findCellByCoor(cells, {
      x: cur.coor.x + (cur.coor.x - prev.coor.x),
      y: cur.coor.y + (cur.coor.y - prev.coor.y),
      z: cur.coor.z + (cur.coor.z - prev.coor.z),
    })
    if (!nxt) break
    out.push(nxt)
    prev = cur
    cur = nxt
  }
  return out
}

function pickBombardmentDirection(cells, targetCell, spottedCells, approachId, maxHexes) {
  const nbs = neighborCells(cells, targetCell)
  let best = null
  let bestHits = -1
  const spotSet = new Set()
  for (let i = 0; i < (spottedCells || []).length; i++) spotSet.add(Number(spottedCells[i].id))
  for (let i = 0; i < nbs.length; i++) {
    const n = nbs[i]
    if (approachId != null && Number(n.id) === Number(approachId)) continue
    const line = bombardmentLineCells(cells, targetCell, n, maxHexes)
    let hits = 0
    for (let j = 0; j < line.length; j++) {
      if (spotSet.has(Number(line[j].id))) hits += 1
    }
    if (hits > bestHits) {
      bestHits = hits
      best = n
    }
  }
  return best
}

function scoreAirPath(cells, fromCell, toCell, aaSets) {
  const path = hexFlightPathCellIds(cells, fromCell, toCell)
  if (!path || !path.length) return { path: null, aa: 99 }
  return { path, aa: pathAaScore(path, aaSets) }
}

function groundStrikePacks(visibleEnemies, huntIds) {
  const airSortie = require('../air/battleAirSortie')
  const out = []
  for (let i = 0; i < (visibleEnemies || []).length; i++) {
    const p = visibleEnemies[i]
    if (isAirUnit(p.unit) && airSortie.isAirUnitAirborneForInterception(p.unit)) continue
    out.push(p)
  }
  out.sort((a, b) => {
    const pa = huntIds && huntIds.has(Number(a.unit.instanceId)) ? 0 : 1
    const pb = huntIds && huntIds.has(Number(b.unit.instanceId)) ? 0 : 1
    if (pa !== pb) return pa - pb
    return 0
  })
  return out
}

function tryBotAirTurn(ctx) {
  const { room, mem, cells, validateSubmittedOrders, orders, pack, visibleEnemies, intent, aaSets, airInfo } = ctx
  const airSortie = require('../air/battleAirSortie')
  const airCombat = require('../air/battleAirCombat')
  if (airSortie.getAirOrderBlockReason(pack.unit)) return false
  const iid = Number(pack.unit.instanceId)
  const canInt = unitHasOrderKey(pack.unit, 'interception')
  const canBomb = unitHasOrderKey(pack.unit, 'bombardment')
  const canStrafe = unitHasOrderKey(pack.unit, 'attackAir')
  if (!canInt && !canBomb && !canStrafe) return false

  if (canInt && airInfo.airborne.length) {
    if (airSortie.airLaunchWeatherBlockReason('interception')) return false
    const ranked = airInfo.airborne.slice()
    ranked.sort((a, b) => hexDistCells(pack.cell, a.cell) - hexDistCells(pack.cell, b.cell))
    const tries = ranked.slice(0, AIR_INTERCEPT_CANDIDATE_CAP)
    const scored = []
    for (let i = 0; i < tries.length; i++) {
      const tgt = tries[i]
      const meeting = airCombat.computeInterceptionMeetingCell(cells, pack.cell, tgt.unit, hexFlightPathCellIds)
      if (!meeting || meeting.meetingCellId == null) continue
      scored.push({
        tgt,
        meeting,
        aa: pathAaScore(meeting.interceptorPath, aaSets),
        dist: hexDistCells(pack.cell, tgt.cell),
      })
    }
    scored.sort((a, b) => (a.aa !== b.aa ? a.aa - b.aa : a.dist - b.dist))
    for (let i = 0; i < Math.min(AIR_VALIDATE_TRIES, scored.length); i++) {
      const row = scored[i]
      if (
        tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
          unitInstanceId: iid,
          orderKey: 'interception',
          targetUnitInstanceId: Number(row.tgt.unit.instanceId),
          targetCellId: Number(row.meeting.meetingCellId),
        })
      ) {
        return true
      }
    }
  }

  if (!canBomb && !canStrafe) return false
  if (airSortie.airLaunchWeatherBlockReason(canBomb ? 'bombardment' : 'attackAir')) return false

  const spots = groundStrikePacks(visibleEnemies, intent.huntIds)
  spots.sort((a, b) => hexDistCells(pack.cell, a.cell) - hexDistCells(pack.cell, b.cell))
  const scored = []
  const cap = Math.min(AIR_STRIKE_CANDIDATE_CAP, spots.length)
  for (let i = 0; i < cap; i++) {
    const p = spots[i]
    const d = hexDistCells(pack.cell, p.cell)
    if (d < 1) continue
    const flight = scoreAirPath(cells, pack.cell, p.cell, aaSets)
    if (!flight.path) continue
    scored.push({ p, d, aa: flight.aa, path: flight.path })
  }
  if (intent.capCells) {
    let capAdded = 0
    for (let i = 0; i < intent.capCells.length && capAdded < 2; i++) {
      const cell = intent.capCells[i]
      if (!fogHasCell(ctx.fogIds, cell)) continue
      const d = hexDistCells(pack.cell, cell)
      if (d < 1) continue
      const flight = scoreAirPath(cells, pack.cell, cell, aaSets)
      if (!flight.path) continue
      scored.push({ cell, d, aa: flight.aa, path: flight.path, cap: true })
      capAdded += 1
    }
  }
  scored.sort((a, b) => (a.aa !== b.aa ? a.aa - b.aa : a.d - b.d))

  const spottedCells = spots.map((p) => p.cell)
  for (let i = 0; i < Math.min(AIR_VALIDATE_TRIES + 1, scored.length); i++) {
    const row = scored[i]
    const targetCell = row.p ? row.p.cell : row.cell
    const targetCellId = Number(targetCell.id)
    if (canBomb) {
      const maxH = bombardmentMaxHexes(pack.unit)
      const approachId = row.path && row.path.length >= 2 ? Number(row.path[row.path.length - 2]) : null
      const dir = pickBombardmentDirection(cells, targetCell, spottedCells, approachId, maxH)
      const areaCells = bombardmentLineCells(cells, targetCell, dir, maxH)
      const payload = {
        unitInstanceId: iid,
        orderKey: 'bombardment',
        targetCellId,
        bombardmentAreaCellIds: areaCells.map((c) => Number(c.id)),
      }
      if (dir) payload.bombardmentDirectionCellId = Number(dir.id)
      if (tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, payload)) return true
    }
    if (canStrafe) {
      if (
        tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
          unitInstanceId: iid,
          orderKey: 'attackAir',
          targetCellId,
        })
      ) {
        return true
      }
    }
  }
  return false
}

function uniqueReachableCells(cells, pack, fogIds) {
  if (isArtilleryDeployedForBattle(pack.unit)) return []
  const fullBudget = getMovePoint(pack.unit)
  if (!Number.isFinite(fullBudget) || fullBudget <= 0) return []
  const budget = Math.min(fullBudget, 2)
  const fog = fogIds || null
  const counters = createMoveSlopeCounters()
  const out = []
  const seen = new Set()
  const neighbors = neighborCells(cells, pack.cell)
  for (let i = 0; i < neighbors.length; i++) {
    const nxt = neighbors[i]
    const id = Number(nxt && nxt.id)
    if (!Number.isFinite(id) || id === Number(pack.cell.id) || seen.has(id)) continue
    if (!canEnterCell(nxt, pack.unit, fog, cells, pack.cell, counters, false)) continue
    const cost = terrainEntryCost(nxt, pack.unit)
    if (!(cost > 0) || cost > budget) continue
    seen.add(id)
    out.push(nxt)
  }
  return out
}

function friendlyLiveOnCell(cell, mem) {
  let n = 0
  for (const u of cell.units || []) {
    if (getStr(u) <= 0) continue
    if (memberOwnsUnit(mem, u)) n += 1
  }
  return n
}

function pickMoveCell(cells, mem, pack, focusCells, claimedIds, fogIds) {
  const stay = minDistToFocus(pack.cell, focusCells)
  if (!Number.isFinite(stay) || stay <= 0) return null
  const reach = uniqueReachableCells(cells, pack, fogIds)
  if (!reach.length) return null
  const neighbors = reach.filter((c) => hexDistCells(pack.cell, c) === 1)
  const pool = neighbors.length ? neighbors : reach
  let bestId = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const cell of pool) {
    const id = Number(cell.id)
    if (claimedIds && claimedIds.has(id)) continue
    const closer = minDistToFocus(cell, focusCells)
    if (!(closer < stay)) continue
    const crowd = friendlyLiveOnCell(cell, mem)
    if (crowd >= 2) continue
    const score = closer + crowd * 0.6
    if (score < bestScore) {
      bestScore = score
      bestId = id
    }
  }
  return bestId
}

function pickFleeCell(cells, mem, pack, threatCells, claimedIds, fogIds) {
  if (!threatCells.length) return null
  const stay = minDistToFocus(pack.cell, threatCells)
  const reach = uniqueReachableCells(cells, pack, fogIds)
  if (!reach.length) return null
  const neighbors = reach.filter((c) => hexDistCells(pack.cell, c) === 1)
  const pool = neighbors.length ? neighbors : reach
  let bestId = null
  let bestScore = stay
  for (const cell of pool) {
    const id = Number(cell.id)
    if (claimedIds && claimedIds.has(id)) continue
    if (friendlyLiveOnCell(cell, mem) >= 2) continue
    const score = minDistToFocus(cell, threatCells)
    if (score > bestScore) {
      bestScore = score
      bestId = id
    }
  }
  return bestId
}

function minDistToFocus(cell, focusCells) {
  if (!focusCells.length) return Number.POSITIVE_INFINITY
  let min = Number.POSITIVE_INFINITY
  for (const other of focusCells) {
    const d = hexDistCells(cell, other)
    if (d < min) min = d
  }
  return min
}

function buildBotIntent(room, mem, cells, enemiesIn) {
  const cond = room && room.battleMapConditions
  const struggle = normalizeStruggleFaction(cond && cond.struggleFaction)
  const attacker = mem.faction === struggle
  const turn = Number(room.battleTurnIndex) || 0
  const maxTurns = parseMaxTurns(cond)
  const turnsLeft = maxTurns != null ? Math.max(0, maxTurns - turn) : null
  const urgent = turnsLeft != null && turnsLeft <= Math.max(3, Math.ceil(Number(maxTurns) * 0.3))
  const enemies = enemiesIn || enemyPacks(cells, mem)
  const empty = {
    mode: 'none',
    attacker,
    urgent,
    capIdSet: new Set(),
    capCells: [],
    needUnits: 1,
    occupying: 0,
    huntPacks: enemies,
    huntIds: new Set(),
    protectIds: new Set(),
    focusCells: enemies.map((e) => e.cell),
    stall: false,
  }

  const cap = cond && cond.axisCapture
  if (cap && typeof cap === 'object' && cap.enabled) {
    const ids = captureCellIds(room)
    const capIdSet = new Set(ids)
    const capCells = (cells || []).filter((c) => capIdSet.has(Number(c.id)))
    const occupying = countFactionOnHexes(cells, struggle, capIdSet)
    const enemiesOnCap = enemies.filter((e) => capIdSet.has(Number(e.cell.id)))
    const huntPacks = enemiesOnCap.length ? enemiesOnCap : enemies
    return {
      mode: 'capture',
      attacker,
      urgent,
      capIdSet,
      capCells,
      needUnits: Math.max(1, Number(cap.requiredUnits) || 1),
      occupying,
      huntPacks,
      huntIds: new Set(enemiesOnCap.map((e) => Number(e.unit.instanceId))),
      protectIds: new Set(),
      focusCells: capCells.length ? capCells : enemies.map((e) => e.cell),
      stall: false,
    }
  }

  const elim = cond && cond.axisElimination
  if (elim && typeof elim === 'object' && elim.enabled) {
    const specific = elim.type === 'specific'
    const ids = specific ? [...new Set(parseNumList(elim.specificUnits))] : []
    const marked = specific && ids.length ? findPacksByIds(cells, ids) : []
    const huntPacks = attacker ? (marked.length ? marked : enemies) : marked
    const markedIds = new Set((marked.length ? marked : huntPacks).map((p) => Number(p.unit.instanceId)))
    const protectIds = new Set()
    if (!attacker && specific) {
      for (const p of marked) {
        if (memberOwnsUnit(mem, p.unit)) protectIds.add(Number(p.unit.instanceId))
      }
    }
    return {
      mode: 'elimination',
      attacker,
      urgent,
      capIdSet: new Set(),
      capCells: [],
      needUnits: 1,
      occupying: 0,
      huntPacks: attacker ? huntPacks : enemies,
      huntIds: attacker ? markedIds : new Set(),
      protectIds,
      focusCells: attacker
        ? (huntPacks.length ? huntPacks.map((p) => p.cell) : enemies.map((e) => e.cell))
        : specific && marked.length
          ? marked.map((p) => p.cell)
          : enemies.map((e) => e.cell),
      stall: !attacker && urgent,
      specific,
    }
  }

  return empty
}

function unitOnCapture(pack, intent) {
  return intent.mode === 'capture' && intent.capIdSet.has(Number(pack.cell.id))
}

function shouldHoldHex(pack, intent) {
  if (!unitOnCapture(pack, intent)) return false
  if (intent.attacker) return true
  return intent.urgent || intent.huntIds.size > 0
}

function shouldRushMove(pack, intent) {
  if (!intent.urgent || intent.mode !== 'capture') return false
  if (unitOnCapture(pack, intent)) return false
  if (intent.attacker) return intent.occupying < intent.needUnits
  return true
}

function enemiesWithinSteps(enemies, cell, steps) {
  for (const e of enemies || []) {
    if (hexDistCells(cell, e.cell) <= steps) return true
  }
  return false
}

function supplyOrderFields(wants) {
  const o = {}
  if (wants.ammo > 0) o.transferAmmo = wants.ammo
  if (wants.mines > 0) o.transferMines = wants.mines
  if (wants.explosives > 0) o.transferExplosives = wants.explosives
  if (wants.smoke > 0) o.transferSmoke = wants.smoke
  return o
}

function tryBotTruckLogistics(room, mem, cells, validateSubmittedOrders, orders, pack, enemies, claimedIds, fogIds, mine) {
  if (!isTruckUnit(pack.unit)) return false
  const iid = Number(pack.unit.instanceId)
  const allies = (mine || ownedPacks(cells, mem)).filter((p) => {
    if (Number(p.unit.instanceId) === iid) return false
    if (isTruckUnit(p.unit) || isAirUnit(p.unit)) return false
    return getStr(p.unit) > 0
  })
  const needy = allies
    .filter((p) => supply.unitNeedsSpecialResupply(p.unit) && !enemiesWithinSteps(enemies, p.cell, 3))
    .sort((a, b) => {
      const ga = supply.wantsTotal(supply.maxTruckToUnit(pack.unit, a.unit))
      const gb = supply.wantsTotal(supply.maxTruckToUnit(pack.unit, b.unit))
      if (ga !== gb) return gb - ga
      return hexDistCells(pack.cell, a.cell) - hexDistCells(pack.cell, b.cell)
    })

  const canDeliverNow = needy.some(
    (p) =>
      hexDistCells(pack.cell, p.cell) <= 1 &&
      supply.wantsTotal(supply.maxTruckToUnit(pack.unit, p.unit)) >= 1,
  )
  if (needy.length && (canDeliverNow || !supply.truckHasNoSpecialCargo(pack.unit))) {
    for (const tgt of needy) {
      if (hexDistCells(pack.cell, tgt.cell) > 1) continue
      const give = supply.maxTruckToUnit(pack.unit, tgt.unit)
      if (supply.wantsTotal(give) < 1) continue
      if (
        tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
          unitInstanceId: iid,
          orderKey: 'getSup',
          targetUnitInstanceId: Number(tgt.unit.instanceId),
          ...supplyOrderFields(give),
        })
      ) {
        return true
      }
    }
    const moveTo = pickMoveCell(
      cells,
      mem,
      pack,
      needy.map((p) => p.cell),
      claimedIds,
      fogIds,
    )
    if (moveTo != null) {
      const ok = tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
        unitInstanceId: iid,
        orderKey: 'move',
        targetCellId: moveTo,
      })
      if (ok && claimedIds) claimedIds.add(Number(moveTo))
      return ok
    }
    return false
  }

  const warehouses = (cells || []).filter(
    (c) =>
      hasStorage(c) &&
      supply.wantsTotal(supply.maxWarehouseToTruck(pack.unit, c)) >= 1 &&
      !enemiesWithinSteps(enemies, c, 3),
  )
  if (!supply.truckNeedsWarehouseStock(pack.unit) || !warehouses.length) return false
  for (const wh of warehouses) {
    if (hexDistCells(pack.cell, wh) > 1) continue
    const take = supply.maxWarehouseToTruck(pack.unit, wh)
    if (supply.wantsTotal(take) < 1) continue
    if (
      tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
        unitInstanceId: iid,
        orderKey: 'loadingSup',
        targetCellId: Number(wh.id),
        ...supplyOrderFields(take),
      })
    ) {
      return true
    }
  }
  const moveTo = pickMoveCell(cells, mem, pack, warehouses, claimedIds, fogIds)
  if (moveTo != null) {
    const ok = tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
      unitInstanceId: iid,
      orderKey: 'move',
      targetCellId: moveTo,
    })
    if (ok && claimedIds) claimedIds.add(Number(moveTo))
    return ok
  }
  return false
}

function pickBotOrders(room, mem, cells, validateSubmittedOrders, difficulty) {
  const orders = []
  const claimedIds = new Set()
  const field = listFieldUnits(cells)
  const mine = []
  const allEnemies = []
  for (let i = 0; i < field.length; i++) {
    const p = field[i]
    if (memberOwnsUnit(mem, p.unit)) mine.push(p)
    else if (getStr(p.unit) > 0 && factionsOpposed(mem.faction, unitFaction(p.unit))) allEnemies.push(p)
  }
  const intent = buildBotIntent(room, mem, cells, allEnemies)
  const fogIds = new Set(computeRevealedCellIdsForFaction(cells, mem.faction) || [])
  const visibleEnemies = []
  for (let i = 0; i < allEnemies.length; i++) {
    const e = allEnemies[i]
    if (fogIds.has(Number(e.cell.id))) visibleEnemies.push(e)
  }
  const aimCells = intent.focusCells.length ? intent.focusCells : visibleEnemies.map((e) => e.cell)
  const losFn = makeLosMemo(cells)
  const airInfo = enemyAirInfo(allEnemies, cells, fogIds)
  const hasAir = mine.some((p) => isAirUnit(p.unit))
  const aaSets = hasAir ? collectEnemyAaSectorSets(cells, mem) : []
  const gunCtxBase = {
    room,
    mem,
    cells,
    validateSubmittedOrders,
    orders,
    intent,
    visibleEnemies,
    claimedIds,
    fogIds,
    losFn,
    difficulty,
    airInfo,
  }

  for (let mi = 0; mi < mine.length; mi++) {
    const pack = mine[mi]
    if (isAirUnit(pack.unit)) {
      tryBotAirTurn({
        room,
        mem,
        cells,
        validateSubmittedOrders,
        orders,
        pack,
        visibleEnemies,
        intent,
        aaSets,
        airInfo,
        fogIds,
      })
      continue
    }
    if (
      tryBotTruckLogistics(
        room,
        mem,
        cells,
        validateSubmittedOrders,
        orders,
        pack,
        allEnemies,
        claimedIds,
        fogIds,
        mine,
      )
    ) {
      continue
    }
    if (unitUsesGunDeploy(pack.unit)) {
      gunCtxBase.pack = pack
      tryBotGunTurn(gunCtxBase)
      continue
    }

    const iid = Number(pack.unit.instanceId)
    const stayPut = isHqHoldUnit(pack.unit) || unitHasPropKey(pack.unit, 'fireAirGun')
    if (!stayPut && difficulty === 'easy' && !intent.urgent && Math.random() < 0.35) continue
    const hold = stayPut || shouldHoldHex(pack, intent)
    const protectSelf = Boolean(intent.protectIds && intent.protectIds.has(iid))
    const flee = protectSelf && !stayPut
    const skipMelee = Boolean(intent.stall) || flee
    const rush = shouldRushMove(pack, intent)

    const maxR = maxShootRangeStepsForUnit(pack.unit)
    const inRange = []
    for (let ei = 0; ei < visibleEnemies.length; ei++) {
      const e = visibleEnemies[ei]
      if (isAirUnit(e.unit)) continue
      const dist = hexDistCells(pack.cell, e.cell)
      if (Number.isFinite(maxR) && maxR >= 0 && dist > maxR + 2) continue
      if (!shooterSeesOrClosed(pack.unit, pack.cell, e.cell, losFn)) continue
      inRange.push(e)
    }
    const fireTargets = sortFireTargets(inRange, pack.cell, difficulty, false, intent.huntIds).slice(
      0,
      FIRE_TARGET_CAP,
    )
    let placed = false
    for (let fi = 0; fi < fireTargets.length; fi++) {
      const row = fireTargets[fi]
      const tid = Number(row.p.unit.instanceId)
      const isPri = intent.huntIds.has(tid)
      if (rush && !isPri) continue
      if (flee && !isPri) continue
      if (
        tryBotFireAtPack(
          room,
          mem,
          cells,
          validateSubmittedOrders,
          orders,
          iid,
          pack.unit,
          row.p,
          pack.cell,
          losFn,
        )
      ) {
        placed = true
        break
      }
    }
    if (placed) continue

    if (!skipMelee) {
      for (let ei = 0; ei < visibleEnemies.length; ei++) {
        const enemy = visibleEnemies[ei]
        if (isAirUnit(enemy.unit)) continue
        if (hexDistCells(pack.cell, enemy.cell) > 1) continue
        const tid = Number(enemy.unit.instanceId)
        const isPri = intent.huntIds.has(tid)
        if (rush && !isPri) continue
        if (
          tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
            unitInstanceId: iid,
            orderKey: 'attack',
            targetUnitInstanceId: tid,
          })
        ) {
          placed = true
          break
        }
      }
      if (placed) continue
    }

    if (hold && !flee) continue

    let moveTo = null
    if (flee || (intent.stall && !intent.specific)) {
      moveTo = pickFleeCell(
        cells,
        mem,
        pack,
        visibleEnemies.map((e) => e.cell),
        claimedIds,
        fogIds,
      )
    } else {
      moveTo = pickMoveCell(
        cells,
        mem,
        pack,
        aimCells.length ? aimCells : visibleEnemies.map((e) => e.cell),
        claimedIds,
        fogIds,
      )
    }
    if (moveTo != null) {
      if (
        tryAcceptOrder(room, mem, cells, validateSubmittedOrders, orders, {
          unitInstanceId: iid,
          orderKey: 'move',
          targetCellId: moveTo,
        })
      ) {
        claimedIds.add(Number(moveTo))
      }
    }
  }
  return orders
}

function applyBotTurns(room, validateSubmittedOrders) {
  if (!room || typeof validateSubmittedOrders !== 'function') return
  if (room.battleStartedAt == null) return
  if (room.battleDeployPhase && room.battleDeployPhase.active) return
  if ((room.battleScenarioEndSeq ?? 0) > 0) return
  const cells = room.battleCells
  if (!Array.isArray(cells) || !cells.length) return
  const turn = room.battleTurnIndex ?? 0
  if (!room.battleTurnAck || typeof room.battleTurnAck.add !== 'function') room.battleTurnAck = new Set()
  if (!room.battleOrdersDraft || typeof room.battleOrdersDraft !== 'object') room.battleOrdersDraft = {}
  const difficulty = room.botDifficulty === 'easy' || room.botDifficulty === 'hard' ? room.botDifficulty : 'normal'
  const { withBattleEnv } = require('../scenario/battleEnvironment')
  const fogVis = require('../map/battleFogVisibility')
  fogVis.beginFogMemo(cells)
  try {
    withBattleEnv(room, () => {
      for (const mem of room.members || []) {
        if (!isBotMember(mem)) continue
        if (mem.faction !== 'rkka' && mem.faction !== 'wehrmacht') continue
        if (room.battleTurnAck.has(mem.key)) continue
        const orders = pickBotOrders(room, mem, cells, validateSubmittedOrders, difficulty)
        room.battleOrdersDraft[mem.key] = { turn, orders }
        room.battleTurnAck.add(mem.key)
      }
    })
  } finally {
    fogVis.endFogMemo()
  }
}

function applyBotHqSkip(room) {
  const session = room && room.battleHqRewriteSession
  if (!session || !Array.isArray(session.needKeys)) return
  if (!session.ack || typeof session.ack.add !== 'function') session.ack = new Set()
  for (const key of session.needKeys) {
    const mem = (room.members || []).find((m) => m.key === key)
    if (!isBotMember(mem)) continue
    session.ack.add(key)
  }
}

function applyBotDeploy(room) {
  const ph = room && room.battleDeployPhase
  if (!ph || !ph.active) return
  const deploy = require('../map/battleDeployPhase')
  for (const mem of room.members || []) {
    if (!isBotMember(mem)) continue
    const rem = ph.remaining && ph.remaining[mem.key]
    const zone = (ph.zones && ph.zones[String(mem.team)]) || []
    if (rem && Array.isArray(rem.unitIds) && rem.unitIds.length && zone.length) {
      const queued = rem.unitIds.slice()
      for (const uid of queued) {
        let placed = false
        for (const cellId of zone) {
          const result = deploy.placeDeployUnit(room, mem, uid, cellId)
          if (!result.error) {
            placed = true
            break
          }
        }
        if (!placed) break
      }
    }
    deploy.setDeployReady(room, mem, true)
  }
}

module.exports = {
  isBotMember,
  botKey,
  parseMapBots,
  isSoloPlayerBotMap,
  ensureRoomBots,
  applyBotTurns,
  applyBotHqSkip,
  applyBotDeploy,
  factionForTeam,
}

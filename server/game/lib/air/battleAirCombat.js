'use strict'

const { hexDistCells } = require('../map/battleHexGeometry')
const { terrainAccuracyBonusFromCell } = require('../map/battleTerrain')
const { getEffectiveMor, roll2d6, getMoraleThresholdForSteadfastness } = require('../../core/battleMorale')
const { unitFaction, opposing, getStr } = require('../unit/battleUnitField')
const {
  isBattleAirUnit,
  ensureAirSortie,
  beginAirCooldown,
  PATROL_MAX_TURNS,
  readFlightPathCellIds,
  readEffectivePathIndex,
  readAirFlightPositionCellId,
} = require('./battleAirSortie')
const airPatrol = require('./battleAirPatrol')

function readAirFlightDurationMax(unit) {
  const raw = unit?.airFlightTurns ?? unit?.airFlightDuration ?? unit?.flightDuration
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return PATROL_MAX_TURNS
}

function ensureFlightTracking(unit) {
  const sortie = ensureAirSortie(unit)
  if (!Number.isFinite(Number(sortie.flightTurnsMax)) || Number(sortie.flightTurnsMax) <= 0) {
    sortie.flightTurnsMax = readAirFlightDurationMax(unit)
  }
  if (!Number.isFinite(Number(sortie.flightTurnsUsed))) sortie.flightTurnsUsed = 0
  return sortie
}

function incrementFlightTurn(unit, amount = 1) {
  const sortie = ensureFlightTracking(unit)
  sortie.flightTurnsUsed = (Number(sortie.flightTurnsUsed) || 0) + Math.max(0, Number(amount) || 0)
  return sortie
}

function isFlightLimitReached(unit) {
  const sortie = unit?.tactical?.airSortie
  if (!sortie) return false
  const phase = String(sortie.phase || '')
  const orderKey = String(sortie.activeOrderKey || '')
  if (phase === 'patrol' && (orderKey === 'patrol' || orderKey === 'intelligenceAir')) {
    return false
  }
  const used = Number(sortie.flightTurnsUsed) || 0
  const max = Number(sortie.flightTurnsMax) || readAirFlightDurationMax(unit)
  return used >= max
}

function ensureTactical(unit) {
  if (!unit.tactical || typeof unit.tactical !== 'object') unit.tactical = {}
  return unit.tactical
}

function engagementKey(cellId, participantIds) {
  const ids = [...participantIds].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  return `${Number(cellId)}:${ids.join(',')}`
}

function clearAirCombatState(unit) {
  const tac = unit?.tactical
  if (!tac || typeof tac !== 'object') return
  delete tac.airCombat
  delete tac.airCombatTargetId
}

function setAirCombatState(unit, cellId, engagementId, targetId) {
  const tac = ensureTactical(unit)
  tac.airCombat = {
    engagementId,
    cellId: Number(cellId),
    targetInstanceId: targetId != null ? Number(targetId) : null,
  }
}

function isUnitInAirCombat(unit) {
  return !!(unit?.tactical?.airCombat && typeof unit.tactical.airCombat === 'object')
}

function listLiveAirCombatUnits(cells, deps) {
  const { findUnitOnField, getStr: getStrFn } = deps
  const out = []
  const seen = new Set()
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u) || !isUnitInAirCombat(u)) continue
      const id = Number(u.instanceId)
      if (seen.has(id)) continue
      seen.add(id)
      const live = findUnitOnField(cells, id)
      if (!live || getStrFn(live.unit) <= 0) continue
      out.push(live)
    }
  }
  return out
}

function rollD6(rng) {
  const rand = rng || Math.random
  return Math.floor(rand() * 6) + 1
}

function findPathIntersectionCell(pathA, pathB) {
  const a = Array.isArray(pathA) ? pathA.map(Number).filter(Number.isFinite) : []
  const b = Array.isArray(pathB) ? pathB.map(Number).filter(Number.isFinite) : []
  const indexB = new Map()
  for (let i = 0; i < b.length; i++) indexB.set(b[i], i)
  let bestCell = null
  let bestScore = Infinity
  for (let i = 0; i < a.length; i++) {
    const id = a[i]
    if (!indexB.has(id)) continue
    const score = Math.max(i, indexB.get(id))
    if (score < bestScore) {
      bestScore = score
      bestCell = id
    }
  }
  return bestCell
}

function collectTurnFlightPaths(cells, list) {
  const flights = []
  const seen = new Set()
  const add = (unitId, pathIds, orderKey, targetCellId, departureCellId) => {
    const id = Number(unitId)
    if (!Number.isFinite(id) || seen.has(id)) return
    seen.add(id)
    flights.push({
      unitId: id,
      pathIds: Array.isArray(pathIds) ? pathIds.map(Number).filter(Number.isFinite) : [],
      orderKey: String(orderKey || ''),
      targetCellId: Number(targetCellId),
      departureCellId: Number(departureCellId),
    })
  }
  for (const o of list || []) {
    const k = String(o.orderKey || '').trim()
    if (!k) continue
    add(o.unitId, o.flightPathCellIds, k, o.targetCellId, o.departureCellId)
  }
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u)) continue
      const tac = u.tactical
      if (!tac) continue
      const path = tac.airMissionFlightPath
      if (!Array.isArray(path) || !path.length) continue
      add(
        u.instanceId,
        path,
        tac.airMissionOrderKey || tac.airSortie?.activeOrderKey,
        tac.airMissionTargetCellId,
        tac.airSortie?.departureCellId ?? c.id,
      )
    }
  }
  return flights
}

function detectPatrolEngagements(cells, flights, deps) {
  const out = []
  const usedPairs = new Set()
  for (let fi = 0; fi < flights.length; fi++) {
    const f = flights[fi]
    const intruder = deps.findUnitOnField(cells, f.unitId)
    if (!intruder || getStr(intruder.unit) <= 0) continue
    const patrols = airPatrol.listActiveAirPatrols(cells)
    for (let pi = 0; pi < patrols.length; pi++) {
      const patrolLive = deps.findUnitOnField(cells, patrols[pi].unit.instanceId)
      if (!patrolLive || getStr(patrolLive.unit) <= 0) continue
      if (!opposing(unitFaction(patrolLive.unit), unitFaction(intruder.unit))) continue
      const patrolId = Number(patrolLive.unit.instanceId)
      const intruderId = Number(intruder.unit.instanceId)
      const pairKey = `${patrolId}:${intruderId}`
      if (usedPairs.has(pairKey)) continue

      const centerId = airPatrol.readPatrolCenterCellId(patrolLive.unit)
      if (centerId == null) continue
      const centerCell = cells.find((c) => Number(c.id) === centerId)
      if (!centerCell) continue
      const rangeSteps = airPatrol.readPatrolRangeSteps(patrolLive.unit)
      const zoneIds = airPatrol.computePatrolZoneCellIds(cells, centerCell, rangeSteps)
      const zoneSet = new Set(zoneIds)
      const entryCellId = airPatrol.intruderEntersPatrolZone(f.pathIds, f.targetCellId, zoneSet)
      if (entryCellId == null) continue

      usedPairs.add(pairKey)
      out.push({
        type: 'patrol',
        cellId: Number(entryCellId),
        participantIds: [patrolId, intruderId],
        intruderOrderKey: f.orderKey,
      })
    }
  }
  return out
}

function detectRouteIntersectionEngagements(flights, cells, deps) {
  const out = []
  const usedKeys = new Set()
  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const a = flights[i]
      const b = flights[j]
      const liveA = deps.findUnitOnField(cells, a.unitId)
      const liveB = deps.findUnitOnField(cells, b.unitId)
      if (!liveA || !liveB) continue
      if (!opposing(unitFaction(liveA.unit), unitFaction(liveB.unit))) continue
      if (getStr(liveA.unit) <= 0 || getStr(liveB.unit) <= 0) continue
      const cellId = findPathIntersectionCell(a.pathIds, b.pathIds)
      if (cellId == null) continue
      const ids = [a.unitId, b.unitId].map(Number).sort((x, y) => x - y)
      const key = `${cellId}:${ids.join(',')}`
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      out.push({
        type: 'routeIntersection',
        cellId,
        participantIds: ids,
      })
    }
  }
  return out
}

function computeInterceptionMeetingCell(cells, interceptorCell, targetUnit, hexFlightPathCellIds) {
  const fullTargetPath = readFlightPathCellIds(targetUnit)
  if (!fullTargetPath.length) return null
  const targetIdx = readEffectivePathIndex(targetUnit, fullTargetPath)
  const targetPath = targetIdx > 0 ? fullTargetPath.slice(targetIdx) : fullTargetPath

  const tac = targetUnit?.tactical
  const targetEndId = Number(tac?.airMissionTargetCellId) || fullTargetPath[fullTargetPath.length - 1]
  const targetEndCell = cells.find((c) => Number(c.id) === Number(targetEndId))
  const currentCellId = readAirFlightPositionCellId(targetUnit, Number(interceptorCell?.id))
  const currentCell = cells.find((c) => Number(c.id) === Number(currentCellId))
  if (!targetEndCell || !currentCell || !interceptorCell) return null

  const approachPath =
    hexFlightPathCellIds(cells, interceptorCell, currentCell) ||
    hexFlightPathCellIds(cells, interceptorCell, targetEndCell)
  if (!approachPath?.length) return null

  let meetingCellId = findPathIntersectionCell(targetPath, approachPath)
  if (meetingCellId == null) {
    meetingCellId = Number(currentCellId)
  }
  if (meetingCellId == null || !Number.isFinite(Number(meetingCellId))) return null
  const meetingCell = cells.find((c) => Number(c.id) === Number(meetingCellId))
  if (!meetingCell) return null
  const interceptorPath = hexFlightPathCellIds(cells, interceptorCell, meetingCell) || []
  return { meetingCellId: Number(meetingCellId), interceptorPath, targetPath }
}

function interceptionPairReadyForCombat(interceptorUnit, targetUnit, meetingCellId) {
  if (meetingCellId == null || !Number.isFinite(Number(meetingCellId))) return false
  const meetId = Number(meetingCellId)
  const iPath = readFlightPathCellIds(interceptorUnit)
  const tPath = readFlightPathCellIds(targetUnit)
  const meetI = iPath.indexOf(meetId)
  const meetT = tPath.indexOf(meetId)
  if (meetI < 0 || meetT < 0) return false
  const iIdx = readEffectivePathIndex(interceptorUnit, iPath)
  const tIdx = readEffectivePathIndex(targetUnit, tPath)
  return iIdx >= meetI && tIdx >= meetT
}

function detectInterceptionEngagements(cells, list, deps) {
  const out = []
  const usedPairs = new Set()
  const { findUnitOnField, hexFlightPathCellIds } = deps

  const tryAddPair = (interceptorId, targetId, meetingCellId) => {
    const pairKey = `${Number(interceptorId)}:${Number(targetId)}`
    if (usedPairs.has(pairKey)) return
    const interceptor = findUnitOnField(cells, interceptorId)
    const target = findUnitOnField(cells, targetId)
    if (!interceptor || !target) return
    if (!opposing(unitFaction(interceptor.unit), unitFaction(target.unit))) return
    if (getStr(interceptor.unit) <= 0 || getStr(target.unit) <= 0) return
    if (!interceptionPairReadyForCombat(interceptor.unit, target.unit, meetingCellId)) return
    usedPairs.add(pairKey)
    out.push({
      type: 'interception',
      cellId: Number(meetingCellId),
      participantIds: [Number(interceptorId), Number(targetId)],
    })
  }

  for (const o of list || []) {
    if (String(o.orderKey || '').trim() !== 'interception') continue
    const interceptorId = Number(o.unitId)
    const targetId = Number(o.targetUnitInstanceId)
    if (!Number.isFinite(interceptorId) || !Number.isFinite(targetId)) continue
    const interceptor = findUnitOnField(cells, interceptorId)
    const target = findUnitOnField(cells, targetId)
    if (!interceptor || !target) continue
    let meetingCellId = Number(o.targetCellId)
    if (!Number.isFinite(meetingCellId) && hexFlightPathCellIds) {
      const computed = computeInterceptionMeetingCell(cells, interceptor.cell, target.unit, hexFlightPathCellIds)
      meetingCellId = computed?.meetingCellId
    }
    if (!Number.isFinite(meetingCellId)) {
      meetingCellId = Number(airPatrol.readAirEngagementCellId(target.unit, Number(target.cell.id)))
    }
    tryAddPair(interceptorId, targetId, meetingCellId)
  }

  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'inbound') continue
      if (String(sortie.activeOrderKey || '').trim() !== 'interception') continue
      const targetId = Number(sortie.interceptionTargetId)
      const meetingCellId = Number(sortie.meetingCellId)
      if (!Number.isFinite(targetId) || !Number.isFinite(meetingCellId)) continue
      tryAddPair(Number(u.instanceId), targetId, meetingCellId)
    }
  }

  return out
}

function mergeEngagements(rawEngagements) {
  const byKey = new Map()
  for (let i = 0; i < rawEngagements.length; i++) {
    const e = rawEngagements[i]
    const ids = [...new Set(e.participantIds.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
    if (ids.length < 2) continue
    const key = engagementKey(e.cellId, ids)
    if (!byKey.has(key)) {
      byKey.set(key, {
        cellId: Number(e.cellId),
        participantIds: ids,
        types: [e.type],
      })
    } else {
      const cur = byKey.get(key)
      for (const id of ids) {
        if (!cur.participantIds.includes(id)) cur.participantIds.push(id)
      }
      cur.participantIds.sort((a, b) => a - b)
      cur.types.push(e.type)
    }
  }
  return [...byKey.values()]
}

const ENGAGEMENT_TYPE_PRIORITY = {
  ongoing: 0,
  interception: 1,
  patrol: 2,
  routeIntersection: 3,
}

function engagementPrimaryType(types) {
  const list = Array.isArray(types) ? types.map((t) => String(t)) : []
  let best = 'routeIntersection'
  let bestPri = ENGAGEMENT_TYPE_PRIORITY.routeIntersection
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    const pri = ENGAGEMENT_TYPE_PRIORITY[t]
    if (pri != null && pri < bestPri) {
      bestPri = pri
      best = t
    }
  }
  return best
}

function engagementPriorityScore(engagement) {
  return ENGAGEMENT_TYPE_PRIORITY[engagementPrimaryType(engagement.types)] ?? 99
}

/** Одна пара самолётов — один бой за фазу; патруль/перехват важнее пересечения маршрутов. */
function dedupeEngagementsByParticipantPair(engagements) {
  const byPair = new Map()
  for (let i = 0; i < engagements.length; i++) {
    const e = engagements[i]
    const ids = [...new Set(e.participantIds.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
    if (ids.length < 2) continue
    const pairKey = ids.join(',')
    const normalized = {
      cellId: Number(e.cellId),
      participantIds: ids,
      types: Array.isArray(e.types) ? [...e.types] : [String(e.type || 'routeIntersection')],
      intruderOrderKey: e.intruderOrderKey,
    }
    const prev = byPair.get(pairKey)
    if (!prev || engagementPriorityScore(normalized) < engagementPriorityScore(prev)) {
      byPair.set(pairKey, normalized)
    }
  }
  return [...byPair.values()]
}

function groupParticipantsByFaction(cells, participantIds, deps) {
  const { findUnitOnField, getStr: getStrFn } = deps
  const groups = new Map()
  for (let i = 0; i < participantIds.length; i++) {
    const id = Number(participantIds[i])
    const live = findUnitOnField(cells, id)
    if (!live || getStrFn(live.unit) <= 0) continue
    const fac = unitFaction(live.unit)
    if (!groups.has(fac)) groups.set(fac, [])
    groups.get(fac).push({ id, unit: live.unit, cell: live.cell })
  }
  return groups
}

function sortAssignmentOrder(participants, cells, findUnitOnField, rng) {
  return participants
    .map((p) => ({
      ...p,
      mor: getEffectiveMor(p.unit, cells, findUnitOnField),
      tie: rollD6(rng),
    }))
    .sort((a, b) => b.mor - a.mor || b.tie - a.tie)
}

function pickValidTarget(enemyIds, assignments) {
  const engagedTargets = new Set()
  for (const t of assignments.values()) engagedTargets.add(Number(t))
  const unengaged = enemyIds.filter((id) => !engagedTargets.has(Number(id)))
  if (unengaged.length > 0) return unengaged[0]
  return enemyIds[0] ?? null
}

function assignTargetsForRound(participants, deps) {
  const { findUnitOnField, getStr: getStrFn } = deps
  const live = participants.filter((p) => {
    const f = findUnitOnField(deps.cells, p.id)
    return f && getStrFn(f.unit) > 0
  })
  const byFac = new Map()
  for (const p of live) {
    const fac = unitFaction(p.unit)
    if (!byFac.has(fac)) byFac.set(fac, [])
    byFac.get(fac).push(Number(p.id))
  }
  const factions = [...byFac.keys()]
  if (factions.length < 2) return new Map()

  const ordered = sortAssignmentOrder(live, deps.cells, findUnitOnField, deps.rng)
  const assignments = new Map()
  for (let i = 0; i < ordered.length; i++) {
    const att = ordered[i]
    const attFac = unitFaction(att.unit)
    const enemyFac = factions.find((f) => opposing(f, attFac))
    if (!enemyFac) continue
    const enemyIds = (byFac.get(enemyFac) || [])
      .filter((id) => {
        const f = findUnitOnField(deps.cells, id)
        return f && getStrFn(f.unit) > 0
      })
    if (!enemyIds.length) continue
    const targetId = pickValidTarget(enemyIds, assignments)
    if (targetId != null) assignments.set(Number(att.id), Number(targetId))
  }
  return assignments
}

function computeAirCombatShot(attacker, attackerCell, defender, combatCell, deps) {
  const {
    intensityArrayFor,
    rangeArrayFor,
    rangeArrayForAtCell,
    computeShoot,
    moveWarDefenseBonus,
    ordersByUnit,
    getStr: getStrFn,
  } = deps
  const ia = intensityArrayFor(attacker, defender)
  const ra = rangeArrayForAtCell
    ? rangeArrayForAtCell(attacker, attackerCell)
    : rangeArrayFor(attacker)
  const closeRange = ra[0] ?? 3
  const warDef = moveWarDefenseBonus(defender.instanceId, ordersByUnit)
  const accBonus = terrainAccuracyBonusFromCell(attackerCell, attacker, defender, false)
  const res = computeShoot(
    attacker,
    defender,
    combatCell,
    1,
    ia,
    [closeRange],
    false,
    undefined,
    warDef,
    accBonus,
    false,
    1,
  )
  const prev = getStrFn(defender)
  const dmg = Number(res.damages) || 0
  return { res, prevStr: prev, dmg, warDef: !!warDef }
}

function tryAirCombatSteadfastness(unit, damageDealt, le, ph, deps) {
  const { getStr: getStrFn } = deps
  if (getStrFn(unit) <= 0) return true
  if (damageDealt <= 0) return true
  const threshold = getMoraleThresholdForSteadfastness(unit, {
    isTruckUnit: deps.isTruckUnit,
    cells: deps.cells,
    findUnitOnField: deps.findUnitOnField,
  })
  if (threshold <= 0) return true
  const sum = roll2d6()
  const tac = ensureTactical(unit)
  tac.steadfastnessUiRoll = sum
  if (sum < threshold) {
    le(ph, `Воздушный бой · стойкость: юнит ${unit.instanceId} — ${sum} < ${threshold}`)
    return true
  }
  le(ph, `Воздушный бой · стойкость: юнит ${unit.instanceId} — провал ${sum} ≥ ${threshold} → возврат на базу`)
  return false
}

function interruptAirMission(unit, le, ph, fromCellId) {
  const tac = unit.tactical
  if (tac?.airMissionInterrupted === true) return
  const sortie = unit.tactical?.airSortie
  if (sortie && typeof sortie === 'object') {
    sortie.missionInterrupted = true
    sortie.interruptedOrderKey = sortie.activeOrderKey || unit.tactical?.airMissionOrderKey || null
  }
  if (tac) tac.airMissionInterrupted = true
  le(ph, `Воздушный бой: юнит ${unit.instanceId} — приказ прерван`, {
    airCombatLine: { unitInstanceId: Number(unit.instanceId), fromCellId: Number(fromCellId), interrupted: true },
  })
}

function forceReturnAirUnit(cells, unitId, le, ph, deps) {
  const { findUnitOnField, sweepCorpses, applyCargoDamageFromTruckHit, isTruckUnit, beginAirCooldown: beginCooldownFn } =
    deps
  const live = findUnitOnField(cells, unitId)
  if (!live || getStr(live.unit) <= 0) return
  clearAirCombatState(live.unit)
  const sortie = live.unit.tactical?.airSortie
  const dep = Number(sortie?.departureCellId) || Number(live.cell.id)
  const path = Array.isArray(live.unit.tactical?.airMissionFlightPath)
    ? live.unit.tactical.airMissionFlightPath
    : []
  const fromId = Number(live.unit.tactical?.airMissionTargetCellId) || Number(live.cell.id)
  const cooldown = beginCooldownFn || beginAirCooldown
  cooldown(live.unit, dep, path.length ? path : [fromId, dep], fromId, !!sortie?.firedWeapons, le, ph)
  sweepCorpses(cells)
}

function applyShotDamage(cells, shot, destroyCellId, le, ph, deps) {
  const {
    findUnitOnField,
    setStr,
    getStr: getStrFn,
    logUnitDestroyed,
    sweepCorpses,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
  } = deps
  const defLive = findUnitOnField(cells, shot.targetId)
  if (!defLive || getStrFn(defLive.unit) <= 0) return { steadfastnessOk: true }
  setStr(defLive.unit, shot.prevStr - shot.dmg)
  const combatCellId = Number(destroyCellId)
  const logCellId =
    Number.isFinite(combatCellId) && combatCellId > 0 ? combatCellId : Number(defLive.cell?.id)
  logUnitDestroyed(le, ph, defLive.unit, shot.prevStr, 'воздушный бой', logCellId)
  if (isTruckUnit(defLive.unit)) {
    applyCargoDamageFromTruckHit(cells, defLive.unit, shot.dmg)
  } else if (
    isBattleAirUnit(defLive.unit) &&
    Array.isArray(defLive.unit.tactical?.carriedUnits) &&
    defLive.unit.tactical.carriedUnits.length
  ) {
    applyCargoDamageFromTruckHit(cells, defLive.unit, shot.dmg)
  }
  sweepCorpses(cells)
  const stillLive = findUnitOnField(cells, shot.targetId)
  if (!stillLive || getStrFn(stillLive.unit) <= 0) return { steadfastnessOk: true }
  const ok = tryAirCombatSteadfastness(stillLive.unit, shot.dmg, le, ph, deps)
  return { steadfastnessOk: ok }
}

function markAirCombatFiredWeapons(cells, participantIds, deps) {
  const { findUnitOnField, getStr: getStrFn } = deps
  for (let i = 0; i < participantIds.length; i++) {
    const id = Number(participantIds[i])
    const live = findUnitOnField(cells, id)
    if (!live || getStrFn(live.unit) <= 0) continue
    const sortie = ensureAirSortie(live.unit)
    sortie.firedWeapons = true
  }
}

function resolveEngagementRound(engagement, cells, le, ph, deps) {
  const {
    findUnitOnField,
    getStr: getStrFn,
    ordersByUnit,
  } = deps
  deps.cells = cells
  const combatCell = cells.find((c) => Number(c.id) === Number(engagement.cellId))
  if (!combatCell) return { continueNextTurn: false, forcedReturnIds: [] }

  const participantIds = engagement.participantIds.map(Number).filter(Number.isFinite)
  const liveParticipants = participantIds.filter((id) => {
    const f = findUnitOnField(cells, id)
    return f && getStrFn(f.unit) > 0 && !f.unit.tactical?.airCombat?.optedOut
  })
  if (liveParticipants.length < 2) return { continueNextTurn: false, forcedReturnIds: [] }

  for (let i = 0; i < liveParticipants.length; i++) {
    const f = findUnitOnField(cells, liveParticipants[i])
    if (f) incrementFlightTurn(f.unit, 1)
  }

  const forcedReturnIds = []
  for (let i = 0; i < liveParticipants.length; i++) {
    const f = findUnitOnField(cells, liveParticipants[i])
    if (f && isFlightLimitReached(f.unit)) {
      forcedReturnIds.push(Number(f.unit.instanceId))
    }
  }

  const assignmentParticipants = liveParticipants
    .filter((id) => !forcedReturnIds.includes(id))
    .map((id) => {
      const f = findUnitOnField(cells, id)
      return f ? { id, unit: f.unit, cell: f.cell } : null
    })
    .filter(Boolean)

  const assignments = assignTargetsForRound(assignmentParticipants, deps)
  const engId = engagementKey(engagement.cellId, participantIds)
  const shots = []

  for (const [attackerId, targetId] of assignments.entries()) {
    const atkLive = findUnitOnField(cells, attackerId)
    const defLive = findUnitOnField(cells, targetId)
    if (!atkLive || !defLive) continue
    if (getStrFn(atkLive.unit) <= 0 || getStrFn(defLive.unit) <= 0) continue
    const computed = computeAirCombatShot(atkLive.unit, atkLive.cell, defLive.unit, combatCell, deps)
    shots.push({
      attackerId,
      targetId,
      ...computed,
    })
    setAirCombatState(atkLive.unit, engagement.cellId, engId, targetId)
    setAirCombatState(defLive.unit, engagement.cellId, engId, attackerId)
  }

  le(
    ph,
    `Воздушный бой · гекс ${engagement.cellId}: участники [${participantIds.join(', ')}] — одновременная стрельба (${shots.length} залпов)`,
    {
      airCombatLine: {
        cellId: Number(engagement.cellId),
        participantIds,
        types: engagement.types || [],
        roundShots: shots.map((s) => ({
          attackerId: s.attackerId,
          targetId: s.targetId,
          hits: s.res.hits,
          damages: s.dmg,
          rollResults: s.res.rollResults,
        })),
      },
    },
  )

  if (shots.length > 0) {
    markAirCombatFiredWeapons(cells, participantIds, deps)
  }

  for (let si = 0; si < shots.length; si++) {
    const result = applyShotDamage(cells, shots[si], engagement.cellId, le, ph, deps)
    if (!result.steadfastnessOk) forcedReturnIds.push(Number(shots[si].targetId))
  }

  const survivorsByFac = new Map()
  for (let i = 0; i < participantIds.length; i++) {
    const id = participantIds[i]
    if (forcedReturnIds.includes(id)) continue
    const f = findUnitOnField(cells, id)
    if (!f || getStrFn(f.unit) <= 0 || f.unit.tactical?.airCombat?.optedOut) continue
    const fac = unitFaction(f.unit)
    if (!survivorsByFac.has(fac)) survivorsByFac.set(fac, 0)
    survivorsByFac.set(fac, survivorsByFac.get(fac) + 1)
  }

  const continueNextTurn = survivorsByFac.size >= 2
  return { continueNextTurn, forcedReturnIds: [...new Set(forcedReturnIds)] }
}

function finalizeEndedEngagements(cells, engagements, forcedReturnSet, le, ph, deps) {
  const { findUnitOnField, getStr: getStrFn, beginAirCooldown: beginCooldownFn } = deps
  const forced = forcedReturnSet instanceof Set ? forcedReturnSet : new Set(forcedReturnSet || [])
  for (let ei = 0; ei < engagements.length; ei++) {
    const engagement = engagements[ei]
    const participantIds = engagement.participantIds.map(Number).filter(Number.isFinite)
    let liveCount = 0
    const liveByFac = new Map()
    for (let pi = 0; pi < participantIds.length; pi++) {
      const id = participantIds[pi]
      if (forced.has(id)) continue
      const live = findUnitOnField(cells, id)
      if (!live || getStrFn(live.unit) <= 0 || live.unit.tactical?.airCombat?.optedOut) continue
      liveCount++
      const fac = unitFaction(live.unit)
      liveByFac.set(fac, (liveByFac.get(fac) || 0) + 1)
    }
    const continueNextTurn = liveByFac.size >= 2
    if (continueNextTurn) continue
    for (let pi = 0; pi < participantIds.length; pi++) {
      const id = participantIds[pi]
      if (forced.has(id)) continue
      const live = findUnitOnField(cells, id)
      if (!live || getStrFn(live.unit) <= 0) continue
      clearAirCombatState(live.unit)
      const sortie = live.unit.tactical?.airSortie
      const phase = String(sortie?.phase || '')
      if (phase === 'patrol' || phase === 'desant') continue
      if (live.unit.tactical?.airMissionInterrupted) {
        const dep = Number(sortie?.departureCellId) || Number(live.cell.id)
        const path = Array.isArray(live.unit.tactical?.airMissionFlightPath)
          ? live.unit.tactical.airMissionFlightPath
          : []
        const fromId = Number(live.unit.tactical?.airMissionTargetCellId) || Number(live.cell.id)
        const cooldown = beginCooldownFn || beginAirCooldown
        cooldown(
          live.unit,
          dep,
          path.length ? path : [fromId, dep],
          fromId,
          !!sortie?.firedWeapons,
          le,
          ph,
        )
      }
    }
  }
}

function collectOngoingEngagements(cells, deps) {
  const { findUnitOnField, getStr: getStrFn } = deps
  const byEng = new Map()
  const live = listLiveAirCombatUnits(cells, deps)
  for (let i = 0; i < live.length; i++) {
    const u = live[i].unit
    const ac = u.tactical?.airCombat
    if (!ac?.engagementId) continue
    const id = Number(u.instanceId)
    if (!byEng.has(ac.engagementId)) {
      byEng.set(ac.engagementId, {
        cellId: Number(ac.cellId),
        participantIds: [],
        types: ['ongoing'],
      })
    }
    const e = byEng.get(ac.engagementId)
    if (!e.participantIds.includes(id)) e.participantIds.push(id)
  }
  return [...byEng.values()]
}

function resolveAirCombatsEndOfPhase(cells, list, le, ph, deps) {
  const ongoing = collectOngoingEngagements(cells, deps)
  const flights = collectTurnFlightPaths(cells, list)
  const raw = [
    ...ongoing,
    ...detectInterceptionEngagements(cells, list, deps),
    ...detectRouteIntersectionEngagements(flights, cells, deps),
    ...detectPatrolEngagements(cells, flights, deps),
  ]
  const engagements = dedupeEngagementsByParticipantPair(mergeEngagements(raw))
  const allForcedReturns = new Set()
  const interrupted = new Set()

  for (let ei = 0; ei < engagements.length; ei++) {
    const engagement = engagements[ei]
    for (let pi = 0; pi < engagement.participantIds.length; pi++) {
      const id = engagement.participantIds[pi]
      const live = deps.findUnitOnField(cells, id)
      if (live) {
        ensureFlightTracking(live.unit)
        interruptAirMission(live.unit, le, ph, live.cell.id)
        interrupted.add(id)
      }
    }

    const round = resolveEngagementRound(engagement, cells, le, ph, deps)
    for (const id of round.forcedReturnIds) allForcedReturns.add(id)
  }

  for (const id of allForcedReturns) {
    forceReturnAirUnit(cells, id, le, ph, deps)
  }

  finalizeEndedEngagements(cells, engagements, allForcedReturns, le, ph, deps)

  return {
    engagementCount: engagements.length,
    forcedReturnIds: [...allForcedReturns],
    interruptedIds: [...interrupted],
  }
}

module.exports = {
  readAirFlightDurationMax,
  ensureFlightTracking,
  incrementFlightTurn,
  isFlightLimitReached,
  isUnitInAirCombat,
  clearAirCombatState,
  resolveAirCombatsEndOfPhase,
  findPathIntersectionCell,
  computeInterceptionMeetingCell,
  interceptionPairReadyForCombat,
}

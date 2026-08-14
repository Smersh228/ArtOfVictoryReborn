'use strict'

const { normalizeFireObject } = require('../fire/battleFireNormalize')
const recon = require('../recon/battleReconResolve')

const PATROL_MAX_TURNS = 4
/** Ходов перезарядки после вылета с боестрельбом. */
const COOLDOWN_TURNS_AFTER_FIRE = 3
/** Ходов перезарядки после патруля/разведки без стрельбы (посадка → заправка). */
const COOLDOWN_TURNS_NO_FIRE = 2

const PATROL_LIKE_ORDER_KEYS = new Set(['patrol', 'intelligenceAir'])
const STRIKE_ORDER_KEYS = new Set(['attackAir', 'bombardment'])

function isBattleAirUnit(u) {
  const t = String(u?.type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

function ensureAirSortie(unit) {
  const tac = unit.tactical && typeof unit.tactical === 'object' ? unit.tactical : {}
  unit.tactical = tac
  if (!tac.airSortie || typeof tac.airSortie !== 'object') tac.airSortie = {}
  return tac.airSortie
}

function airSortiePhase(unit) {
  const s = unit?.tactical?.airSortie
  if (!s || typeof s !== 'object') return 'ready'
  const ph = String(s.phase || '').trim()
  if (ph === 'cooldown' || ph === 'patrol' || ph === 'desant' || ph === 'inbound') return ph
  return 'ready'
}

function readFlightPathCellIds(unit) {
  const sortie = unit?.tactical?.airSortie
  if (sortie && Array.isArray(sortie.pathCellIds) && sortie.pathCellIds.length) {
    return sortie.pathCellIds.map(Number).filter(Number.isFinite)
  }
  const tac = unit?.tactical
  if (tac && Array.isArray(tac.airMissionFlightPath) && tac.airMissionFlightPath.length) {
    return tac.airMissionFlightPath.map(Number).filter(Number.isFinite)
  }
  return []
}

/** Индекс прогресса по маршруту (−1 = ещё на аэродроме после приказа). */
function readEffectivePathIndex(unit, path) {
  const sortie = unit?.tactical?.airSortie
  if (!sortie || typeof sortie !== 'object') return -1
  const phase = String(sortie.phase || '').trim()
  if (phase === 'patrol') return Math.max(0, path.length - 1)
  if (phase === 'inbound') {
    const idx = Number(sortie.pathIndex)
    return Number.isFinite(idx) ? idx : -1
  }
  if (phase === 'cooldown' && Array.isArray(sortie.returnPathCellIds) && sortie.returnPathCellIds.length) {
    const idx = Number(sortie.pathIndex)
    return Number.isFinite(idx) ? idx : -1
  }
  return -1
}

/** Гекс, где самолёт «находится» на маршруте (для перехвата и отображения). */
function readAirFlightPositionCellId(unit, physicalCellId) {
  const path = readFlightPathCellIds(unit)
  const idx = readEffectivePathIndex(unit, path)
  if (idx < 0 || !path.length) {
    const dep = Number(unit?.tactical?.airSortie?.departureCellId)
    if (Number.isFinite(dep)) return dep
    return Number(physicalCellId)
  }
  return path[Math.min(idx, path.length - 1)]
}

function hasReachedFlightPathEnd(unit) {
  const sortie = unit?.tactical?.airSortie
  if (!sortie || sortie.phase !== 'inbound') return false
  const stage = String(sortie.inboundStage || '').trim()
  if (stage === 'ordered' || stage === 'airborne') return false
  const path = readFlightPathCellIds(unit)
  if (!path.length) return false
  return readEffectivePathIndex(unit, path) >= path.length - 1
}

/** Цель перехвата: только авиация, уже находящаяся в воздухе (не на аэродроме). */
function isAirUnitAirborneForInterception(unit) {
  const sortie = unit?.tactical?.airSortie
  if (!sortie || typeof sortie !== 'object') return false
  const phase = String(sortie.phase || '').trim()
  if (phase === 'cooldown') return false
  if (phase === 'inbound') {
    const stage = String(sortie.inboundStage || '').trim()
    if (stage === 'ordered') return false
    const path = readFlightPathCellIds(unit)
    return readEffectivePathIndex(unit, path) >= 0 || stage === 'airborne'
  }
  if (phase === 'patrol') return true
  if (phase === 'desant') {
    const step = Number(sortie.desantStep)
    return Number.isFinite(step) && step >= 2
  }
  return false
}

function getAirOrderBlockReason(unit) {
  if (!isBattleAirUnit(unit)) return null
  if (unit.tactical?.airCombat) return 'воздушный бой'
  const phase = airSortiePhase(unit)
  if (phase === 'cooldown') {
    const left = Number(unit.tactical?.airSortie?.cooldownTurnsLeft)
    return left > 0 ? `перезарядка и дозаправка (${left} х.)` : 'перезарядка и дозаправка'
  }
  if (phase === 'desant') return 'на задании (десантирование)'
  if (phase === 'patrol') return 'на задании (патруль/разведка)'
  if (phase === 'inbound') return 'на задании (полёт к цели)'
  return null
}

function isInboundMissionPending(sortie) {
  if (!sortie || typeof sortie !== 'object') return false
  return !!(
    sortie.pendingStrike ||
    sortie.pendingPatrol ||
    sortie.pendingIntel ||
    sortie.pendingDesant ||
    sortie.pendingAirSupply ||
    sortie.pendingAccompaniment
  )
}

function reversePathCellIds(pathIds) {
  if (!Array.isArray(pathIds) || !pathIds.length) return []
  return [...pathIds].reverse().map((x) => Number(x)).filter((n) => Number.isFinite(n))
}

/** Сброс полей выполненной авиаразведки (временная видимость intelligenceAirRevealedCellIds снимается). */
function clearIntelligenceAirMissionFields(tac) {
  if (!tac || typeof tac !== 'object') return
  delete tac.intelligenceAirFlightPath
  delete tac.intelligenceAirTargetCellId
  delete tac.intelligenceAirRevealedCellIds
}

function clearAirMissionDisplayFields(tac) {
  if (!tac || typeof tac !== 'object') return
  delete tac.airMissionFlightPath
  delete tac.airMissionTargetCellId
  clearIntelligenceAirMissionFields(tac)
}

function logAirReturn(le, ph, unitInstanceId, fromCellId, departureCellId, returnPathIds) {
  const idsStr = returnPathIds.length ? returnPathIds.join(' → ') : '—'
  le(
    ph,
    `Возвращение: юнит ${unitInstanceId}, ${fromCellId} → база ${departureCellId}; траектория: ${idsStr}`,
    {
      airMissionLine: {
        orderKey: 'airReturn',
        unitInstanceId: Number(unitInstanceId),
        fromCellId: Number(fromCellId),
        toCellId: Number(departureCellId),
        pathCellIds: returnPathIds,
      },
    },
  )
}

function beginAirCooldown(unit, departureCellId, outboundPathIds, fromCellId, firedWeapons, le, ph) {
  const sortie = ensureAirSortie(unit)
  const tac = unit.tactical || (unit.tactical = {})
  const alreadyReturning = sortie.phase === 'cooldown' || tac.airMissionOrderKey === 'airReturn'
  const returnPathIds = reversePathCellIds(outboundPathIds)
  const cd = firedWeapons ? COOLDOWN_TURNS_AFTER_FIRE : COOLDOWN_TURNS_NO_FIRE
  sortie.phase = 'cooldown'
  sortie.cooldownTurnsLeft = cd
  sortie.cooldownTurnsMax = cd
  sortie.patrolTurnsLeft = 0
  sortie.firedWeapons = !!firedWeapons || !!sortie.firedWeapons
  sortie.departureCellId = Number(departureCellId)
  sortie.returnPathCellIds = returnPathIds
  sortie.activeOrderKey = sortie.activeOrderKey || null
  delete sortie.inboundStage
  delete sortie.inboundOrderTurn

  const endedIntel = String(sortie.activeOrderKey || '') === 'intelligenceAir'
  tac.airMissionFlightPath = returnPathIds
  tac.airMissionTargetCellId = Number(departureCellId)
  tac.airMissionOrderKey = 'airReturn'
  if (endedIntel) {
    clearIntelligenceAirMissionFields(tac)
    delete tac.reconRevealedCellIds
  }

  if (!alreadyReturning) {
    logAirReturn(le, ph, unit.instanceId, fromCellId, departureCellId, returnPathIds)
  }
}

function startInboundFlight(unit, orderKey, departureCellId, outboundPathIds, targetCellId, le, ph, extra) {
  let pathIds = Array.isArray(outboundPathIds) ? outboundPathIds.map(Number).filter(Number.isFinite) : []
  const depId = Number(departureCellId)
  const tgtId = Number(targetCellId)
  if (!pathIds.length && Number.isFinite(depId) && Number.isFinite(tgtId)) {
    pathIds = depId === tgtId ? [depId] : [depId, tgtId]
  }
  const sortie = ensureAirSortie(unit)
  sortie.phase = 'inbound'
  sortie.pathCellIds = pathIds
  sortie.pathIndex = -1
  sortie.inboundStage = 'ordered'
  sortie.departureCellId = depId
  sortie.activeOrderKey = orderKey
  sortie.cooldownTurnsLeft = 0
  sortie.patrolTurnsLeft = 0
  sortie.firedWeapons = false
  delete sortie.pendingStrike
  delete sortie.pendingPatrol
  delete sortie.pendingIntel
  delete sortie.pendingDesant
  delete sortie.pendingAirSupply
  delete sortie.pendingAccompaniment
  delete sortie.accompanimentTargetId
  delete sortie.bombardmentAreaCellIds
  delete sortie.interceptionTargetId
  delete sortie.meetingCellId
  delete sortie.appearanceLogged
  delete sortie.artilleryAppearanceSectorProcessed
  delete sortie.artilleryStrikeSectorProcessed
  delete sortie.artillerySectorShotKeys
  if (extra && typeof extra === 'object') {
    if (extra.interceptionTargetId != null) sortie.interceptionTargetId = Number(extra.interceptionTargetId)
    if (extra.meetingCellId != null) sortie.meetingCellId = Number(extra.meetingCellId)
    if (extra.pendingStrike === true) sortie.pendingStrike = true
    if (extra.pendingPatrol === true) sortie.pendingPatrol = true
    if (extra.pendingIntel === true) sortie.pendingIntel = true
    if (extra.pendingDesant === true) sortie.pendingDesant = true
    if (extra.pendingAirSupply === true) sortie.pendingAirSupply = true
    if (extra.pendingAccompaniment === true) sortie.pendingAccompaniment = true
    if (extra.accompanimentTargetId != null) sortie.accompanimentTargetId = Number(extra.accompanimentTargetId)
    if (extra.patrolRangeSteps != null) sortie.patrolRangeSteps = Math.floor(Number(extra.patrolRangeSteps))
    if (Array.isArray(extra.bombardmentAreaCellIds)) {
      sortie.bombardmentAreaCellIds = extra.bombardmentAreaCellIds.map(Number).filter(Number.isFinite)
    }
    if (extra.orderTurnIndex != null && Number.isFinite(Number(extra.orderTurnIndex))) {
      sortie.inboundOrderTurn = Math.floor(Number(extra.orderTurnIndex))
    }
  }

  const tac = unit.tactical
  tac.airMissionFlightPath = pathIds
  tac.airMissionTargetCellId = Number(targetCellId)
  tac.airMissionOrderKey = orderKey

  const ftMax = Number(unit?.airFlightTurns ?? unit?.airFlightDuration ?? unit?.flightDuration)
  if (Number.isFinite(ftMax) && ftMax > 0) sortie.flightTurnsMax = Math.floor(ftMax)
  else if (!Number.isFinite(Number(sortie.flightTurnsMax)) || Number(sortie.flightTurnsMax) <= 0) {
    sortie.flightTurnsMax = PATROL_MAX_TURNS
  }
  if (!Number.isFinite(Number(sortie.flightTurnsUsed))) sortie.flightTurnsUsed = 0

  le(
    ph,
    `Вылет: юнит ${unit.instanceId} — «${orderKey}», маршрут ${pathIds.length} кл., вылет со след. хода`,
    {
      airMissionLine: {
        orderKey,
        unitInstanceId: Number(unit.instanceId),
        fromCellId: Number(departureCellId),
        toCellId: Number(targetCellId),
        pathCellIds: pathIds,
        inboundLaunch: true,
      },
    },
  )
}

function startPatrolLikeSortie(unit, orderKey, departureCellId, outboundPathIds, targetCellId, le, ph, extra) {
  const sortie = ensureAirSortie(unit)
  sortie.phase = 'patrol'
  sortie.patrolTurnsLeft = PATROL_MAX_TURNS
  sortie.patrolTurnsMax = PATROL_MAX_TURNS
  sortie.flightTurnsUsed = 0
  sortie.firedWeapons = false
  sortie.departureCellId = Number(departureCellId)
  sortie.activeOrderKey = orderKey
  sortie.cooldownTurnsLeft = 0
  delete sortie.pathIndex
  delete sortie.inboundStage
  delete sortie.inboundOrderTurn
  if (extra && typeof extra === 'object') {
    if (extra.patrolRangeSteps != null) sortie.patrolRangeSteps = extra.patrolRangeSteps
  }

  const tac = unit.tactical
  tac.airMissionFlightPath = outboundPathIds || []
  tac.airMissionTargetCellId = Number(targetCellId)
  tac.airMissionOrderKey = orderKey

  le(
    ph,
    `На задании: юнит ${unit.instanceId} — «${orderKey}», осталось ходов ${PATROL_MAX_TURNS}`,
    { airSortieLine: { unitInstanceId: Number(unit.instanceId), orderKey, patrolTurnsLeft: PATROL_MAX_TURNS } },
  )
}

function recallAirMission(cells, unitId, le, ph, findUnitOnField, beginCooldownFn) {
  const cur = findUnitOnField(cells, unitId)
  if (!cur) {
    le(ph, `Отзыв: юнит ${unitId} не на поле`)
    return false
  }
  const sortie = cur.unit.tactical?.airSortie
  if (!sortie || sortie.phase !== 'patrol') {
    le(ph, `Отзыв: юнит ${cur.unit.instanceId} — не на патруле/разведке`)
    return false
  }
  const ok = PATROL_LIKE_ORDER_KEYS.has(String(sortie.activeOrderKey || ''))
  if (!ok) {
    le(ph, `Отзыв: юнит ${cur.unit.instanceId} — приказ нельзя отменить`)
    return false
  }
  const dep = Number(sortie.departureCellId)
  const path = Array.isArray(cur.unit.tactical?.airMissionFlightPath)
    ? cur.unit.tactical.airMissionFlightPath
    : []
  const fromId = Number(cur.unit.tactical?.airMissionTargetCellId) || Number(cur.cell.id)
  const cooldown = beginCooldownFn || beginAirCooldown
  cooldown(cur.unit, dep, path.length ? path : [fromId, dep], fromId, !!sortie.firedWeapons, le, ph)
  return true
}

function tickAirSorties(cells, le, turnIndex, extraDeps) {
  const beginCooldownFn = extraDeps?.beginAirCooldown
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || typeof sortie !== 'object') continue

      if (sortie.phase === 'cooldown') {
        let left = Number(sortie.cooldownTurnsLeft)
        if (!Number.isFinite(left) || left <= 0) {
          clearAirMissionDisplayFields(u.tactical)
          delete u.tactical.airSortie
          delete u.tactical.airMissionOrderKey
          continue
        }
        left -= 1
        sortie.cooldownTurnsLeft = left
        if (left <= 0) {
          clearAirMissionDisplayFields(u.tactical)
          delete u.tactical.airSortie
          delete u.tactical.airMissionOrderKey
          le(-1, `Авиация: юнит ${u.instanceId} — готовность к вылету`, {
            unitInstanceId: Number(u.instanceId),
            airSortieReady: true,
            turn: turnIndex,
          })
        }
        continue
      }

      if (sortie.phase === 'patrol') {
        let left = Number(sortie.patrolTurnsLeft)
        if (!Number.isFinite(left)) left = 0
        const orderKey = String(sortie.activeOrderKey || '')

        if (orderKey === 'intelligenceAir' && left > 1) {
          const maxT = Number(sortie.patrolTurnsMax) || PATROL_MAX_TURNS
          const turnNum = maxT - left + 2
          recon.resolveIntelligenceAirReconTurn({
            unit: u,
            cells,
            le,
            ph: 4,
            turnHint: `ход ${turnNum}/${maxT}`,
          })
        }

        left -= 1
        sortie.patrolTurnsLeft = left
        if (left > 0) {
          if (orderKey === 'intelligenceAir') {
            le(4, `Авиационная разведка: юнит ${u.instanceId} — на задании, осталось ${left} х.`)
          } else if (orderKey === 'patrol') {
            le(4, `Патрулирование: юнит ${u.instanceId} — на задании, осталось ${left} х.`)
          }
          continue
        }

        const dep = Number(sortie.departureCellId)
        const path = Array.isArray(u.tactical?.airMissionFlightPath) ? u.tactical.airMissionFlightPath : []
        const fromId = Number(u.tactical?.airMissionTargetCellId) || Number(c.id)
        const cooldown = beginCooldownFn || beginAirCooldown
        cooldown(u, dep, path.length ? path : [fromId, dep], fromId, !!sortie.firedWeapons, le, 4)
        continue
      }
    }
  }
}

/** Вылет: ход 0 — приказ; ход 1 — в небе; ход 2 — задание. */
function tickInboundFlights(cells, le, turnIndex) {
  const turn = Number(turnIndex)
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'inbound') continue

      let path = readFlightPathCellIds(u)
      let stage = String(sortie.inboundStage || '').trim()
      if (!stage) {
        const idx = Number(sortie.pathIndex)
        if (!Number.isFinite(idx) || idx < 0) stage = 'ordered'
        else if (idx >= path.length - 1) stage = 'arriving'
        else stage = 'airborne'
        sortie.inboundStage = stage
      }

      const orderedAt = Number(sortie.inboundOrderTurn)
      if (!Number.isFinite(orderedAt)) sortie.inboundOrderTurn = turn

      if (!path.length) {
        const depId = Number(sortie.departureCellId) || Number(c.id)
        const tgtId = Number(u.tactical?.airMissionTargetCellId)
        if (Number.isFinite(depId) && Number.isFinite(tgtId)) {
          path = depId === tgtId ? [depId] : [depId, tgtId]
          sortie.pathCellIds = path
          u.tactical.airMissionFlightPath = path
        }
      }
      if (!path.length && stage !== 'ordered') continue

      const orderKey = String(sortie.activeOrderKey || u.tactical?.airMissionOrderKey || '')
      const depCellId = Number(sortie.departureCellId) || Number(c.id)
      const edgeCellId = path.length ? path[0] : depCellId

      // Конец resolve хода приказа → «вылетел», чтобы на ходу N+1 самолёт уже был в небе.
      if (stage === 'ordered') {
        sortie.inboundStage = 'airborne'
        sortie.pathIndex = 0
        continue
      }

      if (stage === 'airborne') {
        const orderTurn = Number(sortie.inboundOrderTurn)
        // Запись в отчёт хода N+1 (не в ход приказа).
        if (turn > orderTurn && !sortie.appearanceLogged) {
          sortie.appearanceLogged = true
          le(4, `В небе появился самолёт: юнит ${u.instanceId}`, {
            airSortieLine: {
              appearance: true,
              unitInstanceId: Number(u.instanceId),
              orderKey,
              departureCellId: depCellId,
              pathCellId: edgeCellId,
            },
          })
        }
        // Задание — с хода N+1 (конец resolve хода N+1 → на ходу N+2 уже на задании).
        if (turn <= orderTurn) continue
        sortie.inboundStage = 'arriving'
        sortie.pathIndex = path.length - 1
      }
    }
  }
}

/** Удар с воздуха: дистанция боя 1 (над целевым гексом), не длина маршрута от аэродрома. */
function airStrikeCombatDistance() {
  return 1
}

function rangeArrayForAirStrike(unit, rangeArrayFor) {
  const reactive = unit.fireReactive
  if (reactive && typeof reactive === 'object') {
    const raw = reactive.range
    if (raw != null && String(raw).trim() !== '') {
      const nums = String(raw)
        .split(',')
        .map((x) => Number(String(x).trim()))
        .filter((n) => Number.isFinite(n))
      if (nums.length) return nums
    }
  }
  const parsed = unit.fireParsed || normalizeFireObject(unit._fireRaw || unit.fire)
  if (parsed?.range?.length) return parsed.range
  return rangeArrayFor(unit)
}

module.exports = {
  PATROL_MAX_TURNS,
  PATROL_LIKE_ORDER_KEYS,
  STRIKE_ORDER_KEYS,
  isBattleAirUnit,
  ensureAirSortie,
  getAirOrderBlockReason,
  airSortiePhase,
  readFlightPathCellIds,
  reversePathCellIds,
  readEffectivePathIndex,
  readAirFlightPositionCellId,
  hasReachedFlightPathEnd,
  isAirUnitAirborneForInterception,
  isInboundMissionPending,
  beginAirCooldown,
  startInboundFlight,
  startPatrolLikeSortie,
  recallAirMission,
  tickAirSorties,
  tickInboundFlights,
  airStrikeCombatDistance,
  rangeArrayForAirStrike,
}

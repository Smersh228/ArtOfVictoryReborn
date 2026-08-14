'use strict'

const { hexDistCells } = require('../map/battleHexGeometry')
const { readVisionRange } = require('../unit/battleUnitVision')
const { unitFaction, opposing, getStr } = require('../unit/battleUnitField')
const { isBattleAirUnit } = require('./battleAirSortie')
const { terrainAccuracyBonusFromCell } = require('../map/battleTerrain')

function computePatrolZoneCellIds(cells, centerCell, rangeSteps) {
  if (!centerCell || !Array.isArray(cells) || !cells.length) return []
  const cap = Math.max(1, Math.floor(Number(rangeSteps) || 1))
  const ids = new Set([Number(centerCell.id)])
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.id === centerCell.id) continue
    const d = hexDistCells(centerCell, c)
    if (d >= 1 && d <= cap) ids.add(Number(c.id))
  }
  return [...ids]
}

function readPatrolCenterCellId(unit) {
  const tac = unit?.tactical && typeof unit.tactical === 'object' ? unit.tactical : {}
  const sortie = tac.airSortie && typeof tac.airSortie === 'object' ? tac.airSortie : {}
  const id = Number(tac.airMissionTargetCellId ?? sortie.patrolCenterCellId)
  return Number.isFinite(id) ? id : null
}

/** Гекс боя / «позиция» авиации для перехвата (центр патруля, цель миссии или аэродром). */
function readAirEngagementCellId(unit, physicalCellId) {
  const airSortieMod = require('./battleAirSortie')
  const tac = unit?.tactical && typeof unit.tactical === 'object' ? unit.tactical : {}
  const sortie = tac.airSortie && typeof tac.airSortie === 'object' ? tac.airSortie : {}
  const phase = String(sortie.phase || '').trim()
  const physicalId = Number(physicalCellId)

  if (phase === 'inbound') {
    return airSortieMod.readAirFlightPositionCellId(unit, physicalCellId)
  }

  const activeKey = String(sortie.activeOrderKey ?? tac.airMissionOrderKey ?? '').trim()

  if (phase === 'patrol' && (activeKey === 'patrol' || activeKey === 'intelligenceAir')) {
    const centerId = readPatrolCenterCellId(unit)
    if (centerId != null) return centerId
  }

  if (phase === 'desant') {
    const tgt = Number(tac.airMissionTargetCellId)
    if (Number.isFinite(tgt)) return tgt
  }

  const missionKey = String(tac.airMissionOrderKey || '').trim()
  if (missionKey && missionKey !== 'airReturn' && phase !== 'cooldown') {
    const tgt = Number(tac.airMissionTargetCellId)
    if (Number.isFinite(tgt)) return tgt
  }

  return Number.isFinite(physicalId) ? physicalId : null
}

function readPatrolRangeSteps(unit) {
  const sortie = unit?.tactical?.airSortie
  const fromSortie = Number(sortie?.patrolRangeSteps)
  if (Number.isFinite(fromSortie) && fromSortie > 0) return Math.floor(fromSortie)
  return readVisionRange(unit)
}

function listActiveAirPatrols(cells) {
  const out = []
  if (!Array.isArray(cells)) return out
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    for (const u of cell.units || []) {
      if (!isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'patrol') continue
      if (String(sortie.activeOrderKey || '').trim() !== 'patrol') continue
      if (getStr(u) <= 0) continue
      out.push({ unit: u, cell })
    }
  }
  return out
}

function intruderEntersPatrolZone(pathCellIds, targetCellId, zoneSet, extraCellIds) {
  const extras = Array.isArray(extraCellIds) ? extraCellIds : []
  for (let i = 0; i < extras.length; i++) {
    const n = Number(extras[i])
    if (zoneSet.has(n)) return n
  }
  const tid = Number(targetCellId)
  if (Number.isFinite(tid) && zoneSet.has(tid)) return tid
  const path = Array.isArray(pathCellIds) ? pathCellIds : []
  for (let i = 0; i < path.length; i++) {
    const n = Number(path[i])
    if (zoneSet.has(n)) return n
  }
  return null
}

function fireAirCombatShot(attacker, attackerCell, defender, defenderCell, distance, deps, options = {}) {
  const {
    intensityArrayFor,
    rangeArrayFor,
    rangeArrayForAtCell,
    computeShoot,
    moveWarDefenseBonus,
    ordersByUnit,
    getStr: getStrFn,
    setStr,
    getAmmo,
    setAmmo,
  } = deps
  const consumeAmmo = options.consumeAmmo !== false
  if (consumeAmmo && getAmmo(attacker) < 1) return null
  const ia = intensityArrayFor(attacker, defender)
  const ra = rangeArrayForAtCell
    ? rangeArrayForAtCell(attacker, attackerCell)
    : rangeArrayFor(attacker)
  const warDef = moveWarDefenseBonus(defender.instanceId, ordersByUnit)
  const accBonus = terrainAccuracyBonusFromCell(attackerCell, attacker, defender, false)
  const res = computeShoot(
    attacker,
    defender,
    defenderCell,
    Math.max(1, Number(distance) || 1),
    ia,
    ra,
    false,
    undefined,
    warDef,
    accBonus,
    false,
    1,
  )
  if (consumeAmmo) setAmmo(attacker, getAmmo(attacker) - 1)
  const prev = getStrFn(defender)
  const dmg = Number(res.damages) || 0
  setStr(defender, prev - dmg)
  return { res, prevStr: prev, dmg, warDef: !!warDef }
}

function readPatrolCombatMaxRounds(patrolUnit) {
  const sortie = patrolUnit?.tactical?.airSortie
  const left = Number(sortie?.patrolTurnsLeft)
  const turnsLeft = Number.isFinite(left) && left > 0 ? Math.floor(left) : 4
  return Math.min(4, turnsLeft)
}

function resolvePatrolAirCombatDuel({
  cells,
  patrolId,
  intruderId,
  centerCell,
  centerId,
  engagementCell,
  engagementCellId,
  intruderOrderKey,
  maxRounds,
  le,
  ph,
  deps,
}) {
  const {
    findUnitOnField,
    getStr: getStrFn,
    logUnitDestroyed,
    sweepCorpses,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
  } = deps

  for (let round = 1; round <= maxRounds; round++) {
    let patrolLive = findUnitOnField(cells, patrolId)
    let intruderLive = findUnitOnField(cells, intruderId)
    if (!patrolLive || getStrFn(patrolLive.unit) <= 0) break
    if (!intruderLive || getStrFn(intruderLive.unit) <= 0) break

    const combatDist = Math.max(1, hexDistCells(centerCell, engagementCell))
    const patrolShot = fireAirCombatShot(
      patrolLive.unit,
      patrolLive.cell,
      intruderLive.unit,
      engagementCell,
      combatDist,
      deps,
      { consumeAmmo: false },
    )
    if (!patrolShot) break

    logUnitDestroyed(
      le,
      ph,
      intruderLive.unit,
      patrolShot.prevStr,
      'воздушный бой (патруль)',
      engagementCellId,
    )
    if (isTruckUnit(intruderLive.unit)) {
      applyCargoDamageFromTruckHit(cells, intruderLive.unit, patrolShot.dmg)
    } else if (
      isBattleAirUnit(intruderLive.unit) &&
      Array.isArray(intruderLive.unit.tactical?.carriedUnits) &&
      intruderLive.unit.tactical.carriedUnits.length
    ) {
      applyCargoDamageFromTruckHit(cells, intruderLive.unit, patrolShot.dmg)
    }
    sweepCorpses(cells)
    le(
      ph,
      `Воздушный бой (патруль) · раунд ${round}/${maxRounds}: ${patrolId} → ${intruderId} · попаданий ${patrolShot.res.hits}, урон ${patrolShot.dmg}${patrolShot.warDef ? ' [бой +1 З]' : ''} · выпало: ${patrolShot.res.rollResults.join(', ')}`,
      {
        fireLine: {
          attackerId: patrolId,
          targetId: intruderId,
          fromCellId: centerId,
          targetCellId: engagementCellId,
          hits: patrolShot.res.hits,
          damages: patrolShot.dmg,
          rollResults: patrolShot.res.rollResults,
          airOrderKey: 'patrol',
          patrolIntercept: true,
          intruderOrderKey: String(intruderOrderKey || ''),
          combatRound: round,
          combatMaxRounds: maxRounds,
        },
      },
    )

    intruderLive = findUnitOnField(cells, intruderId)
    if (!intruderLive || getStrFn(intruderLive.unit) <= 0) break

    patrolLive = findUnitOnField(cells, patrolId)
    if (!patrolLive || getStrFn(patrolLive.unit) <= 0) break

    const returnDist = Math.max(1, hexDistCells(engagementCell, patrolLive.cell))
    const returnShot = fireAirCombatShot(
      intruderLive.unit,
      intruderLive.cell,
      patrolLive.unit,
      patrolLive.cell,
      returnDist,
      deps,
      { consumeAmmo: false },
    )
    if (!returnShot) break

    logUnitDestroyed(
      le,
      ph,
      patrolLive.unit,
      returnShot.prevStr,
      'воздушный бой (ответ)',
      engagementCellId,
    )
    if (isTruckUnit(patrolLive.unit)) {
      applyCargoDamageFromTruckHit(cells, patrolLive.unit, returnShot.dmg)
    } else if (
      isBattleAirUnit(patrolLive.unit) &&
      Array.isArray(patrolLive.unit.tactical?.carriedUnits) &&
      patrolLive.unit.tactical.carriedUnits.length
    ) {
      applyCargoDamageFromTruckHit(cells, patrolLive.unit, returnShot.dmg)
    }
    sweepCorpses(cells)
    le(
      ph,
      `Воздушный бой (ответ) · раунд ${round}/${maxRounds}: ${intruderId} → ${patrolId} · попаданий ${returnShot.res.hits}, урон ${returnShot.dmg}${returnShot.warDef ? ' [бой +1 З]' : ''} · выпало: ${returnShot.res.rollResults.join(', ')}`,
      {
        fireLine: {
          attackerId: intruderId,
          targetId: patrolId,
          fromCellId: engagementCellId,
          targetCellId: Number(patrolLive.cell.id),
          hits: returnShot.res.hits,
          damages: returnShot.dmg,
          rollResults: returnShot.res.rollResults,
          airOrderKey: String(intruderOrderKey || ''),
          patrolInterceptReturn: true,
          combatRound: round,
          combatMaxRounds: maxRounds,
        },
      },
    )
  }
}

/**
 * Патруль в зоне открывает огонь по вражеской авиации, пролетающей через зону или
 * с приказом в этой зоне. Бой до уничтожения одной стороны, но не более min(4, patrolTurnsLeft)
 * раундов обмена залпами; БК не расходуется.
 * @returns {{ intruderDestroyed: boolean }}
 */
function tryPatrolInterceptsAgainstAirIntruder({
  cells,
  intruderInstanceId,
  pathCellIds,
  targetCellId,
  intruderOrderKey,
  extraZoneCellIds,
  le,
  ph,
  deps,
  engagedPairKeys,
}) {
  const { findUnitOnField, getStr: getStrFn } = deps
  const intruderId = Number(intruderInstanceId)
  if (!Number.isFinite(intruderId)) return { intruderDestroyed: false }

  let intruderLive = findUnitOnField(cells, intruderId)
  if (!intruderLive || getStrFn(intruderLive.unit) <= 0) return { intruderDestroyed: true }

  const intruderFac = unitFaction(intruderLive.unit)
  const patrols = listActiveAirPatrols(cells)
  const pairKeys = engagedPairKeys || new Set()

  for (let pi = 0; pi < patrols.length; pi++) {
    intruderLive = findUnitOnField(cells, intruderId)
    if (!intruderLive || getStrFn(intruderLive.unit) <= 0) return { intruderDestroyed: true }

    const patrolLive = findUnitOnField(cells, patrols[pi].unit.instanceId)
    if (!patrolLive || getStrFn(patrolLive.unit) <= 0) continue
    if (!opposing(unitFaction(patrolLive.unit), intruderFac)) continue

    const patrolId = Number(patrolLive.unit.instanceId)
    const pairKey = `${patrolId}:${intruderId}`
    if (pairKeys.has(pairKey)) continue

    const centerId = readPatrolCenterCellId(patrolLive.unit)
    if (centerId == null) continue
    const centerCell = cells.find((c) => Number(c.id) === centerId)
    if (!centerCell) continue

    const rangeSteps = readPatrolRangeSteps(patrolLive.unit)
    const zoneIds = computePatrolZoneCellIds(cells, centerCell, rangeSteps)
    const zoneSet = new Set(zoneIds)
    const engagementCellId = intruderEntersPatrolZone(pathCellIds, targetCellId, zoneSet, extraZoneCellIds)
    if (engagementCellId == null) continue

    pairKeys.add(pairKey)
    const engagementCell = cells.find((c) => Number(c.id) === engagementCellId) || centerCell
    const maxRounds = readPatrolCombatMaxRounds(patrolLive.unit)

    resolvePatrolAirCombatDuel({
      cells,
      patrolId,
      intruderId,
      centerCell,
      centerId,
      engagementCell,
      engagementCellId,
      intruderOrderKey,
      maxRounds,
      le,
      ph,
      deps,
    })

    intruderLive = findUnitOnField(cells, intruderId)
    if (!intruderLive || getStrFn(intruderLive.unit) <= 0) return { intruderDestroyed: true }
  }

  intruderLive = findUnitOnField(cells, intruderId)
  return { intruderDestroyed: !intruderLive || getStrFn(intruderLive.unit) <= 0 }
}

function storePatrolZoneOnSortie(unit, cells, centerCellId, rangeSteps) {
  const sortie = unit?.tactical?.airSortie
  if (!sortie || typeof sortie !== 'object') return
  const centerCell = cells.find((c) => Number(c.id) === Number(centerCellId))
  if (!centerCell) return
  const steps = Math.max(1, Math.floor(Number(rangeSteps) || readVisionRange(unit)))
  sortie.patrolCenterCellId = Number(centerCell.id)
  sortie.patrolRangeSteps = steps
  sortie.patrolZoneCellIds = computePatrolZoneCellIds(cells, centerCell, steps)
}

module.exports = {
  computePatrolZoneCellIds,
  readPatrolCenterCellId,
  readAirEngagementCellId,
  readPatrolRangeSteps,
  listActiveAirPatrols,
  intruderEntersPatrolZone,
  tryPatrolInterceptsAgainstAirIntruder,
  storePatrolZoneOnSortie,
}

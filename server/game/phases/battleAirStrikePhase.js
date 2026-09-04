'use strict'

const airSortie = require('../lib/air/battleAirSortie')
const { terrainAccuracyBonusFromCell } = require('../lib/map/battleTerrain')
const airPatrol = require('../lib/air/battleAirPatrol')
const battleDesant = require('../lib/air/battleDesant')
const battleAirCombat = require('../lib/air/battleAirCombat')
const recon = require('../lib/recon/battleReconResolve')
const artilleryAirSector = require('../lib/fire/battleArtilleryAirSector')

function beginAirCooldownWithSector(cells, unit, departureCellId, outboundPathIds, fromCellId, firedWeapons, le, ph, sectorDeps) {
  artilleryAirSector.beginAirCooldownWithSector(
    cells,
    unit,
    departureCellId,
    outboundPathIds,
    fromCellId,
    firedWeapons,
    le,
    ph,
    sectorDeps,
  )
}

const AIR_STRIKE_ORDER_KEYS = airSortie.STRIKE_ORDER_KEYS
const AIR_MISSION_ORDER_KEYS = new Set([
  'patrol',
  'accompaniment',
  'interception',
  'desant',
  'intelligenceAir',
  'airSupply',
])

function withInboundOrderTurn(deps, extra) {
  const turn = Number(deps.turnIndex)
  const base = extra && typeof extra === 'object' ? extra : {}
  return Number.isFinite(turn) ? { ...base, orderTurnIndex: turn } : base
}

/** Авто-удар по прилёту: inbound ещё не снят, validateUnitOrdersAllowed даёт ложный блок. */
function validatePendingInboundStrikeAllowed(unit) {
  if (battleAirCombat.isUnitInAirCombat(unit)) return 'воздушный бой'
  return null
}

function logAirMissionLine(le, ph, k, cur, tc, pathIds, extraMeta) {
  const labels = {
    patrol: 'Патрулирование',
    accompaniment: 'Сопровождение',
    interception: 'Перехват',
    desant: 'Десант',
    intelligenceAir: 'Авиационная разведка',
    airSupply: 'Сброс припасов',
    attackAir: 'Штурмовка',
    bombardment: 'Бомбардировка',
  }
  const label = labels[k] || k
  const idsStr = pathIds && pathIds.length ? pathIds.join(' → ') : '—'
  const prefix =
    k === 'accompaniment' && extraMeta?.accompanimentTargetUnitInstanceId != null
      ? `${label}: юнит ${cur.unit.instanceId} → с ${extraMeta.accompanimentTargetUnitInstanceId}, цель ${tc.id}`
      : `${label}: юнит ${cur.unit.instanceId}, вылет ${cur.cell.id} → назначение ${tc.id}`
  le(ph, `${prefix}; траектория: ${idsStr}`, {
    airMissionLine: {
      orderKey: k,
      unitInstanceId: Number(cur.unit.instanceId),
      fromCellId: Number(cur.cell.id),
      toCellId: Number(tc.id),
      pathCellIds: pathIds || [],
      ...extraMeta,
    },
  })
}

function resolveAirMissionOrder(cells, o, le, ph, deps) {
  const { findUnitOnField, validateUnitOrdersAllowed, ensureTacticalBattle, hexFlightPathCellIds } = deps
  const readPathIds = (fromCell, toCell) => readMissionFlightPathIds(cells, fromCell, toCell, hexFlightPathCellIds)
  const k = String(o.orderKey || '').trim()
  if (!AIR_MISSION_ORDER_KEYS.has(k)) return false
  const cur = findUnitOnField(cells, o.unitId)
  if (!cur) return false
  const block = validateUnitOrdersAllowed(cur.unit)
  if (block) {
    le(ph, `Авиация: юнит ${cur.unit.instanceId} — ${block}`)
    return true
  }

  const departureCellId = Number(cur.cell.id)

  if (k === 'accompaniment') {
    const tid = Number(o.targetUnitInstanceId)
    const escorted = findUnitOnField(cells, tid)
    if (!escorted) {
      le(ph, `Сопровождение: юнит ${cur.unit.instanceId} — сопровождаемый ${tid} не на поле`)
      return true
    }
    const cid = Number(o.targetCellId)
    const tc = cells.find((c) => Number(c.id) === cid)
    if (!tc) {
      le(ph, `Сопровождение: юнит ${cur.unit.instanceId} — клетка назначения не найдена`)
      return true
    }
    const pathIds = readPathIds(cur.cell, tc)
    battleAirCombat.ensureFlightTracking(cur.unit)
    airSortie.startInboundFlight(cur.unit, k, departureCellId, pathIds, Number(tc.id), le, ph, withInboundOrderTurn(deps, {
      pendingAccompaniment: true,
      accompanimentTargetId: tid,
    }))
    return true
  }

  const cid = Number(o.targetCellId)
  const tc = cells.find((c) => Number(c.id) === cid)
  if (!tc) {
    le(ph, `Авиаприказ «${k}»: юнит ${cur.unit.instanceId} — клетка назначения не найдена`)
    return true
  }
  const pathIds = readPathIds(cur.cell, tc)
  const extraMeta = {}

  if (k === 'patrol') {
    const pr = Number(o.patrolRangeSteps)
    if (Number.isFinite(pr) && pr > 0) {
      extraMeta.patrolRangeSteps = Math.floor(pr)
    }
    battleAirCombat.ensureFlightTracking(cur.unit)
    airSortie.startInboundFlight(cur.unit, k, departureCellId, pathIds, Number(tc.id), le, ph, withInboundOrderTurn(deps, {
      pendingPatrol: true,
      patrolRangeSteps: extraMeta.patrolRangeSteps,
    }))
    return true
  }

  if (k === 'intelligenceAir') {
    battleAirCombat.ensureFlightTracking(cur.unit)
    airSortie.startInboundFlight(cur.unit, k, departureCellId, pathIds, Number(tc.id), le, ph, withInboundOrderTurn(deps, {
      pendingIntel: true,
    }))
    return true
  }

  if (k === 'interception') {
    const tid = Number(o.targetUnitInstanceId)
    const target = findUnitOnField(cells, tid)
    if (!target) {
      le(ph, `Перехват: юнит ${cur.unit.instanceId} — цель ${tid} не на поле`)
      return true
    }
    const meeting = battleAirCombat.computeInterceptionMeetingCell(
      cells,
      cur.cell,
      target.unit,
      hexFlightPathCellIds,
    )
    if (!meeting?.meetingCellId) {
      le(ph, `Перехват: юнит ${cur.unit.instanceId} — не удалось рассчитать точку встречи`)
      return true
    }
    const meetingCell = cells.find((c) => Number(c.id) === Number(meeting.meetingCellId))
    if (!meetingCell) {
      le(ph, `Перехват: юнит ${cur.unit.instanceId} — клетка встречи не найдена`)
      return true
    }
    battleAirCombat.ensureFlightTracking(cur.unit)
    battleAirCombat.ensureFlightTracking(target.unit)
    airSortie.startInboundFlight(
      cur.unit,
      k,
      departureCellId,
      meeting.interceptorPath,
      meeting.meetingCellId,
      le,
      ph,
      withInboundOrderTurn(deps, { interceptionTargetId: tid, meetingCellId: meeting.meetingCellId }),
    )
    return true
  }

  if (k === 'desant') {
    const carried = cur.unit.tactical?.carriedUnits
    const { getStr: getStrFn } = deps
    const hasLiveCargo =
      Array.isArray(carried) && carried.some((c) => c && getStrFn(c) > 0)
    if (!hasLiveCargo) {
      le(ph, `Десант: юнит ${cur.unit.instanceId} — на борту нет десантников`)
      return true
    }
    battleDesant.capCarriedDesantToTransportStrength(cur.unit, deps)
    battleAirCombat.ensureFlightTracking(cur.unit)
    airSortie.startInboundFlight(cur.unit, k, departureCellId, pathIds, Number(tc.id), le, ph, withInboundOrderTurn(deps, {
      pendingDesant: true,
    }))
    return true
  }

  if (k === 'airSupply') {
    battleAirCombat.ensureFlightTracking(cur.unit)
    airSortie.startInboundFlight(cur.unit, k, departureCellId, pathIds, Number(tc.id), le, ph, withInboundOrderTurn(deps, {
      pendingAirSupply: true,
    }))
    return true
  }

  return false
}

function readMissionFlightPathIds(cells, fromCell, toCell, hexFlightPathCellIds) {
  const direct = hexFlightPathCellIds(cells, fromCell, toCell)
  if (Array.isArray(direct) && direct.length >= 2) return direct
  const depId = Number(fromCell?.id)
  const tgtId = Number(toCell?.id)
  if (!Number.isFinite(depId) || !Number.isFinite(tgtId)) return []
  return depId === tgtId ? [depId] : [depId, tgtId]
}

function storeAirMissionTactical(cur, o, cells, deps) {
  const { ensureTacticalBattle, hexFlightPathCellIds } = deps
  const cid = Number(o.targetCellId)
  const tc = cells.find((c) => Number(c.id) === cid)
  if (!tc) return null
  const pathIds = readMissionFlightPathIds(cells, cur.cell, tc, hexFlightPathCellIds)
  const tac = ensureTacticalBattle(cur.unit)
  tac.airMissionFlightPath = pathIds
  tac.airMissionTargetCellId = Number(tc.id)
  tac.airMissionOrderKey = String(o.orderKey || '').trim()
  return { tc, pathIds, departureCellId: Number(cur.cell.id) }
}

function resolveAirStrikeOnCell({
  atk,
  tcOnly,
  airOrderKey,
  groupedAreaFire,
  cells,
  ordersByUnit,
  le,
  ph,
  isSup,
  ammoCost,
  deps,
}) {
  const {
    countOpposingHostilesOnCell,
    collectOpposingHostilesOnCell,
    isAmbushConcealed,
    canSpotAmbushTarget,
    computeShootSalvoCore,
    ensureGroupedAreaFireBucket,
    accumulateAreaFireForShooter,
    getStr,
    areaFireHitsForTargetByOrder,
    areaFireDiceForTargetByOrder,
    findUnitOnField,
    clearAmbushOrderFully,
    rangeArrayFor,
  } = deps

  const dStrike = airSortie.airStrikeCombatDistance()
  const raAf = airSortie.rangeArrayForAirStrike(atk.unit, rangeArrayFor)

  const nOpp = countOpposingHostilesOnCell(tcOnly, atk.unit)
  if (nOpp === 0) {
    le(
      ph,
      `Авиаудар «${airOrderKey}»: юнит ${atk.unit.instanceId} → кл. ${tcOnly.id} (−${ammoCost} БК)`,
      {
        fireLine: {
          attackerId: atk.unit.instanceId,
          targetId: null,
          fromCellId: atk.cell.id,
          targetCellId: tcOnly.id,
          hits: 0,
          damages: 0,
          rollResults: [],
          warDef: false,
          isSuppression: !!isSup,
          baseDiceCount: 0,
          diceCount: 0,
          ammoCost,
          areaFireOnly: true,
          airOrderKey,
        },
      },
    )
    return true
  }

  const targetsAll = collectOpposingHostilesOnCell(tcOnly, atk.unit)
  const targets = targetsAll.filter(
    (t) => !isAmbushConcealed(t) || canSpotAmbushTarget(atk.unit, atk.cell, t, tcOnly, cells),
  )
  if (!targets.length) {
    le(
      ph,
      `Авиаудар «${airOrderKey}»: юнит ${atk.unit.instanceId} — цели в засаде не обнаружены`,
    )
    return false
  }

  const primary = targets[0]
  const salvoAf = computeShootSalvoCore(
    atk.unit,
    primary,
    tcOnly,
    dStrike,
    raAf,
    isSup,
    undefined,
    false,
    1,
    terrainAccuracyBonusFromCell(atk.cell, atk.unit, primary, false),
  )
  if (clearAmbushOrderFully(atk.unit)) {
    le(ph, `Засада снята: юнит ${atk.unit.instanceId} (авиаудар)`, {
      unitInstanceId: Number(atk.unit.instanceId),
      ambushCleared: true,
    })
  }
  const atkIdAf = Number(atk.unit.instanceId)
  const areaKey = Number(tcOnly.id)
  const areaGrouped = ensureGroupedAreaFireBucket(
    groupedAreaFire,
    areaKey,
    atkIdAf,
    salvoAf.rollResults,
    isSup,
    ammoCost,
  )
  areaGrouped.airOrderKey = airOrderKey
  accumulateAreaFireForShooter({
    atk,
    targets,
    targetCell: tcOnly,
    distance: dStrike,
    rangeArray: raAf,
    isSup,
    artilleryClosed: false,
    groupedArea: areaGrouped,
    cells,
    ordersByUnit,
    le,
    ph,
    findUnitOnField,
    getStr,
    isAmbushConcealed,
    clearAmbushOrderFully,
    computeShootSalvoCore,
    areaFireHitsForTargetByOrder,
    areaFireDiceForTargetByOrder,
  })
  return true
}

function processInboundMissionArrivals(cells, le, ph, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    getAmmo,
    setAmmo,
    getStr,
    ordersByUnit,
    sweepCorpses,
    ensureTacticalBattle,
  } = deps
  const isSup = false
  const ammoCost = 1
  const groupedAreaFire = new Map()
  const strikeArrivals = []

  for (const c of cells) {
    for (const u of c.units || []) {
      if (!airSortie.isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'inbound') continue
      if (!airSortie.hasReachedFlightPathEnd(u)) continue

      const live = findUnitOnField(cells, u.instanceId)
      if (!live || getStr(live.unit) <= 0) continue

      if (!sortie.artilleryStrikeSectorProcessed) {
        sortie.artilleryStrikeSectorProcessed = true
        artilleryAirSector.processAirInboundArrivalSectorFire(cells, live.unit, live.cell, le, ph, deps)
        const still = findUnitOnField(cells, u.instanceId)
        if (!still || getStr(still.unit) <= 0) continue
      }

      if (sortie.pendingStrike) {
        strikeArrivals.push({ unit: u, cell: c, orderKey: String(sortie.activeOrderKey || '') })
        continue
      }

      const targetCellId = Number(live.unit.tactical?.airMissionTargetCellId)
      const tc = cells.find((cell) => Number(cell.id) === targetCellId)
      const path = airSortie.readFlightPathCellIds(live.unit)
      const dep = Number(sortie.departureCellId) || Number(c.id)

      if (sortie.pendingPatrol) {
        delete sortie.pendingPatrol
        const patrolExtra = {}
        if (sortie.patrolRangeSteps != null) patrolExtra.patrolRangeSteps = sortie.patrolRangeSteps
        airSortie.startPatrolLikeSortie(
          live.unit,
          'patrol',
          dep,
          path,
          targetCellId,
          le,
          ph,
          patrolExtra,
        )
        airPatrol.storePatrolZoneOnSortie(
          live.unit,
          cells,
          targetCellId,
          patrolExtra.patrolRangeSteps ?? airPatrol.readPatrolRangeSteps(live.unit),
        )
        continue
      }

      if (sortie.pendingIntel) {
        delete sortie.pendingIntel
        const tac = ensureTacticalBattle(live.unit)
        tac.intelligenceAirFlightPath = path
        tac.intelligenceAirTargetCellId = targetCellId
        airSortie.startPatrolLikeSortie(
          live.unit,
          'intelligenceAir',
          dep,
          path,
          targetCellId,
          le,
          ph,
          {},
        )
        const intelSortie = live.unit.tactical?.airSortie
        if (intelSortie && typeof intelSortie === 'object') intelSortie.reconCenterCellId = targetCellId
        recon.resolveIntelligenceAirReconTurn({
          unit: live.unit,
          cells,
          le,
          ph,
          turnHint: `ход 1/${airSortie.PATROL_MAX_TURNS}`,
        })
        continue
      }

      if (sortie.pendingDesant) {
        delete sortie.pendingDesant
        le(ph, `Десант · десантирование: юнит ${live.unit.instanceId} → кл. ${targetCellId}`, {
          airMissionLine: {
            orderKey: 'desant',
            unitInstanceId: Number(live.unit.instanceId),
            fromCellId: dep,
            toCellId: targetCellId,
            pathCellIds: path,
            desantStep: 2,
            desantStepMax: battleDesant.DESANT_MISSION_STEPS,
          },
        })
        const landed = battleDesant.executeDesantDrop({
          cells,
          plane: live.unit,
          targetCellId,
          le,
          ph,
          deps,
        })
        battleDesant.applyDesantPostReturnEffects(cells, landed, le, ph, deps)
        beginAirCooldownWithSector(cells, live.unit, dep, path, targetCellId, false, le, ph, deps)
        continue
      }

      if (sortie.pendingAirSupply || sortie.pendingAccompaniment) {
        delete sortie.pendingAirSupply
        delete sortie.pendingAccompaniment
        delete sortie.accompanimentTargetId
        beginAirCooldownWithSector(cells, live.unit, dep, path, targetCellId, false, le, ph, deps)
        continue
      }

      const orderKey = String(sortie.activeOrderKey || live.unit.tactical?.airMissionOrderKey || '').trim()
      if (orderKey === 'interception') {
        continue
      }
      if (orderKey === 'patrol') {
        airSortie.startPatrolLikeSortie(live.unit, 'patrol', dep, path, targetCellId, le, ph, {
          patrolRangeSteps: sortie.patrolRangeSteps,
        })
        airPatrol.storePatrolZoneOnSortie(
          live.unit,
          cells,
          targetCellId,
          sortie.patrolRangeSteps ?? airPatrol.readPatrolRangeSteps(live.unit),
        )
        continue
      }
      if (orderKey === 'intelligenceAir') {
        const tac = ensureTacticalBattle(live.unit)
        tac.intelligenceAirFlightPath = path
        tac.intelligenceAirTargetCellId = targetCellId
        airSortie.startPatrolLikeSortie(live.unit, 'intelligenceAir', dep, path, targetCellId, le, ph, {})
        const intelSortie = live.unit.tactical?.airSortie
        if (intelSortie && typeof intelSortie === 'object') intelSortie.reconCenterCellId = targetCellId
        recon.resolveIntelligenceAirReconTurn({
          unit: live.unit,
          cells,
          le,
          ph,
          turnHint: `ход 1/${airSortie.PATROL_MAX_TURNS}`,
        })
        continue
      }
      if (orderKey === 'attackAir' || orderKey === 'bombardment') {
        sortie.pendingStrike = true
        strikeArrivals.push({ unit: u, cell: c, orderKey })
        continue
      }
      if (orderKey === 'desant') {
        le(ph, `Десант · десантирование: юнит ${live.unit.instanceId} → кл. ${targetCellId}`, {
          airMissionLine: {
            orderKey: 'desant',
            unitInstanceId: Number(live.unit.instanceId),
            fromCellId: dep,
            toCellId: targetCellId,
            pathCellIds: path,
            desantStep: 2,
            desantStepMax: battleDesant.DESANT_MISSION_STEPS,
          },
        })
        const landed = battleDesant.executeDesantDrop({
          cells,
          plane: live.unit,
          targetCellId,
          le,
          ph,
          deps,
        })
        battleDesant.applyDesantPostReturnEffects(cells, landed, le, ph, deps)
        beginAirCooldownWithSector(cells, live.unit, dep, path, targetCellId, false, le, ph, deps)
        continue
      }
      if (orderKey === 'airSupply' || orderKey === 'accompaniment') {
        beginAirCooldownWithSector(cells, live.unit, dep, path, targetCellId, false, le, ph, deps)
      }
    }
  }

  for (let ai = 0; ai < strikeArrivals.length; ai++) {
    const { unit, cell, orderKey } = strikeArrivals[ai]
    const atk = findUnitOnField(cells, unit.instanceId)
    if (!atk) continue
    const block = validatePendingInboundStrikeAllowed(atk.unit)
    if (block) {
      le(ph, `Авиаудар: юнит ${atk.unit.instanceId} — ${block}`)
      continue
    }
    const path = airSortie.readFlightPathCellIds(atk.unit)
    const sortie = atk.unit.tactical?.airSortie
    const targetCellId = Number(atk.unit.tactical?.airMissionTargetCellId)
    const depCellId = Number(sortie?.departureCellId) || Number(cell.id)
    const finishInboundWithoutStrike = (firedWeapons) => {
      if (sortie) delete sortie.pendingStrike
      beginAirCooldownWithSector(cells, atk.unit, depCellId, path, targetCellId, firedWeapons, le, ph, deps)
    }
    if (getAmmo(atk.unit) < ammoCost) {
      le(ph, `Авиаудар: юнит ${atk.unit.instanceId} — нет боеприпасов`)
      finishInboundWithoutStrike(false)
      continue
    }

    const tcOnly = cells.find((c) => Number(c.id) === targetCellId)
    if (!tcOnly) {
      le(ph, `Авиаудар «${orderKey}»: юнит ${atk.unit.instanceId} — клетка назначения не найдена`)
      finishInboundWithoutStrike(false)
      continue
    }

    let cellIds = [targetCellId]
    if (orderKey === 'bombardment') {
      const fromSortie = atk.unit.tactical?.airSortie?.bombardmentAreaCellIds
      if (Array.isArray(fromSortie) && fromSortie.length) {
        cellIds = fromSortie.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      } else {
        const spec = ordersByUnit?.get?.(Number(atk.unit.instanceId))
        const raw = spec?.bombardmentAreaCellIds
        if (Array.isArray(raw) && raw.length) {
          cellIds = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        }
      }
    }

    battleAirCombat.ensureFlightTracking(atk.unit)
    let spentAmmo = false
    for (const cellId of cellIds) {
      const tc = cells.find((c) => Number(c.id) === cellId)
      if (!tc) continue
      const ok = resolveAirStrikeOnCell({
        atk,
        tcOnly: tc,
        airOrderKey: orderKey,
        groupedAreaFire,
        cells,
        ordersByUnit,
        le,
        ph,
        isSup,
        ammoCost,
        deps,
      })
      if (ok && !spentAmmo) {
        setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
        spentAmmo = true
      }
      if (ok && orderKey === 'bombardment') {
        require('../lib/map/battleSettlementFire').maybeIgniteFromBombardment(atk.unit, tc, cells, le, ph)
      }
    }

    if (!spentAmmo) {
      le(ph, `Авиаудар «${orderKey}»: юнит ${atk.unit.instanceId} — удар не выполнен`)
      finishInboundWithoutStrike(false)
      continue
    }

    logAirMissionLine(le, ph, orderKey, atk, tcOnly, path, {
      bombardmentAreaCellIds: orderKey === 'bombardment' ? cellIds : undefined,
    })

    if (sortie) delete sortie.pendingStrike
    beginAirCooldownWithSector(cells, atk.unit, depCellId, path, targetCellId, true, le, ph, deps)
  }

  if (strikeArrivals.length && groupedAreaFire.size) {
    deps.resolveGroupedAreaFire({
      groupedAreaFire,
      cells,
      findUnitOnField,
      getStr: deps.getStr,
      moveWarDefenseBonus: deps.moveWarDefenseBonus,
      ordersByUnit,
      areaFireDamageFromSalvo: deps.areaFireDamageFromSalvo,
      setStr: deps.setStr,
      logUnitDestroyed: deps.logUnitDestroyed,
      isTruckUnit: deps.isTruckUnit,
      applyCargoDamageFromTruckHit: deps.applyCargoDamageFromTruckHit,
      sweepCorpses,
      steadfastnessQueue: deps.steadfastnessQueue,
      maybeDefenderReturnFireAgainstShooter: deps.maybeDefenderReturnFireAgainstShooter,
      maybeAllDefendersReturnFireForAreaImpactCell: deps.maybeAllDefendersReturnFireForAreaImpactCell,
      le,
      ph,
      sectorAggression: deps.sectorAggression,
      sectorReturnFired: deps.sectorReturnFired,
      ammoCost,
    })
    sweepCorpses(cells)
  }
}

function processAirPhase(cells, list, ordersByUnit, le, ph, steadfastnessQueue, sectorAggression, sectorReturnFired, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    getAmmo,
    setAmmo,
    sweepCorpses,
    hexFlightPathCellIds,
    ensureTacticalBattle,
  } = deps

  const ammoCost = 1

  for (const o of list) {
    if (String(o.orderKey || '').trim() === 'airRecall') {
      airSortie.recallAirMission(cells, o.unitId, le, ph, findUnitOnField, (unit, dep, path, fromId, fired, le2, ph2) =>
        beginAirCooldownWithSector(cells, unit, dep, path, fromId, fired, le2, ph2, deps),
      )
    }
  }

  for (const o of list) {
    const k = String(o.orderKey || '').trim()
    if (!AIR_STRIKE_ORDER_KEYS.has(k)) continue
    let atk = findUnitOnField(cells, o.unitId)
    if (!atk) continue
    const block = validateUnitOrdersAllowed(atk.unit)
    if (block) {
      le(ph, `Авиаудар: юнит ${atk.unit.instanceId} — ${block}`)
      continue
    }
    if (getAmmo(atk.unit) < ammoCost) {
      le(ph, `Авиаудар: юнит ${atk.unit.instanceId} — нет боеприпасов`)
      continue
    }

    const mission = storeAirMissionTactical(atk, o, cells, { ensureTacticalBattle, hexFlightPathCellIds })
    if (!mission) {
      le(ph, `Авиаудар «${k}»: юнит ${atk.unit.instanceId} — клетка назначения не найдена`)
      continue
    }

    let cellIds = []
    if (k === 'bombardment') {
      const raw = o.bombardmentAreaCellIds
      if (Array.isArray(raw) && raw.length) {
        cellIds = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      }
    }
    if (!cellIds.length) {
      const cid = Number(o.targetCellId)
      if (Number.isFinite(cid)) cellIds = [cid]
    }
    if (!cellIds.length) {
      le(ph, `Авиаудар «${k}»: юнит ${atk.unit.instanceId} — нет клеток для удара`)
      continue
    }

    battleAirCombat.ensureFlightTracking(atk.unit)
    airSortie.startInboundFlight(
      atk.unit,
      k,
      mission.departureCellId,
      mission.pathIds,
      Number(mission.tc.id),
      le,
      ph,
      withInboundOrderTurn(deps, {
        pendingStrike: true,
        bombardmentAreaCellIds: k === 'bombardment' ? cellIds : undefined,
      }),
    )
  }

  sweepCorpses(cells)

  const newDesantUnitIds = new Set(
    list
      .filter((o) => String(o.orderKey || '').trim() === 'desant')
      .map((o) => Number(o.unitId))
      .filter((n) => Number.isFinite(n)),
  )
  battleDesant.processOngoingDesantMissions(cells, newDesantUnitIds, le, ph, {
    ...deps,
    beginAirCooldown: (unit, dep, path, fromId, fired, le2, ph2) =>
      beginAirCooldownWithSector(cells, unit, dep, path, fromId, fired, le2, ph2, deps),
  })
  sweepCorpses(cells)

  for (const o of list) {
    const k = String(o.orderKey || '').trim()
    if (k === 'airRecall' || AIR_STRIKE_ORDER_KEYS.has(k)) continue
    resolveAirMissionOrder(cells, o, le, ph, deps)
  }
  sweepCorpses(cells)

  battleAirCombat.resolveAirCombatsEndOfPhase(cells, list, le, ph, {
    ...deps,
    ordersByUnit,
    hexFlightPathCellIds,
    beginAirCooldown: (unit, dep, path, fromId, fired, le2, ph2) =>
      beginAirCooldownWithSector(cells, unit, dep, path, fromId, fired, le2, ph2, deps),
  })
  sweepCorpses(cells)
}

function processAirAppearanceSectorFires(cells, le, ph, deps) {
  for (let ci = 0; ci < cells.length; ci++) {
    const c = cells[ci]
    for (const u of c.units || []) {
      if (!airSortie.isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'inbound') continue
      if (!sortie.appearanceLogged) continue
      const live = deps.findUnitOnField(cells, u.instanceId)
      if (!live || deps.getStr(live.unit) <= 0) continue
      artilleryAirSector.processAirAppearanceSectorFire(cells, live.unit, live.cell, le, ph, deps)
    }
  }
}

function processAirInboundEndOfTurn(cells, le, ph, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    getAmmo,
    setAmmo,
    getStr,
    ordersByUnit,
    sweepCorpses,
    ensureTacticalBattle,
    steadfastnessQueue,
    sectorAggression,
    sectorReturnFired,
  } = deps
  const turnIndex = Number(deps.turnIndex)
  airSortie.tickInboundFlights(cells, le, Number.isFinite(turnIndex) ? turnIndex : 0)
  processAirAppearanceSectorFires(cells, le, ph, deps)
  sweepCorpses(cells)
  processInboundMissionArrivals(cells, le, ph, {
    ...deps,
    ordersByUnit,
    steadfastnessQueue,
    sectorAggression,
    sectorReturnFired,
    sweepCorpses,
    ensureTacticalBattle,
    findUnitOnField,
    validateUnitOrdersAllowed,
    getAmmo,
    setAmmo,
    getStr,
  })
  sweepCorpses(cells)
}

module.exports = {
  processAirPhase,
  processAirInboundEndOfTurn,
  processAirStrikePhase: processAirPhase,
  AIR_STRIKE_ORDER_KEYS,
  AIR_MISSION_ORDER_KEYS,
}

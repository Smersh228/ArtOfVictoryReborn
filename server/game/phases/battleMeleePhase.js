'use strict'

const { terrainAccuracyBonusFromCell } = require('../lib/map/battleTerrain')
const { hillMeleeDefenseBonus, hillMeleeAccuracyPenalty, isBattleAirUnitType } = require('../lib/map/battleElevation')
const mines = require('../lib/map/battleMines')
const trench = require('../lib/map/battleTrench')
const analog = require('../lib/unit/battleMeleeAnalog')
const flank = require('../lib/map/battleFlank')
const suppression = require('../core/battleSuppression')
const { isTruckUnit, isInfantryUnit } = require('../core/battleUnitType')

function orderKeyOf(id, ordersByUnit) {
  const spec = ordersByUnit && typeof ordersByUnit.get === 'function' ? ordersByUnit.get(Number(id)) : null
  return spec ? String(spec.orderKey || '').trim() : ''
}

function afterMeleeRoundDisembark(cells, idA, idB, le, ph, deps) {
  const { findUnitOnField } = deps
  const A = findUnitOnField(cells, idA)
  const B = findUnitOnField(cells, idB)
  if (A && isTruckUnit(A.unit) && B) {
    analog.disembarkInfantryAfterTransportMelee(cells, A.unit, B.unit, le, ph, {
      ...deps,
      isInfantryUnit,
      linkMeleeOpponents,
    })
  }
  if (B && isTruckUnit(B.unit) && A) {
    analog.disembarkInfantryAfterTransportMelee(cells, B.unit, A.unit, le, ph, {
      ...deps,
      isInfantryUnit,
      linkMeleeOpponents,
    })
  }
}

function syncMeleeLinksAfterCasualties(cells, deps) {
  const { getStr, findUnitOnField, hexDistCells } = deps
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      const t = u.tactical
      if (!t || t.meleeOpponentInstanceId == null) continue
      const oid = Number(t.meleeOpponentInstanceId)
      const o = findUnitOnField(cells, oid)
      if (!o || getStr(o.unit) <= 0) {
        delete t.meleeOpponentInstanceId
        continue
      }
      if (Number(o.unit.tactical?.meleeOpponentInstanceId) !== Number(u.instanceId)) {
        delete t.meleeOpponentInstanceId
        continue
      }
      if (hexDistCells(c, o.cell) > 1) {
        delete t.meleeOpponentInstanceId
        delete o.unit.tactical.meleeOpponentInstanceId
      }
    }
  }
}

function linkMeleeOpponents(ua, ub, deps) {
  const { ensureTacticalBattle } = deps
  ensureTacticalBattle(ua).meleeOpponentInstanceId = Number(ub.instanceId)
  ensureTacticalBattle(ub).meleeOpponentInstanceId = Number(ua.instanceId)
}

function resolveMutualMeleeRound(cells, ordersByUnit, le, ph, idA, idB, deps) {
  const {
    findUnitOnField,
    hexDistCells,
    moveWarDefenseBonus,
    rangeArrayFor,
    rangeArrayForAtCell,
    getAmmo,
    intensityArrayFor,
    computeShoot,
    setAmmo,
    setStr,
    getStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
  } = deps
  const raAt =
    typeof rangeArrayForAtCell === 'function' ? rangeArrayForAtCell : (u) => (typeof rangeArrayFor === 'function' ? rangeArrayFor(u) : [3, 2, 1])
  const A = findUnitOnField(cells, idA)
  const B = findUnitOnField(cells, idB)
  if (!A || !B) return { dmgToA: 0, dmgToB: 0 }
  if (isBattleAirUnitType(A.unit) || isBattleAirUnitType(B.unit)) return { dmgToA: 0, dmgToB: 0 }
  if (hexDistCells(A.cell, B.cell) > 1) return { dmgToA: 0, dmgToB: 0 }

  const warDefA = moveWarDefenseBonus(idA, ordersByUnit)
  const warDefB = moveWarDefenseBonus(idB, ordersByUnit)
  const ambushDefA = A.unit.tactical?.ambushOrder ? 1 : 0
  const ambushDefB = B.unit.tactical?.ambushOrder ? 1 : 0
  const coverOptsB = {
    ignoreTrench: flank.trenchCoverIgnoredForAttack(B.unit, A.cell, B.cell, {
      getStr,
      unitFaction: deps.unitFaction,
    }),
  }
  const coverOptsA = {
    ignoreTrench: flank.trenchCoverIgnoredForAttack(A.unit, B.cell, A.cell, {
      getStr,
      unitFaction: deps.unitFaction,
    }),
  }
  const coverA = trench.unitCoverDefenseBonus(A.unit, B.cell, A.cell, coverOptsA)
  const coverB = trench.unitCoverDefenseBonus(B.unit, A.cell, B.cell, coverOptsB)

  const raA = raAt(A.unit, A.cell)
  const raB = raAt(B.unit, B.cell)
  const closeA = A.unit.tactical?.fireSuppression
    ? suppression.suppressionMeleeAccuracy(A.unit, raAt, A.cell)
    : raA[0] ?? 3
  const closeB = B.unit.tactical?.fireSuppression
    ? suppression.suppressionMeleeAccuracy(B.unit, raAt, B.cell)
    : raB[0] ?? 3
  const hillDefB = hillMeleeDefenseBonus(B.cell)
  const hillDefA = hillMeleeDefenseBonus(A.cell)
  const hillPenOnB = hillMeleeAccuracyPenalty(B.cell)
  const hillPenOnA = hillMeleeAccuracyPenalty(A.cell)

  let dmgToB = 0
  let dmgToA = 0
  const rollsA = []
  const rollsB = []

  const silentId = Number(deps.retreatSilentId)
  const aShoots = getAmmo(A.unit) >= 1 && Number(idA) !== silentId
  const bShoots = getAmmo(B.unit) >= 1 && Number(idB) !== silentId

  if (aShoots) {
    const ia = intensityArrayFor(A.unit, B.unit)
    const accBonusA = terrainAccuracyBonusFromCell(A.cell, A.unit, B.unit, true) - hillPenOnB
    const res = computeShoot(A.unit, B.unit, B.cell, 1, ia, [closeA], false, undefined, warDefB + coverB + ambushDefB + hillDefB, accBonusA, undefined, 1)
    dmgToB = res.damages
    for (const r of res.rollResults) rollsA.push(r)
    setAmmo(A.unit, getAmmo(A.unit) - 1)
  }

  if (getStr(A.unit) > 0 && bShoots) {
    const ia = intensityArrayFor(B.unit, A.unit)
    const accBonusB = terrainAccuracyBonusFromCell(B.cell, B.unit, A.unit, true) - hillPenOnA
    const res = computeShoot(B.unit, A.unit, A.cell, 1, ia, [closeB], false, undefined, warDefA + coverA + ambushDefA + hillDefA, accBonusB, undefined, 1)
    dmgToA = res.damages
    for (const r of res.rollResults) rollsB.push(r)
    setAmmo(B.unit, getAmmo(B.unit) - 1)
  }

  if (getStr(B.unit) > 0) {
    const prevBStr = getStr(B.unit)
    setStr(B.unit, prevBStr - dmgToB)
    logUnitDestroyed(le, ph, B.unit, prevBStr, 'ближний бой', B.cell?.id)
    if (isTruckUnit(B.unit)) applyCargoDamageFromTruckHit(cells, B.unit, dmgToB)
  }
  if (getStr(A.unit) > 0) {
    const prevAStr = getStr(A.unit)
    setStr(A.unit, prevAStr - dmgToA)
    logUnitDestroyed(le, ph, A.unit, prevAStr, 'ближний бой', A.cell?.id)
    if (isTruckUnit(A.unit)) applyCargoDamageFromTruckHit(cells, A.unit, dmgToA)
  }

  le(ph, `Ближний бой: ${idA}↔${idB}, урон ${dmgToB}/${dmgToA} (выпало: [${rollsA.join(',')}] / [${rollsB.join(',')}])`, {
    attackLine: {
      attackerId: idA,
      targetId: idB,
      fromCellId: A.cell.id,
      targetCellId: B.cell.id,
      hits: 0,
      damages: dmgToB,
      rollResults: rollsA.length ? rollsA : rollsB,
    },
  })

  sweepCorpses(cells)
  syncMeleeLinksAfterCasualties(cells, deps)
  afterMeleeRoundDisembark(cells, idA, idB, le, ph, deps)

  const aLive = findUnitOnField(cells, idA)
  const bLive = findUnitOnField(cells, idB)
  if (aLive && bLive && hexDistCells(aLive.cell, bLive.cell) <= 1 && getStr(aLive.unit) > 0 && getStr(bLive.unit) > 0) {
    linkMeleeOpponents(aLive.unit, bLive.unit, deps)
  }
  return { dmgToA, dmgToB }
}

function attackMoveAlongPath(cells, unitId, path, ordersByUnit, le, ph, movedInstanceIds, deps) {
  const {
    findUnitOnField,
    getMovePoint,
    terrainEntryCost,
    tryDefendOverwatchOnMovePath,
    getStr,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
    setMovePoint,
    isTruckUnit,
    syncCargoAfterTransportMove,
    revealAmbushesAdjacentToCell,
  } = deps
  const cur0 = findUnitOnField(cells, unitId)
  if (!cur0) return { ok: false, died: true }
  const mp = getMovePoint(cur0.unit)
  if (mp <= 0 || path.length < 2) return { ok: true, interrupted: false, noMp: true }
  let maxSteps = 0
  let spentAcc = 0
  for (let i = 1; i < path.length; i++) {
    const c = terrainEntryCost(path[i], cur0.unit)
    if (spentAcc + c > mp) break
    spentAcc += c
    maxSteps = i
  }
  if (maxSteps < 1) return { ok: true, interrupted: false, noMp: true }
  trench.leaveTrench(cur0.unit, cur0.cell)
  const subPath = path.slice(0, maxSteps + 1)
  const minePlan = mines.planMinePath(subPath, cur0.unit, 'attack', isTruckUnit)
  const mineCappedPath = subPath.slice(0, minePlan.endIndex + 1)
  const ow = tryDefendOverwatchOnMovePath(cells, unitId, mineCappedPath, ordersByUnit, le, ph)
  const afterOw = findUnitOnField(cells, unitId)
  if (!afterOw || getStr(afterOw.unit) <= 0) return { ok: false, died: true }
  const endStepIndex = ow.fired && ow.stopStepIndex != null ? ow.stopStepIndex : minePlan.endIndex
  const finalCell = subPath[endStepIndex]
  let spent = 0
  for (let i = 1; i <= endStepIndex; i++) {
    spent += terrainEntryCost(subPath[i], afterOw.unit)
  }
  removeUnitFromCell(afterOw.cell, unitId)
  addUnitToCell(finalCell, afterOw.unit)
  syncUnitCoor(afterOw.unit, finalCell)
  setMovePoint(afterOw.unit, getMovePoint(afterOw.unit) - spent)
  const mineStop =
    (minePlan.blasts.length > 0 || (minePlan.reveals || []).some((r) => r.reason === 'enter')) &&
    endStepIndex < subPath.length - 1
  const note = ow.fired ? ', прерван обороной/засадой' : mineStop ? ', остановлено минным полем' : ''
  le(ph, `Атака-подход: юнит ${unitId} → кл. ${finalCell.id} (−${spent} ОД)${note}`)
  mines.resolveMineBlastsAfterMove(cells, afterOw.unit, subPath, minePlan, endStepIndex, le, ph, deps)
  mines.resolveMineRevealsAfterMove(cells, afterOw.unit, subPath, minePlan, endStepIndex, le, ph)
  const afterMine = findUnitOnField(cells, unitId)
  if (!afterMine || getStr(afterMine.unit) <= 0) return { ok: false, died: true }
  if (isTruckUnit(afterMine.unit)) syncCargoAfterTransportMove(cells, unitId)
  revealAmbushesAdjacentToCell(cells, afterMine.unit, afterMine.cell, le, ph)
  if (movedInstanceIds) movedInstanceIds.add(Number(unitId))
  return { ok: true, interrupted: !!ow.fired || mineStop }
}

function runOngoingMeleeRounds(cells, ordersByUnit, le, ph, deps) {
  const { getStr, getMeleeOpponentId, findUnitOnField, hexDistCells } = deps
  syncMeleeLinksAfterCasualties(cells, deps)
  const done = new Set()
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      const ida = Number(u.instanceId)
      const oid = getMeleeOpponentId(u)
      if (oid == null) continue
      const k = ida < oid ? `${ida}-${oid}` : `${oid}-${ida}`
      const o = findUnitOnField(cells, oid)
      if (!o || getStr(o.unit) <= 0) continue
      if (Number(o.unit.tactical?.meleeOpponentInstanceId) !== ida) continue
      if (hexDistCells(c, o.cell) > 1) continue
      if (done.has(k)) continue
      if (orderKeyOf(ida, ordersByUnit) === 'move' || orderKeyOf(oid, ordersByUnit) === 'move') continue
      done.add(k)
      resolveMutualMeleeRound(cells, ordersByUnit, le, ph, ida, oid, deps)
    }
  }
}

function processSingleAttackOrder(cells, o, ordersByUnit, le, ph, movedInstanceIds, deps) {
  const {
    findUnitOnField,
    opposing,
    unitFaction,
    validateUnitOrdersAllowed,
    isSolitaryMeleeTargetCell,
    isAmbushConcealed,
    canSpotAmbushTarget,
    isHiddenConcealed,
    canSpotHiddenTarget,
    getMeleeOpponentId,
    hexDistCells,
    computeRevealedCellIdsForFaction,
    cheapestEngagePath,
    attackReachBudget,
    getMovePoint,
    attackMoveAlongPath,
    revealAmbushesAdjacentToCell,
    tryAttackMoraleTests,
    moveAttackerOntoMeleeTargetCell,
  } = deps
  const atk = findUnitOnField(cells, o.unitId)
  const def = findUnitOnField(cells, o.targetUnitInstanceId)
  if (!atk || !def) return
  if (isBattleAirUnitType(atk.unit) || isBattleAirUnitType(def.unit)) {
    le(ph, `Атака: ближний бой с авиацией не проводится`)
    return
  }
  if (!opposing(unitFaction(atk.unit), unitFaction(def.unit))) return
  if (require('../lib/map/battleSmoke').hasSmokeOnCell(def.cell.builds)) {
    le(ph, `Атака: юнит ${o.unitId} — цель в дымовой завесе`)
    return
  }
  const atkSt = validateUnitOrdersAllowed(atk.unit, o.orderKey)
  if (atkSt) {
    le(ph, `Атака: юнит ${o.unitId} — ${atkSt}`)
    return
  }
  if (!isSolitaryMeleeTargetCell(atk.unit, def)) {
    le(ph, `Атака: юнит ${o.unitId} — на гексе цели несколько противников (ближний бой только по одиночной цели)`)
    return
  }
  if (isAmbushConcealed(def.unit) && !canSpotAmbushTarget(atk.unit, atk.cell, def.unit, def.cell, cells)) {
    le(ph, `Атака: юнит ${o.unitId} — цель в засаде, не обнаружена (нужен соседний гекс, союзник рядом с ней или огонь по площади)`)
    return
  }
  if (isHiddenConcealed && isHiddenConcealed(def.unit) && canSpotHiddenTarget && !canSpotHiddenTarget(atk.unit, atk.cell, def.unit, def.cell, cells)) {
    le(ph, `Атака: юнит ${o.unitId} — скрытый отряд не обнаружен`)
    return
  }

  const tid = Number(o.targetUnitInstanceId)
  const oppid = getMeleeOpponentId(atk.unit)
  if (oppid != null && oppid !== tid) {
    le(ph, `Атака: ${o.unitId} — уже в ближнем бою с ${oppid}`)
    return
  }
  if (oppid === tid && hexDistCells(atk.cell, def.cell) <= 1) return

  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(atk.unit))
  let approachPath = Array.isArray(o.collisionPath) ? o.collisionPath : null
  if (!approachPath) {
    const ce0 = cheapestEngagePath(cells, atk.cell, atk.unit, def.cell, fog)
    if (!ce0 || ce0.cost > attackReachBudget(atk.unit)) {
      le(ph, `Атака: ${o.unitId} — цель вне досягаемости (ОП−1)`)
      return
    }
    approachPath = ce0.path
  }
  if (hexDistCells(atk.cell, def.cell) > 1) {
    if (!approachPath || approachPath.length < 2) {
      le(ph, `Атака: ${o.unitId} — маршрут подхода прерван`)
      return
    }
    const r = attackMoveAlongPath(cells, o.unitId, approachPath, ordersByUnit, le, ph, movedInstanceIds)
    if (!r.ok || r.died) return
  }

  const aEnd = findUnitOnField(cells, o.unitId)
  const dEnd = findUnitOnField(cells, tid)
  if (!aEnd || !dEnd) return
  if (!isSolitaryMeleeTargetCell(aEnd.unit, dEnd)) {
    le(ph, `Атака: юнит ${o.unitId} — на гексе цели несколько противников (ближний бой только по одиночной цели)`)
    return
  }
  if (hexDistCells(aEnd.cell, dEnd.cell) <= 1) {
    revealAmbushesAdjacentToCell(cells, aEnd.unit, aEnd.cell, le, ph)
    if (isHiddenConcealed && isHiddenConcealed(dEnd.unit) && canSpotHiddenTarget && !canSpotHiddenTarget(aEnd.unit, aEnd.cell, dEnd.unit, dEnd.cell, cells)) {
      le(ph, `Атака: юнит ${o.unitId} — скрытый отряд не обнаружен`)
      return
    }
    if (!tryAttackMoraleTests(le, ph, aEnd, dEnd, o.orderKey)) return
    const approachCell = aEnd.cell
    analog.tryFlankSteadfastness(le, ph, dEnd.unit, dEnd.cell, approachCell, { ...deps, cells })
    const suppressedTarget = Boolean(dEnd.unit.tactical && dEnd.unit.tactical.fireSuppression)
    moveAttackerOntoMeleeTargetCell(cells, Number(aEnd.unit.instanceId), Number(dEnd.unit.instanceId))
    const a2 = findUnitOnField(cells, o.unitId)
    const d2 = findUnitOnField(cells, tid)
    if (!a2 || !d2) return
    resolveMutualMeleeRound(cells, ordersByUnit, le, ph, Number(a2.unit.instanceId), Number(d2.unit.instanceId), deps)
    const d3 = findUnitOnField(cells, tid)
    if (suppressedTarget && d3 && deps.getStr(d3.unit) > 0 && d3.unit.tactical && d3.unit.tactical.fireSuppression) {
      analog.tryForcedRetreat(cells, d3.unit, approachCell, le, ph, { ...deps, cells })
    }
  }
}

module.exports = {
  syncMeleeLinksAfterCasualties,
  linkMeleeOpponents,
  resolveMutualMeleeRound,
  attackMoveAlongPath,
  runOngoingMeleeRounds,
  processSingleAttackOrder,
  applyAttackApproachCollisions,
}

function applyAttackApproachCollisions(cells, list, le, ph, deps) {
  const {
    findUnitOnField,
    unitFaction,
    hexDistCells,
    computeRevealedCellIdsForFaction,
    cheapestEngagePath,
    attackReachBudget,
  } = deps
  const collision = require('../lib/map/battleMoveCollision')
  const intents = []
  for (const o of list) {
    const atk = findUnitOnField(cells, o.unitId)
    const def = findUnitOnField(cells, o.targetUnitInstanceId)
    if (!atk || !def) continue
    if (hexDistCells(atk.cell, def.cell) <= 1) continue
    const fog = computeRevealedCellIdsForFaction(cells, unitFaction(atk.unit))
    const ce = cheapestEngagePath(cells, atk.cell, atk.unit, def.cell, fog)
    if (!ce || !ce.path || ce.cost > attackReachBudget(atk.unit)) continue
    intents.push({
      unitId: o.unitId,
      faction: unitFaction(atk.unit),
      path: ce.path.slice(),
      unit: atk.unit,
      order: o,
    })
  }
  collision.resolveMovementCollisions(intents, le, ph, { cells, findUnitOnField })
  for (const it of intents) it.order.collisionPath = it.path
}

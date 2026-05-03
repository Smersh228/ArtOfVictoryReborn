'use strict'

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
  const A = findUnitOnField(cells, idA)
  const B = findUnitOnField(cells, idB)
  if (!A || !B) return
  if (hexDistCells(A.cell, B.cell) > 1) return

  const warDefA = moveWarDefenseBonus(idA, ordersByUnit)
  const warDefB = moveWarDefenseBonus(idB, ordersByUnit)
  const ambDefA = A.unit.tactical?.defendOrder || A.unit.tactical?.ambushOrder ? 1 : 0
  const ambDefB = B.unit.tactical?.defendOrder || B.unit.tactical?.ambushOrder ? 1 : 0

  const raA = rangeArrayFor(A.unit)
  const raB = rangeArrayFor(B.unit)
  const closeA = A.unit.tactical?.fireSuppression ? 1 : raA[0] ?? 3
  const closeB = B.unit.tactical?.fireSuppression ? 1 : raB[0] ?? 3

  let dmgToB = 0
  let dmgToA = 0
  const rollsA = []
  const rollsB = []

  if (getAmmo(A.unit) >= 1) {
    const ia = intensityArrayFor(A.unit, B.unit)
    const res = computeShoot(A.unit, B.unit, B.cell, 1, ia, [closeA], false, undefined, warDefB + ambDefB, 0, undefined, 1)
    dmgToB = res.damages
    for (const r of res.rollResults) rollsA.push(r)
    setAmmo(A.unit, getAmmo(A.unit) - 1)
  } else {
    setStr(A.unit, 0)
    le(ph, `Ближний бой: юнит ${idA} без БК — выбытие`)
  }

  if (getStr(A.unit) > 0 && getAmmo(B.unit) >= 1) {
    const ia = intensityArrayFor(B.unit, A.unit)
    const res = computeShoot(B.unit, A.unit, A.cell, 1, ia, [closeB], false, undefined, warDefA + ambDefA, 0, undefined, 1)
    dmgToA = res.damages
    for (const r of res.rollResults) rollsB.push(r)
    setAmmo(B.unit, getAmmo(B.unit) - 1)
  } else if (getStr(B.unit) > 0 && getAmmo(B.unit) < 1) {
    setStr(B.unit, 0)
    le(ph, `Ближний бой: юнит ${idB} без БК — выбытие`)
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

  const aLive = findUnitOnField(cells, idA)
  const bLive = findUnitOnField(cells, idB)
  if (aLive && bLive && hexDistCells(aLive.cell, bLive.cell) <= 1 && getStr(aLive.unit) > 0 && getStr(bLive.unit) > 0) {
    linkMeleeOpponents(aLive.unit, bLive.unit, deps)
  }
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
  const subPath = path.slice(0, maxSteps + 1)
  const ow = tryDefendOverwatchOnMovePath(cells, unitId, subPath, ordersByUnit, le, ph)
  const afterOw = findUnitOnField(cells, unitId)
  if (!afterOw || getStr(afterOw.unit) <= 0) return { ok: false, died: true }
  const endStepIndex = ow.fired && ow.stopStepIndex != null ? ow.stopStepIndex : maxSteps
  const finalCell = subPath[endStepIndex]
  let spent = 0
  for (let i = 1; i <= endStepIndex; i++) {
    spent += terrainEntryCost(subPath[i], afterOw.unit)
  }
  removeUnitFromCell(afterOw.cell, unitId)
  addUnitToCell(finalCell, afterOw.unit)
  syncUnitCoor(afterOw.unit, finalCell)
  setMovePoint(afterOw.unit, getMovePoint(afterOw.unit) - spent)
  if (isTruckUnit(afterOw.unit)) syncCargoAfterTransportMove(cells, unitId)
  const note = ow.fired ? ', прерван обороной/засадой' : ''
  le(ph, `Атака-подход: юнит ${unitId} → кл. ${finalCell.id} (−${spent} ОД)${note}`)
  revealAmbushesAdjacentToCell(cells, afterOw.unit, finalCell, le, ph)
  if (movedInstanceIds) movedInstanceIds.add(Number(unitId))
  return { ok: true, interrupted: !!ow.fired }
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
  if (!opposing(unitFaction(atk.unit), unitFaction(def.unit))) return
  const atkSt = validateUnitOrdersAllowed(atk.unit)
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

  const tid = Number(o.targetUnitInstanceId)
  const oppid = getMeleeOpponentId(atk.unit)
  if (oppid != null && oppid !== tid) {
    le(ph, `Атака: ${o.unitId} — уже в ближнем бою с ${oppid}`)
    return
  }
  if (oppid === tid && hexDistCells(atk.cell, def.cell) <= 1) return

  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(atk.unit))
  const ce0 = cheapestEngagePath(cells, atk.cell, atk.unit, def.cell, fog)
  if (!ce0 || ce0.cost > attackReachBudget(atk.unit)) {
    le(ph, `Атака: ${o.unitId} — цель вне досягаемости (ОП−1)`)
    return
  }

  let guard = 0
  while (guard++ < 32) {
    const cur = findUnitOnField(cells, o.unitId)
    const dfc = findUnitOnField(cells, tid)
    if (!cur || !dfc) return
    if (hexDistCells(cur.cell, dfc.cell) <= 1) break
    if (getMovePoint(cur.unit) <= 0) break
    const ce = cheapestEngagePath(cells, cur.cell, cur.unit, dfc.cell, fog)
    if (!ce) break
    const r = attackMoveAlongPath(cells, o.unitId, ce.path, ordersByUnit, le, ph, movedInstanceIds)
    if (!r.ok || r.died) return
    if (r.interrupted || r.noMp) break
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
    if (!tryAttackMoraleTests(le, ph, aEnd, dEnd)) return
    moveAttackerOntoMeleeTargetCell(cells, Number(aEnd.unit.instanceId), Number(dEnd.unit.instanceId))
    const a2 = findUnitOnField(cells, o.unitId)
    const d2 = findUnitOnField(cells, tid)
    if (!a2 || !d2) return
    resolveMutualMeleeRound(cells, ordersByUnit, le, ph, Number(a2.unit.instanceId), Number(d2.unit.instanceId), deps)
  }
}

module.exports = {
  syncMeleeLinksAfterCasualties,
  linkMeleeOpponents,
  resolveMutualMeleeRound,
  attackMoveAlongPath,
  runOngoingMeleeRounds,
  processSingleAttackOrder,
}

'use strict'

function maybeAllDefendersReturnFireForAreaImpactCell(
  cells,
  shooterInstanceId,
  impactCellId,
  ordersByUnit,
  le,
  ph,
  steadfastnessQueue,
  sectorAggression,
  sectorReturnFired,
  deps,
) {
  const { findUnitOnField, getStr, opposing, unitFaction } = deps
  const atk = findUnitOnField(cells, shooterInstanceId)
  if (!atk) return
  const impactNum = Number(impactCellId)
  if (!Number.isFinite(impactNum)) return
  for (let ci = 0; ci < cells.length; ci++) {
    const defCell = cells[ci]
    const us = defCell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const du = us[ui]
      if (getStr(du) <= 0) continue
      if (!du.tactical || (!du.tactical.defendOrder && !du.tactical.ambushOrder)) continue
      if (!opposing(unitFaction(du), unitFaction(atk.unit))) continue
      const sec = du.defendSectorCellIds
      if (!Array.isArray(sec) || !sec.length) continue
      const secSet = new Set(sec.map((x) => Number(x)))
      if (!secSet.has(impactNum)) continue
      const defIid = Number(du.instanceId)
      if (!Number.isFinite(defIid)) continue
      maybeDefenderReturnFireAgainstShooter(
        cells,
        shooterInstanceId,
        defIid,
        ordersByUnit,
        le,
        ph,
        steadfastnessQueue,
        sectorAggression,
        sectorReturnFired,
        impactCellId,
        deps,
      )
    }
  }
}

function maybeDefenderReturnFireAgainstShooter(
  cells,
  shooterInstanceId,
  defenderInstanceId,
  ordersByUnit,
  le,
  ph,
  steadfastnessQueue,
  sectorAggression,
  sectorReturnFired,
  fireImpactCellId,
  deps,
) {
  const {
    findUnitOnField,
    getStr,
    defenderSeesCellForOverwatch,
    getAmmo,
    hexDist,
    rangeArrayFor,
    rangeArrayAmbushAccuracyBonus,
    fireRangeTableMode,
    intensityArrayFor,
    moveWarDefenseBonus,
    isHexVisible,
    unitHasPropKey,
    computeShoot,
    setAmmo,
    setStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    trySteadfastnessAfterOverwatchDamage,
    clearAmbushOrderFully,
  } = deps
  const atk = findUnitOnField(cells, shooterInstanceId)
  const def = findUnitOnField(cells, defenderInstanceId)
  if (!atk || !def) return
  const du = def.unit
  if (!du.tactical || (!du.tactical.defendOrder && !du.tactical.ambushOrder)) return
  if (getStr(du) <= 0) return
  const sec = du.defendSectorCellIds
  if (!Array.isArray(sec) || !sec.length) return
  const secSet = new Set(sec.map((x) => Number(x)))
  const shooterInSector = secSet.has(Number(atk.cell.id))
  const impactId = fireImpactCellId != null && Number.isFinite(Number(fireImpactCellId)) ? Number(fireImpactCellId) : null
  const impactInSector = impactId != null && secSet.has(impactId)
  if (!shooterInSector && !impactInSector) return
  const returnPairKey = `${Number(defenderInstanceId)}:${Number(shooterInstanceId)}`
  if (sectorReturnFired && sectorReturnFired.has(returnPairKey)) return
  if (sectorAggression) {
    const dk = Number(defenderInstanceId)
    if (!sectorAggression.has(dk)) sectorAggression.set(dk, new Set())
    sectorAggression.get(dk).add(Number(shooterInstanceId))
  }
  if (!defenderSeesCellForOverwatch(cells, def.cell, atk.cell, du)) return
  if (getAmmo(du) < 1) return
  const d = hexDist(
    def.cell.coor.x,
    def.cell.coor.y,
    def.cell.coor.z,
    atk.cell.coor.x,
    atk.cell.coor.y,
    atk.cell.coor.z,
  )
  const baseRaRet = rangeArrayFor(du)
  const isAmbushRet = du.tactical.ambushOrder && !du.tactical.defendOrder
  const ra = isAmbushRet ? rangeArrayAmbushAccuracyBonus(baseRaRet) : baseRaRet
  const rMode = fireRangeTableMode(ra)
  const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (outOfRange) return
  const ia = intensityArrayFor(du, atk.unit)
  const warDefA = moveWarDefenseBonus(Number(atk.unit.instanceId), ordersByUnit)
  const losOw = isHexVisible(def.cell, atk.cell, cells)
  let artilleryClosedOw = false
  if (!losOw) {
    if (!unitHasPropKey(du, 'concealedTargetFire')) return
    artilleryClosedOw = true
  }
  const res = computeShoot(du, atk.unit, atk.cell, d, ia, ra, false, undefined, warDefA, 0, artilleryClosedOw, 1)
  setAmmo(du, getAmmo(du) - 1)
  if (sectorReturnFired) {
    sectorReturnFired.add(`${Number(defenderInstanceId)}:${Number(shooterInstanceId)}`)
  }
  const tagA = warDefA ? ' [бой +1 З]' : ''
  const srcRet = isAmbushRet ? 'засада' : 'оборона'
  le(
    ph,
    `Ответ по стрелявшему (${srcRet}): ${def.unit.instanceId} → ${atk.unit.instanceId}, попаданий ${res.hits}, урон ${res.damages} (выпало: ${res.rollResults.join(',')})${tagA}`,
    {
      fireLine: {
        attackerId: def.unit.instanceId,
        targetId: atk.unit.instanceId,
        fromCellId: def.cell.id,
        targetCellId: atk.cell.id,
        hits: res.hits,
        damages: res.damages,
        rollResults: res.rollResults,
        warDef: !!warDefA,
        isSuppression: false,
        baseDiceCount: res.baseDiceCount,
        diceCount: res.diceCount,
        ammoCost: 1,
        accuracy: Number(res.accuracy) || 0,
        defendReturnFire: true,
        isAmbush: !!isAmbushRet,
      },
    },
  )
  const prevAtkStr = getStr(atk.unit)
  setStr(atk.unit, prevAtkStr - res.damages)
  logUnitDestroyed(le, ph, atk.unit, prevAtkStr, 'ответный огонь', atk.cell?.id)
  if (isTruckUnit(atk.unit)) applyCargoDamageFromTruckHit(cells, atk.unit, res.damages)
  const atkAfter = findUnitOnField(cells, shooterInstanceId)
  if (atkAfter && getStr(atkAfter.unit) > 0 && res.damages > 0) {
    if (steadfastnessQueue) {
      steadfastnessQueue.push({ id: Number(shooterInstanceId), dmg: res.damages })
    } else {
      trySteadfastnessAfterOverwatchDamage(le, ph, atkAfter.unit, res.damages)
    }
  }
  if (clearAmbushOrderFully(du)) {
    le(ph, `Засада раскрыта: юнит ${du.instanceId} (ответный огонь)`, {
      unitInstanceId: Number(du.instanceId),
      ambushCleared: true,
    })
  }
}

function resolveDefendSectorIdleFire(
  cells,
  ordersByUnit,
  le,
  ph,
  movedInstanceIds,
  sectorAggression,
  sectorReturnFired,
  deps,
) {
  const {
    getStr,
    getAmmo,
    opposing,
    unitFaction,
    defenderSeesCellForOverwatch,
    hexDist,
    rangeArrayFor,
    rangeArrayAmbushAccuracyBonus,
    fireRangeTableMode,
    intensityArrayFor,
    moveWarDefenseBonus,
    isHexVisible,
    unitHasPropKey,
    computeShoot,
    setAmmo,
    setStr,
    logUnitDestroyed,
    isTruckUnit,
    applyCargoDamageFromTruckHit,
    sweepCorpses,
    findUnitOnField,
    trySteadfastnessAfterOverwatchDamage,
    clearAmbushOrderFully,
  } = deps
  for (let ci = 0; ci < cells.length; ci++) {
    const defCell = cells[ci]
    const us = defCell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const du = us[ui]
      if (getStr(du) <= 0) continue
      if (!du.tactical || (!du.tactical.defendOrder && !du.tactical.ambushOrder)) continue
      const sec = du.defendSectorCellIds
      if (!Array.isArray(sec) || !sec.length) continue
      if (getAmmo(du) < 1) continue
      const defInst = Number(du.instanceId)
      const secSet = new Set(sec.map((x) => Number(x)))
      const isAmbushDu = du.tactical.ambushOrder && !du.tactical.defendOrder
      const candidates = []
      for (let oi = 0; oi < cells.length; oi++) {
        const hCell = cells[oi]
        if (!secSet.has(Number(hCell.id))) continue
        const hus = hCell.units || []
        for (let hi = 0; hi < hus.length; hi++) {
          const eu = hus[hi]
          if (getStr(eu) <= 0) continue
          if (!opposing(unitFaction(du), unitFaction(eu))) continue
          const eid = Number(eu.instanceId)
          if (movedInstanceIds.has(eid)) continue
          if (!defenderSeesCellForOverwatch(cells, defCell, hCell, du)) continue
          const dist = hexDist(
            defCell.coor.x,
            defCell.coor.y,
            defCell.coor.z,
            hCell.coor.x,
            hCell.coor.y,
            hCell.coor.z,
          )
          const baseRa0 = rangeArrayFor(du)
          const ra0 = isAmbushDu ? rangeArrayAmbushAccuracyBonus(baseRa0) : baseRa0
          const rMode0 = fireRangeTableMode(ra0)
          const out0 = rMode0 === 'ranged' ? dist < 1 || dist >= ra0.length : dist > ra0.length
          if (out0) continue
          candidates.push({ unit: eu, cell: hCell })
        }
      }
      if (!candidates.length) continue

      const pool = candidates.filter(({ unit: eu }) => !sectorReturnFired.has(`${defInst}:${Number(eu.instanceId)}`))
      if (!pool.length) continue

      const pri = sectorAggression.get(defInst)
      const priPool = pri && pri.size ? pool.filter(({ unit: eu }) => pri.has(Number(eu.instanceId))) : []
      const pickFrom = priPool.length ? priPool : pool
      const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)]
      const tgt = chosen.unit
      const tgtCell = chosen.cell

      const d = hexDist(
        defCell.coor.x,
        defCell.coor.y,
        defCell.coor.z,
        tgtCell.coor.x,
        tgtCell.coor.y,
        tgtCell.coor.z,
      )
      const baseRa = rangeArrayFor(du)
      const ra = isAmbushDu ? rangeArrayAmbushAccuracyBonus(baseRa) : baseRa
      const ia = intensityArrayFor(du, tgt)
      const warDefT = moveWarDefenseBonus(Number(tgt.instanceId), ordersByUnit)
      const losOw = isHexVisible(defCell, tgtCell, cells)
      let artilleryClosedOw = false
      if (!losOw) {
        if (!unitHasPropKey(du, 'concealedTargetFire')) continue
        artilleryClosedOw = true
      }
      const res = computeShoot(du, tgt, tgtCell, d, ia, ra, false, undefined, warDefT, 0, artilleryClosedOw, 1)
      setAmmo(du, getAmmo(du) - 1)
      const tagW = warDefT ? ' [бой +1 З]' : ''
      const idleIntro = isAmbushDu
        ? 'Огонь с засады (в секторе, без хода цели)'
        : 'Огонь с обороны (в секторе, без хода цели)'
      le(
        ph,
        `${idleIntro}: ${defInst} → ${tgt.instanceId}, попаданий ${res.hits}, урон ${res.damages} (выпало: ${res.rollResults.join(',')})${tagW}`,
        {
          fireLine: {
            attackerId: defInst,
            targetId: tgt.instanceId,
            fromCellId: defCell.id,
            targetCellId: tgtCell.id,
            hits: res.hits,
            damages: res.damages,
            rollResults: res.rollResults,
            warDef: !!warDefT,
            isSuppression: false,
            baseDiceCount: res.baseDiceCount,
            diceCount: res.diceCount,
            ammoCost: 1,
            accuracy: Number(res.accuracy) || 0,
            defendSectorIdle: true,
            isAmbush: !!isAmbushDu,
          },
        },
      )
      const prevTgtStr = getStr(tgt)
      setStr(tgt, prevTgtStr - res.damages)
      logUnitDestroyed(le, ph, tgt, prevTgtStr, 'огонь по сектору', tgtCell?.id)
      if (isTruckUnit(tgt)) applyCargoDamageFromTruckHit(cells, tgt, res.damages)
      sweepCorpses(cells)
      const tgtAfter = findUnitOnField(cells, tgt.instanceId)
      if (tgtAfter && getStr(tgtAfter.unit) > 0 && res.damages > 0) {
        trySteadfastnessAfterOverwatchDamage(le, ph, tgtAfter.unit, res.damages)
      }
      if (clearAmbushOrderFully(du)) {
        le(ph, `Засада раскрыта: юнит ${du.instanceId} (доборный огонь по сектору)`, {
          unitInstanceId: defInst,
          ambushCleared: true,
        })
      }
    }
  }
}

function tryDefendOverwatchOnMovePath(cells, moverInstanceId, path, ordersByUnit, le, ph, deps) {
  const {
    findUnitOnField,
    getStr,
    opposing,
    unitFaction,
    defenderSeesCellForOverwatch,
    hexDist,
    rangeArrayFor,
    rangeArrayAmbushAccuracyBonus,
    fireRangeTableMode,
    getAmmo,
    moveWarDefenseBonus,
    intensityArrayFor,
    isHexVisible,
    unitHasPropKey,
    computeShoot,
    setAmmo,
    clearAmbushOrderFully,
    setStr,
    logUnitDestroyed,
    sweepCorpses,
    trySteadfastnessAfterOverwatchDamage,
  } = deps
  const moverTgt0 = findUnitOnField(cells, moverInstanceId)
  if (!moverTgt0) return { fired: false, stopStepIndex: null, died: false }
  const moverUnit = moverTgt0.unit

  for (let stepIdx = 1; stepIdx < path.length; stepIdx++) {
    const stepCell = path[stepIdx]
    const prevCell = path[stepIdx - 1]
    const byAtk = new Map()

    for (let ci = 0; ci < cells.length; ci++) {
      const defCell = cells[ci]
      const us = defCell.units || []
      for (let ui = 0; ui < us.length; ui++) {
        const u = us[ui]
        if (Number(u.instanceId) === Number(moverInstanceId)) continue
        const hasDef = u.tactical && (u.tactical.defendOrder || u.tactical.ambushOrder)
        if (!hasDef) continue
        const sec = u.defendSectorCellIds
        if (!Array.isArray(sec) || !sec.length) continue
        if (!opposing(unitFaction(u), unitFaction(moverUnit))) continue
        const secSet = new Set(sec.map((x) => Number(x)))
        const prevIn = secSet.has(Number(prevCell.id))
        const stepIn = secSet.has(Number(stepCell.id))
        let owCell = null
        let owKind = 'entry'
        if (stepIn && !prevIn) {
          owCell = stepCell
          owKind = 'entry'
        } else if (!stepIn && prevIn) {
          owCell = prevCell
          owKind = 'exit'
        } else if (stepIn && prevIn) {
          owCell = stepCell
          owKind = 'internal'
        } else continue
        if (!defenderSeesCellForOverwatch(cells, defCell, owCell, u)) continue
        const d = hexDist(
          defCell.coor.x,
          defCell.coor.y,
          defCell.coor.z,
          owCell.coor.x,
          owCell.coor.y,
          owCell.coor.z,
        )
        const baseRa = rangeArrayFor(u)
        const isAmbushOw = u.tactical.ambushOrder && !u.tactical.defendOrder
        const ra = isAmbushOw ? rangeArrayAmbushAccuracyBonus(baseRa) : baseRa
        const rMode = fireRangeTableMode(ra)
        const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
        if (outOfRange) continue
        if (getAmmo(u) < 1) continue
        const aid = Number(u.instanceId)
        if (!byAtk.has(aid)) byAtk.set(aid, { defCell, u, owCell, d, ra, owKind })
      }
    }

    if (byAtk.size === 0) continue

    const moverTgt = findUnitOnField(cells, moverInstanceId)
    if (!moverTgt || getStr(moverTgt.unit) <= 0) {
      return { fired: true, stopStepIndex: null, died: true }
    }

    const warDef = moveWarDefenseBonus(moverInstanceId, ordersByUnit)
    const shots = []
    for (const { defCell, u, owCell, d, ra, owKind } of byAtk.values()) {
      const ia = intensityArrayFor(u, moverTgt.unit)
      const losOw = isHexVisible(defCell, owCell, cells)
      let artilleryClosedOw = false
      if (!losOw) {
        if (!unitHasPropKey(u, 'concealedTargetFire')) continue
        artilleryClosedOw = true
      }
      const res = computeShoot(u, moverTgt.unit, owCell, d, ia, ra, false, undefined, warDef, 0, artilleryClosedOw, 1)
      setAmmo(u, getAmmo(u) - 1)
      shots.push({
        attackerId: u.instanceId,
        targetId: moverInstanceId,
        result: res,
        fromCellId: defCell.id,
        targetCellId: owCell.id,
        warDef,
        owKind,
        isAmbushDef: !!(u.tactical.ambushOrder && !u.tactical.defendOrder),
      })
      if (clearAmbushOrderFully(u)) {
        le(ph, `Засада раскрыта: юнит ${u.instanceId} (огонь при движении врага)`, {
          unitInstanceId: Number(u.instanceId),
          ambushCleared: true,
        })
      }
    }

    const dmgByTarget = new Map()
    for (const s of shots) {
      const prev = dmgByTarget.get(s.targetId) || 0
      dmgByTarget.set(s.targetId, prev + s.result.damages)
      const tag = s.warDef ? ' [бой +1 З]' : ''
      const tagOw =
        s.owKind === 'exit'
          ? ', выход из сектора'
          : s.owKind === 'internal'
            ? ', в секторе'
            : ', вход в сектор'
      const srcOw = s.isAmbushDef ? 'засады' : 'обороны'
      le(
        ph,
        `Ответ с ${srcOw}: ${s.attackerId} → ${s.targetId} (кл. ${s.targetCellId}${tagOw}), попаданий ${s.result.hits}, урон ${s.result.damages} (выпало: ${s.result.rollResults.join(',')})${tag}`,
        {
          fireLine: {
            attackerId: s.attackerId,
            targetId: s.targetId,
            fromCellId: s.fromCellId,
            targetCellId: s.targetCellId,
            hits: s.result.hits,
            damages: s.result.damages,
            rollResults: s.result.rollResults,
            warDef: !!s.warDef,
            isSuppression: false,
            baseDiceCount: s.result.baseDiceCount,
            diceCount: s.result.diceCount,
            ammoCost: 1,
            accuracy: Number(s.result?.accuracy) || 0,
            defendOverwatch: true,
            isAmbush: !!s.isAmbushDef,
          },
        },
      )
    }
    let moverDamageTotal = 0
    for (const [tid, dmg] of dmgByTarget) {
      const t = findUnitOnField(cells, tid)
      if (!t) continue
      const prevTargetStr = getStr(t.unit)
      setStr(t.unit, prevTargetStr - dmg)
      logUnitDestroyed(le, ph, t.unit, prevTargetStr, 'реакция обороны', t.cell?.id)
      if (Number(tid) === Number(moverInstanceId)) moverDamageTotal += dmg
    }
    sweepCorpses(cells)
    const moverAfter = findUnitOnField(cells, moverInstanceId)
    if (!moverAfter || getStr(moverAfter.unit) <= 0) {
      return { fired: true, stopStepIndex: null, died: true }
    }
    trySteadfastnessAfterOverwatchDamage(le, ph, moverAfter.unit, moverDamageTotal)
    return { fired: true, stopStepIndex: stepIdx, died: false }
  }
  return { fired: false, stopStepIndex: null, died: false }
}

module.exports = {
  maybeAllDefendersReturnFireForAreaImpactCell,
  maybeDefenderReturnFireAgainstShooter,
  resolveDefendSectorIdleFire,
  tryDefendOverwatchOnMovePath,
}

'use strict'

function ensureTacticalBattle(u) {
  if (!u.tactical) u.tactical = {}
  return u.tactical
}

function ensureCarriedUnits(truckUnit) {
  const t = ensureTacticalBattle(truckUnit)
  if (!Array.isArray(t.carriedUnits)) t.carriedUnits = []
  return t.carriedUnits
}

function sumEmbarkedStrengthForTruck(cells, truckInstanceId, deps) {
  const { findUnitOnField, getStr } = deps
  const truck = findUnitOnField(cells, truckInstanceId)
  let s = 0
  if (truck) {
    const tac = truck.unit.tactical
    if (tac && Array.isArray(tac.carriedUnits)) {
      for (const u of tac.carriedUnits) s += getStr(u)
    }
  }
  const tid = Number(truckInstanceId)
  for (const c of cells) {
    for (const u of c.units || []) {
      const tac = u.tactical
      if (tac && Number(tac.embarkedTransportInstanceId) === tid) s += getStr(u)
    }
  }
  return s
}

function sumEmbarkedInfantryStrengthForTruck(cells, truckInstanceId, deps) {
  const { findUnitOnField, getStr, isInfantryUnit } = deps
  const truck = findUnitOnField(cells, truckInstanceId)
  let s = 0
  if (truck) {
    const tac = truck.unit.tactical
    if (tac && Array.isArray(tac.carriedUnits)) {
      for (const u of tac.carriedUnits) {
        if (isInfantryUnit(u)) s += getStr(u)
      }
    }
  }
  const tid = Number(truckInstanceId)
  for (const c of cells) {
    for (const u of c.units || []) {
      const tac = u.tactical
      if (tac && Number(tac.embarkedTransportInstanceId) === tid && isInfantryUnit(u)) {
        s += getStr(u)
      }
    }
  }
  return s
}

function sumEmbarkedArtilleryStrengthForTruck(cells, truckInstanceId, deps) {
  const { findUnitOnField, getStr, isArtilleryUnit } = deps
  const truck = findUnitOnField(cells, truckInstanceId)
  let s = 0
  if (truck) {
    const tac = truck.unit.tactical
    if (tac && Array.isArray(tac.carriedUnits)) {
      for (const u of tac.carriedUnits) {
        if (isArtilleryUnit(u)) s += getStr(u)
      }
    }
  }
  const tid = Number(truckInstanceId)
  for (const c of cells) {
    for (const u of c.units || []) {
      const tac = u.tactical
      if (tac && Number(tac.embarkedTransportInstanceId) === tid && isArtilleryUnit(u)) {
        s += getStr(u)
      }
    }
  }
  return s
}

function isUnitInAnyCarriedUnits(cells, instanceId, deps) {
  const { isTruckUnit } = deps
  const id = Number(instanceId)
  if (!Number.isFinite(id)) return false
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isTruckUnit(u)) continue
      const tac = u.tactical
      if (!tac || !Array.isArray(tac.carriedUnits)) continue
      if (tac.carriedUnits.some((x) => Number(x.instanceId) === id)) return true
    }
  }
  return false
}

function applyCargoDamageFromTruckHit(cells, truckUnit, dmg, deps) {
  const { setStr, getStr, findUnitOnField } = deps
  if (!truckUnit || dmg <= 0) return
  const tid = Number(truckUnit.instanceId)
  if (!Number.isFinite(tid)) return
  const tac = truckUnit.tactical
  if (tac && Array.isArray(tac.carriedUnits)) {
    for (const u of tac.carriedUnits) {
      setStr(u, getStr(u) - dmg)
    }
  }
  for (const c of cells) {
    for (const u of c.units || []) {
      const t = u.tactical
      if (t && Number(t.embarkedTransportInstanceId) === tid) {
        setStr(u, getStr(u) - dmg)
      }
    }
  }
  const towId = truckUnit.tactical && truckUnit.tactical.towingTargetInstanceId
  if (towId != null && Number.isFinite(Number(towId))) {
    const towed = findUnitOnField(cells, towId)
    if (towed) setStr(towed.unit, getStr(towed.unit) - dmg)
  }
}

function canUnloadToCell(cell, faction, passengerInstanceId, deps) {
  const { terrainEntryCost, getStr, isTruckUnit, opposing, unitFaction } = deps
  if (!cell) return false
  if (terrainEntryCost(cell, { type: 'infantry' }) === 0) return false
  const us = cell.units || []
  let liveOnHex = 0
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (Number(u.instanceId) === Number(passengerInstanceId)) continue
    if (getStr(u) <= 0) continue
    if (isTruckUnit(u)) return false
    liveOnHex++
  }
  if (liveOnHex >= 3) return false
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (Number(u.instanceId) === Number(passengerInstanceId)) continue
    if (getStr(u) <= 0) continue
    if (opposing(unitFaction(u), faction)) return false
  }
  return true
}

function syncCargoAfterTransportMove(cells, truckInstanceId, deps) {
  const {
    findUnitOnField,
    isTruckUnit,
    syncUnitCoor,
    removeUnitFromCell,
    addUnitToCell,
  } = deps
  const truck = findUnitOnField(cells, truckInstanceId)
  if (!truck || !isTruckUnit(truck.unit)) return
  const tid = Number(truckInstanceId)
  const tcell = truck.cell
  const tacTr = truck.unit.tactical
  if (tacTr && Array.isArray(tacTr.carriedUnits)) {
    for (const u of tacTr.carriedUnits) {
      syncUnitCoor(u, tcell)
    }
  }
  for (const c of cells) {
    const movers = []
    for (const u of c.units || []) {
      const tac = u.tactical
      if (tac && Number(tac.embarkedTransportInstanceId) === tid) movers.push(u)
    }
    for (const u of movers) {
      removeUnitFromCell(c, u.instanceId)
      addUnitToCell(tcell, u)
      syncUnitCoor(u, tcell)
    }
  }
  const towInst = truck.unit.tactical && truck.unit.tactical.towingTargetInstanceId
  if (towInst != null && Number.isFinite(Number(towInst))) {
    const towed = findUnitOnField(cells, towInst)
    if (towed) {
      removeUnitFromCell(towed.cell, towInst)
      addUnitToCell(tcell, towed.unit)
      syncUnitCoor(towed.unit, tcell)
    }
  }
}

module.exports = {
  ensureTacticalBattle,
  ensureCarriedUnits,
  sumEmbarkedStrengthForTruck,
  sumEmbarkedInfantryStrengthForTruck,
  sumEmbarkedArtilleryStrengthForTruck,
  isUnitInAnyCarriedUnits,
  applyCargoDamageFromTruckHit,
  canUnloadToCell,
  syncCargoAfterTransportMove,
}

'use strict'

const { isInfantryUnit, isArtilleryUnit } = require('../../core/battleUnitType')
const { getStr, unitFaction, findUnitOnField } = require('./battleUnitField')
const { hexDistCells } = require('../map/battleHexGeometry')

const MEDICAL_DEFENSE_BONUS = 1

const LEAVE_ORDER_KEYS = new Set([
  'move',
  'moveWar',
  'attack',
  'hardMove',
  'unloading',
  'railUnloading',
  'loading',
  'tow',
  'railLoading',
  'enterDot',
  'exitDot',
  'buildPonton',
])

function ensureTac(unit) {
  if (!unit.tactical || typeof unit.tactical !== 'object') unit.tactical = {}
  return unit.tactical
}

function startMedicalJob(unit, targetUnitInstanceId) {
  const tid = Number(targetUnitInstanceId)
  if (!unit || !Number.isFinite(tid)) return
  ensureTac(unit).medicalJob = { targetUnitInstanceId: tid }
}

function clearMedicalJob(unit) {
  if (unit && unit.tactical) delete unit.tactical.medicalJob
}

function getMedicalTargetId(unit, ordersByUnit) {
  if (!unit) return null
  if (ordersByUnit && typeof ordersByUnit.get === 'function') {
    const spec = ordersByUnit.get(Number(unit.instanceId))
    if (spec && String(spec.orderKey || '').trim() === 'medical') {
      const tid = Number(spec.targetUnitInstanceId)
      if (Number.isFinite(tid)) return tid
    }
  }
  const job = unit.tactical && unit.tactical.medicalJob
  const jid = Number(job && job.targetUnitInstanceId)
  return Number.isFinite(jid) ? jid : null
}

function isMedicalAidReceiver(unit) {
  return isInfantryUnit(unit) || isArtilleryUnit(unit)
}

function destCellForOrder(cells, spec) {
  if (!spec || typeof spec !== 'object') return null
  const cid = Number(spec.targetCellId)
  if (Number.isFinite(cid)) {
    return cells.find((c) => Number(c.id) === cid) || null
  }
  const tid = Number(spec.targetUnitInstanceId)
  if (Number.isFinite(tid)) {
    const live = findUnitOnField(cells, tid)
    return live ? live.cell : null
  }
  return null
}

function targetLeavesMedicRange(cells, medicCell, targetId, ordersByUnit) {
  if (!ordersByUnit || typeof ordersByUnit.get !== 'function') return false
  const spec = ordersByUnit.get(Number(targetId))
  if (!spec) return false
  const k = String(spec.orderKey || '').trim()
  if (!LEAVE_ORDER_KEYS.has(k)) return false
  const dest = destCellForOrder(cells, spec)
  if (!dest) return false
  return hexDistCells(medicCell, dest) > 1
}

function medicLeavesTargetRange(cells, medic, targetCell, ordersByUnit) {
  if (!ordersByUnit || typeof ordersByUnit.get !== 'function') return false
  const spec = ordersByUnit.get(Number(medic.instanceId))
  if (!spec) return false
  const k = String(spec.orderKey || '').trim()
  if (k === 'medical') return false
  if (!LEAVE_ORDER_KEYS.has(k)) return false
  const dest = destCellForOrder(cells, spec)
  if (!dest) return false
  return hexDistCells(dest, targetCell) > 1
}

function clearMedicalAidOnUnit(unit) {
  if (!unit || !unit.tactical) return
  delete unit.tactical.medicalAidReceived
  delete unit.tactical.medicalAidFromInstanceId
}

function clearMedicalAidFlags(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      clearMedicalAidOnUnit(u)
    }
  }
}

function applyMedicalAidFlags(cells, ordersByUnit, le, ph) {
  clearMedicalAidFlags(cells)
  const medics = []
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) {
        clearMedicalJob(u)
        continue
      }
      if (getMedicalTargetId(u, ordersByUnit) == null) continue
      medics.push({ unit: u, cell: c })
    }
  }
  if (!medics.length) return
  for (let i = 0; i < medics.length; i++) {
    const m = medics[i]
    const tid = getMedicalTargetId(m.unit, ordersByUnit)
    if (!Number.isFinite(tid)) {
      clearMedicalJob(m.unit)
      continue
    }
    const tgt = findUnitOnField(cells, tid)
    if (!tgt || getStr(tgt.unit) <= 0 || !isMedicalAidReceiver(tgt.unit) || unitFaction(tgt.unit) !== unitFaction(m.unit)) {
      clearMedicalJob(m.unit)
      continue
    }
    if (hexDistCells(tgt.cell, m.cell) > 1) {
      clearMedicalJob(m.unit)
      if (typeof le === 'function') {
        le(ph, `Лечение: помощь отряду ${tid} прервана — цель вне области санитара`)
      }
      continue
    }
    if (targetLeavesMedicRange(cells, m.cell, tid, ordersByUnit) || medicLeavesTargetRange(cells, m.unit, tgt.cell, ordersByUnit)) {
      clearMedicalJob(m.unit)
      if (typeof le === 'function') {
        le(ph, `Лечение: помощь отряду ${tid} прервана — цель покидает область санитара`)
      }
      continue
    }
    startMedicalJob(m.unit, tid)
    const tt = ensureTac(tgt.unit)
    tt.medicalAidReceived = true
    tt.medicalAidFromInstanceId = Number(m.unit.instanceId)
  }
}

function interruptMedicalIfOutOfRange(cells, ordersByUnit, le, ph) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      const tid = getMedicalTargetId(u, ordersByUnit)
      if (!Number.isFinite(tid)) continue
      if (getStr(u) <= 0) {
        clearMedicalJob(u)
        continue
      }
      const tgt = findUnitOnField(cells, tid)
      if (!tgt || getStr(tgt.unit) <= 0) {
        clearMedicalJob(u)
        continue
      }
      if (hexDistCells(tgt.cell, c) > 1) {
        clearMedicalAidOnUnit(tgt.unit)
        clearMedicalJob(u)
        if (typeof le === 'function') {
          le(ph, `Лечение: приказ прерван — отряд ${tid} покинул область санитара ${u.instanceId}`)
        }
      }
    }
  }
}

function medicalDefenseBonus(unit) {
  if (!unit || !unit.tactical || !unit.tactical.medicalAidReceived) return 0
  if (!isMedicalAidReceiver(unit)) return 0
  return MEDICAL_DEFENSE_BONUS
}

module.exports = {
  MEDICAL_DEFENSE_BONUS,
  applyMedicalAidFlags,
  interruptMedicalIfOutOfRange,
  medicalDefenseBonus,
  isMedicalAidReceiver,
  startMedicalJob,
  clearMedicalJob,
}

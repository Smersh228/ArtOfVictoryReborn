'use strict'

const { isInfantryUnit, isArtilleryUnit } = require('../../core/battleUnitType')
const { getStr, unitFaction } = require('./battleUnitField')
const { hexDistCells } = require('../map/battleHexGeometry')

const MEDICAL_DEFENSE_BONUS = 1

function unitHasMedicalOrder(unit, ordersByUnit) {
  if (!unit || !ordersByUnit || typeof ordersByUnit.get !== 'function') return false
  const spec = ordersByUnit.get(Number(unit.instanceId))
  return Boolean(spec && String(spec.orderKey || '').trim() === 'medical')
}

function isMedicalAidReceiver(unit) {
  return isInfantryUnit(unit) || isArtilleryUnit(unit)
}

function applyMedicalAidFlags(cells, ordersByUnit) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (u && u.tactical) delete u.tactical.medicalAidReceived
    }
  }
  const medics = []
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!unitHasMedicalOrder(u, ordersByUnit)) continue
      medics.push({ unit: u, cell: c })
    }
  }
  if (!medics.length) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!isMedicalAidReceiver(u)) continue
      const fac = unitFaction(u)
      let aided = false
      for (let i = 0; i < medics.length; i++) {
        const m = medics[i]
        if (unitFaction(m.unit) !== fac) continue
        if (hexDistCells(c, m.cell) > 1) continue
        aided = true
        break
      }
      if (!aided) continue
      if (!u.tactical) u.tactical = {}
      u.tactical.medicalAidReceived = true
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
  medicalDefenseBonus,
  isMedicalAidReceiver,
}

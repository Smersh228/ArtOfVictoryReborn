'use strict'

const { unitHasPropKey } = require('../../core/battleUnitType')
const { unitCannotCrossRavine, isRavine } = require('./battleElevation')

function getDef(u) {
  const n = Number(u.def ?? u.defend)
  let d = Number.isFinite(n) ? n : 0
  const medical = require('../unit/battleMedical')
  d += medical.medicalDefenseBonus(u)
  const cover = require('../unit/battleInfantryCover')
  d += cover.infantryCoverDefenseBonus(u)
  return d
}

function usesTechMoveCost(type) {
  const t = String(type || '')
  return [
    'tech',
    'armor',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'lightAir',
    'heavyAir',
  ].includes(t)
}

function hexExtraObj(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function readBaseTerrainEntryCost(cell, unit) {
  const ex = hexExtraObj(cell)
  const byType = (ex && ex.moveCostByType) || cell.moveCostByType
  const ut = String(unit?.type || '')
  if (byType && typeof byType === 'object' && byType[ut] != null) {
    const n = Number(byType[ut])
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  const mcInf = cell.moveCostInf ?? cell.moveCost ?? 1
  const mcTech = cell.moveCostTech ?? cell.moveCost ?? 1
  if (usesTechMoveCost(unit.type)) return mcTech
  return mcInf
}

/** Стоимость входа при проходе по свойству юнита (если на гексе включена соответствующая галочка). */
function terrainPropBypassEntryCost(cell, unit) {
  if (!cell || !unit) return null
  const ex = hexExtraObj(cell)
  if (!ex) return null
  if (ex.moveWithSwampProp === true && unitHasPropKey(unit, 'movementThroughTheSwamp')) return 1
  if (ex.moveWithRiverProp === true && unitHasPropKey(unit, 'crossingAWaterObstacle')) return 1
  return null
}

function terrainEntryCost(cell, unit) {
  if (isRavine(cell) && unitCannotCrossRavine(unit)) return 0
  const base = readBaseTerrainEntryCost(cell, unit)
  let cost = 0
  if (base > 0) cost = base
  else {
    const bypass = terrainPropBypassEntryCost(cell, unit)
    cost = bypass != null ? bypass : 0
  }
  if (cost <= 0) {
    const ponton = require('./battlePonton')
    if (ponton.isPontonComplete(cell && cell.builds)) cost = 1
  }
  if (cost <= 0) return 0
  const { applyRainEntryCost } = require('../scenario/battleEnvironment')
  return applyRainEntryCost(cell, unit, cost)
}

function normalizeUnitTypeForHexExtra(unitType) {
  const lower = String(unitType || '')
    .trim()
    .toLowerCase()
  const map = {
    lighttank: 'lightTank',
    mediumtank: 'mediumTank',
    heavytank: 'heavyTank',
    lightair: 'lightAir',
    heavyair: 'heavyAir',
  }
  if (map[lower]) return map[lower]
  if (lower === 'infantry') return 'infantry'
  if (lower === 'artillery') return 'artillery'
  if (lower === 'tech') return 'tech'
  if (lower === 'armor') return 'armor'
  return String(unitType || '').trim()
}

function readAccuracyBonusForUnitType(ex, unitType) {
  const byType = ex?.accuracyBonusByType
  if (!byType || typeof byType !== 'object') return 0
  const key = normalizeUnitTypeForHexExtra(unitType)
  const n = Number(byType[key])
  return Number.isFinite(n) ? n : 0
}

function ruleTargetMatches(ruleTargetType, targetUnit) {
  const wanted = String(ruleTargetType ?? '').trim()
  if (!wanted || wanted === '*') return true
  if (!targetUnit) return wanted === 'build'
  return normalizeUnitTypeForHexExtra(targetUnit.type) === wanted
}

function pickAccuracyBonusFromRules(rules, shooterUnit, targetUnit, forMelee) {
  const shooterKey = normalizeUnitTypeForHexExtra(shooterUnit?.type)
  let anyRule = null
  let specificRule = null
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!rule || typeof rule !== 'object') continue
    if (normalizeUnitTypeForHexExtra(rule.unitType) !== shooterKey) continue
    if (forMelee && rule.melee !== true) continue
    if (!ruleTargetMatches(rule.targetType, targetUnit)) continue
    const bonus = Number(rule.bonus)
    if (!Number.isFinite(bonus) || bonus === 0) continue
    const isSpecific = Boolean(String(rule.targetType ?? '').trim())
    if (isSpecific) {
      if (!specificRule || Math.abs(bonus) > Math.abs(Number(specificRule.bonus))) specificRule = rule
    } else if (!anyRule) {
      anyRule = rule
    }
  }
  const picked = specificRule || anyRule
  return picked ? Number(picked.bonus) : 0
}

/** Бонус меткости с гекса стрелка; forMelee — только если включён «ближний бой» в правиле. */
function terrainAccuracyBonusFromCell(shooterCell, shooterUnit, targetUnit, forMelee) {
  if (!shooterCell || !shooterUnit) return 0
  const ex = hexExtraObj(shooterCell)
  if (!ex) return 0
  const rules = ex.accuracyBonusRules
  if (Array.isArray(rules) && rules.length) {
    return pickAccuracyBonusFromRules(rules, shooterUnit, targetUnit, forMelee)
  }
  const bonus = readAccuracyBonusForUnitType(ex, shooterUnit?.type)
  if (bonus === 0) return 0
  if (forMelee) {
    const meleeFlags = ex.accuracyBonusMeleeByType
    if (!meleeFlags || typeof meleeFlags !== 'object') return 0
    const key = normalizeUnitTypeForHexExtra(shooterUnit?.type)
    if (meleeFlags[key] !== true) return 0
  }
  return bonus
}

function terrainDefenseBonusFromCell(targetCell, targetUnit) {
  if (!targetCell || !targetUnit) return 0
  if (targetUnit.tactical && targetUnit.tactical.fireSuppression) return 0
  const ex = hexExtraObj(targetCell)
  const byType = (ex && ex.defBonusByType) || targetCell.defBonusByType
  const ut = String(targetUnit?.type || '')
  if (byType && typeof byType === 'object' && byType[ut] != null) {
    return Math.max(0, Number(byType[ut]) || 0)
  }
  const usesTech = usesTechMoveCost(targetUnit.type)
  let bi = Math.max(0, Number(targetCell.defBonusInf) || 0)
  let bt = Math.max(0, Number(targetCell.defBonusTech) || 0)
  if (bi === 0 && bt === 0 && targetCell.baseDefend != null && typeof targetCell.baseDefend === 'object') {
    bi = Math.max(0, Number(targetCell.baseDefend.infantry) || 0)
    bt = Math.max(0, Number(targetCell.baseDefend.technics) || 0)
  }
  return usesTech ? bt : bi
}

module.exports = {
  getDef,
  usesTechMoveCost,
  terrainEntryCost,
  terrainDefenseBonusFromCell,
  terrainAccuracyBonusFromCell,
  normalizeUnitTypeForHexExtra,
}

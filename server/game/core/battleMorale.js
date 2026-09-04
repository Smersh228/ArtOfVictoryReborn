'use strict'

function isTankUnit(u) {
  const t = String(u.type || '').toLowerCase()
  return t === 'lighttank' || t === 'mediumtank' || t === 'heavytank'
}

function hasTankFear(u, deps) {
  const fn = deps && typeof deps.unitHasPropKey === 'function' ? deps.unitHasPropKey : null
  return u.tankFear === true || u.tank_phobia === true || Boolean(fn && fn(u, 'tankPhobia'))
}

const hqMorale = require('../lib/unit/battleHqMorale')

function getBaseMor(u) {
  const n = Number(u.mor ?? u.morale)
  return Number.isFinite(n) ? n : 0
}

function getMor(u) {
  return getBaseMor(u)
}

function getEffectiveMor(u, cells, findUnitOnField) {
  const base = getBaseMor(u)
  const bonus = hqMorale.getHqMoraleBonus(u, cells, findUnitOnField)
  const cover = require('../lib/unit/battleInfantryCover').infantryCoverMoraleBonus(u)
  return Math.max(0, Math.min(12, base + bonus + cover))
}

function resolveMorForUnit(u, deps) {
  const { cells, findUnitOnField } = deps || {}
  if (cells && typeof findUnitOnField === 'function') {
    return getEffectiveMor(u, cells, findUnitOnField)
  }
  return getBaseMor(u)
}

function applyMoraleRollResult(unit, sum) {
  const n = Number(sum)
  if (!Number.isFinite(n)) return
  const v = Math.max(0, Math.min(12, Math.floor(n)))
  unit.mor = v
  unit.morale = v
}

function getMoraleThresholdForSteadfastness(u, deps) {
  const { isTruckUnit } = deps
  const mor = resolveMorForUnit(u, deps)
  if (mor > 0) return mor
  if (isTruckUnit(u)) return 7
  return 0
}

function roll2d6() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1
}

function rollTankFearSteadfastness(le, ph, unit, tag, suppressOnFail, abortAttackOnFail, deps) {
  deps = deps && typeof deps === 'object' ? deps : {}
  const { ensureTacticalBattle, clearDefendOnUnit, cells, findUnitOnField } = deps
  deps = { ...deps, cells, findUnitOnField }
  const mor = resolveMorForUnit(unit, deps)
  if (mor <= 0) return true
  const sum = roll2d6()
  const t =
    typeof ensureTacticalBattle === 'function'
      ? ensureTacticalBattle(unit)
      : unit.tactical || (unit.tactical = {})
  t.steadfastnessUiRoll = sum
  applyMoraleRollResult(unit, sum)
  if (sum < mor) {
    le(ph, `${tag}: юнит ${unit.instanceId} (${sum} < ${mor})`)
    return true
  }
  if (suppressOnFail) {
    const suppression = require('./battleSuppression')
    suppression.applyFireSuppression(unit, le, ph, {
      ensureTacticalBattle,
      clearDefendOnUnit,
      cells: deps.cells,
      findUnitOnField: deps.findUnitOnField,
      ordersByUnit: deps.ordersByUnit,
    })
    le(ph, `${tag}: юнит ${unit.instanceId} провал (${sum} ≥ ${mor}) → подавление`)
  } else {
    le(ph, `${tag}: юнит ${unit.instanceId} провал (${sum} ≥ ${mor}) — атака не совершена`)
  }
  if (abortAttackOnFail) return false
  return true
}

function steadfastDeps(deps) {
  return {
    ensureTacticalBattle: deps.ensureTacticalBattle,
    clearDefendOnUnit: deps.clearDefendOnUnit,
    cells: deps.cells,
    findUnitOnField: deps.findUnitOnField,
    ordersByUnit: deps.ordersByUnit,
  }
}

function applyMoraleDelta(unit, delta) {
  const cur = getBaseMor(unit)
  const v = Math.max(0, Math.min(12, Math.floor(cur + (Number(delta) || 0))))
  unit.mor = v
  unit.morale = v
}

function isHardMoveOrder(atkUnit, orderKey, unitHasPropKey) {
  const k = String(orderKey || '').trim()
  if (k === 'hardMove') return true
  if (k === 'attack' && unitHasPropKey(atkUnit, 'attackMoral')) return true
  return false
}

function tryHardMoveSteadfastness(le, ph, atkPack, defPack, deps) {
  const { isInfantryUnit, isArtilleryUnit, unitHasPropKey, ensureTacticalBattle, clearDefendOnUnit } = deps
  if (!isInfantryUnit(defPack.unit) && !isArtilleryUnit(defPack.unit)) return true
  const flame = unitHasPropKey(atkPack.unit, 'attackMoral')
  const ok = rollTankFearSteadfastness(
    le,
    ph,
    defPack.unit,
    'Мощная атака',
    true,
    true,
    steadfastDeps(deps),
  )
  if (flame && isInfantryUnit(defPack.unit) && defPack.unit.tactical && defPack.unit.tactical.steadfastnessUiRoll != null) {
    applyMoraleDelta(defPack.unit, -2)
    le(ph, `Огнемётный танк: юнит ${defPack.unit.instanceId} мораль −2 (после теста стойкости)`, {
      unitInstanceId: Number(defPack.unit.instanceId),
      flameTankMoralePenalty: 2,
    })
  }
  return ok
}

function tryAttackMoraleTests(le, ph, atkPack, defPack, deps) {
  const { isArmoredVehicleTarget, ensureTacticalBattle, clearDefendOnUnit, unitHasPropKey } = deps
  const hasFearAtk = hasTankFear(atkPack.unit, { unitHasPropKey })
  const hasFearDef = hasTankFear(defPack.unit, { unitHasPropKey })
  const tankVsFear = isTankUnit(atkPack.unit) && hasFearDef
  if (hasFearAtk && isArmoredVehicleTarget(defPack.unit)) {
    if (!rollTankFearSteadfastness(le, ph, atkPack.unit, 'Танкобоязнь (атакующий)', false, true, steadfastDeps(deps))) return false
  }
  if (tankVsFear) {
    rollTankFearSteadfastness(le, ph, defPack.unit, 'Танкобоязнь (защитник)', true, false, steadfastDeps(deps))
  }
  if (isHardMoveOrder(atkPack.unit, deps.orderKey, unitHasPropKey)) {
    if (!tryHardMoveSteadfastness(le, ph, atkPack, defPack, deps)) return false
  }
  return true
}

function resolveSuppressionRecovery(cells, le, deps) {
  const { PHASE_KEYS, getStr, findUnitOnField } = deps
  const ph = PHASE_KEYS.defend
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!u.tactical || !u.tactical.fireSuppression) continue
      const mor = resolveMorForUnit(u, { cells, findUnitOnField })
      if (mor <= 0) continue
      const sum = roll2d6()
      applyMoraleRollResult(u, sum)
      if (sum < mor) {
        delete u.tactical.fireSuppression
        le(ph, `Подавление снято: юнит ${u.instanceId} (${sum} < ${mor})`, { unitInstanceId: u.instanceId })
      }
    }
  }
}

module.exports = {
  isTankUnit,
  hasTankFear,
  getBaseMor,
  getMor,
  getEffectiveMor,
  applyMoraleRollResult,
  applyMoraleDelta,
  getMoraleThresholdForSteadfastness,
  roll2d6,
  rollTankFearSteadfastness,
  isHardMoveOrder,
  tryHardMoveSteadfastness,
  tryAttackMoraleTests,
  resolveSuppressionRecovery,
}

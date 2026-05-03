'use strict'

function isTankUnit(u) {
  const t = String(u.type || '').toLowerCase()
  return t === 'lighttank' || t === 'mediumtank' || t === 'heavytank'
}

function hasTankFear(u, deps) {
  const { unitHasPropKey } = deps
  return u.tankFear === true || u.tank_phobia === true || unitHasPropKey(u, 'tankPhobia')
}

function getMor(u) {
  const n = Number(u.mor ?? u.morale)
  return Number.isFinite(n) ? n : 0
}

function getMoraleThresholdForSteadfastness(u, deps) {
  const { isTruckUnit } = deps
  const mor = getMor(u)
  if (mor > 0) return mor
  if (isTruckUnit(u)) return 7
  return 0
}

function roll2d6() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1
}

function rollTankFearSteadfastness(le, ph, unit, tag, suppressOnFail, abortAttackOnFail, deps) {
  const { ensureTacticalBattle, clearDefendOnUnit } = deps
  const mor = getMor(unit)
  if (mor <= 0) return true
  const sum = roll2d6()
  const t = ensureTacticalBattle(unit)
  t.steadfastnessUiRoll = sum
  if (sum < mor) {
    le(ph, `${tag}: юнит ${unit.instanceId} (${sum} < ${mor})`)
    return true
  }
  if (suppressOnFail) {
    t.fireSuppression = true
    clearDefendOnUnit(unit)
    le(ph, `${tag}: юнит ${unit.instanceId} провал (${sum} ≥ ${mor}) → подавление`)
  } else {
    le(ph, `${tag}: юнит ${unit.instanceId} провал (${sum} ≥ ${mor}) — атака не совершена`)
  }
  if (abortAttackOnFail) return false
  return true
}

function tryAttackMoraleTests(le, ph, atkPack, defPack, deps) {
  const { isArmoredVehicleTarget, ensureTacticalBattle, clearDefendOnUnit, unitHasPropKey } = deps
  const hasFearAtk = hasTankFear(atkPack.unit, { unitHasPropKey })
  const hasFearDef = hasTankFear(defPack.unit, { unitHasPropKey })
  const tankVsFear = isTankUnit(atkPack.unit) && hasFearDef
  if (hasFearAtk && isArmoredVehicleTarget(defPack.unit)) {
    if (!rollTankFearSteadfastness(le, ph, atkPack.unit, 'Танкобоязнь (атакующий)', false, true, {
      ensureTacticalBattle,
      clearDefendOnUnit,
    })) return false
  }
  if (tankVsFear) {
    rollTankFearSteadfastness(le, ph, defPack.unit, 'Танкобоязнь (защитник)', true, false, {
      ensureTacticalBattle,
      clearDefendOnUnit,
    })
  }
  return true
}

function resolveSuppressionRecovery(cells, le, deps) {
  const { PHASE_KEYS, getStr } = deps
  const ph = PHASE_KEYS.defend
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!u.tactical || !u.tactical.fireSuppression) continue
      const mor = getMor(u)
      if (mor <= 0) continue
      const sum = roll2d6()
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
  getMor,
  getMoraleThresholdForSteadfastness,
  roll2d6,
  rollTankFearSteadfastness,
  tryAttackMoraleTests,
  resolveSuppressionRecovery,
}

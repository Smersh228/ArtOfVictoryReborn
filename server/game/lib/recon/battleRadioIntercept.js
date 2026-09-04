'use strict'

const { hexDistCells } = require('../map/battleHexGeometry')
const { getStr, unitFaction, opposing } = require('../unit/battleUnitField')
const { getMeleeOpponentId } = require('../map/battleHexMovement')
const { readHqZoneRadiusFromUnit } = require('../unit/battleHqMorale')
const {
  readRangeCsvFromUnit,
  clampChosenRadiusSteps,
  thresholdForChosenRadius,
} = require('./battleReconResolve')

const ORDER_LABEL_RU = {
  none: 'нет приказа',
  defend: 'оборона',
  ambush: 'засада',
  fire: 'огонь',
  fireHard: 'огонь на подавление',
  attack: 'атака',
  hardMove: 'мощная атака',
  fireMove: 'огонь с ходу',
  move: 'походное движение',
  moveWar: 'боевое движение',
  medical: 'медик',
  razvedka: 'разведка',
  svzy: 'радиоперехват',
  getSup: 'передача БК',
  loadingSup: 'погрузка БК',
  loading: 'погрузка',
  unloading: 'выгрузка',
  tow: 'буксир',
  clotting: 'свёртывание',
  deploy: 'развёртывание',
  changeSector: 'смена сектора',
  cutWire: 'снятие проволоки',
  trenches: 'окопаться',
  buildPonton: 'понтон',
  cutEj: 'противотанковый ёж',
  demining: 'разминирование',
  mining: 'минирование',
  intelligenceAir: 'авиаразведка',
  airSupply: 'авиаснабжение',
  accompaniment: 'сопровождение',
  attackAir: 'авиаудар',
  bombardment: 'бомбардировка',
  desant: 'десант',
  interception: 'перехват',
  patrol: 'патруль',
  airRecall: 'отзыв',
  demolition: 'подрыв сооружения',
  explomost: 'подрыв моста',
  arson: 'поджог',
  repairRailway: 'ремонт железной дороги',
  smoke: 'дым',
  railLoading: 'погрузка на поезд',
  railUnloading: 'выгрузка с поезда',
  enterDot: 'вход в ДОТ',
  exitDot: 'выход из ДОТ',
}

function rollD6(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  return Math.floor(rand() * 6) + 1
}

function orderLabelRu(orderKey) {
  const k = String(orderKey || '').trim()
  if (!k) return ORDER_LABEL_RU.none
  return ORDER_LABEL_RU[k] || k
}

function findValidHqForRewrite(cells, faction) {
  const fac = String(faction || '').trim()
  if (fac !== 'rkka' && fac !== 'wehrmacht') return null
  if (!Array.isArray(cells)) return null
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const us = c.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (unitFaction(u) !== fac) continue
      if (readHqZoneRadiusFromUnit(u, c) <= 0) continue
      if (u.tactical && getMeleeOpponentId(u)) continue
      if (u.tactical && u.tactical.fireSuppression) continue
      return { unit: u, cell: c }
    }
  }
  return null
}

function collectEnemyUnitsInRadius(cells, centerCell, radius, scoutFaction) {
  const out = []
  if (!centerCell || !Array.isArray(cells)) return out
  const R = Math.max(0, Number(radius) || 0)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (hexDistCells(centerCell, c) > R) continue
    const us = c.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      if (getStr(u) <= 0) continue
      if (!opposing(scoutFaction, unitFaction(u))) continue
      out.push({ unit: u, cell: c })
    }
  }
  return out
}

function resolveOneListener({ unit, cell, cells, radiusSteps, mergedOrders, rng }) {
  const rangeArray = readRangeCsvFromUnit(unit, 'svzy')
  const R = clampChosenRadiusSteps(rangeArray, radiusSteps)
  const threshold = thresholdForChosenRadius(rangeArray, R)
  const fac = unitFaction(unit)
  const enemies = collectEnemyUnitsInRadius(cells, cell, R, fac)
  const revealed = []
  const rolls = []
  let anySuccess = false
  for (let i = 0; i < enemies.length; i++) {
    const pack = enemies[i]
    const uid = Number(pack.unit.instanceId)
    const roll = rollD6(rng)
    const success = threshold > 0 && roll <= threshold
    rolls.push({ unitInstanceId: uid, roll, threshold, success })
    if (!success) continue
    anySuccess = true
    const spec = mergedOrders && typeof mergedOrders.get === 'function' ? mergedOrders.get(uid) : null
    const orderKey = spec && spec.orderKey ? String(spec.orderKey).trim() : 'none'
    const row = {
      unitInstanceId: uid,
      unitName: String(pack.unit.name || '').trim() || undefined,
      cellId: Number(pack.cell.id),
      orderKey,
      orderLabel: orderLabelRu(orderKey),
    }
    if (spec && typeof spec === 'object') {
      const copyKeys = [
        'targetUnitInstanceId',
        'targetCellId',
        'reconRangeSteps',
        'defendFacingCellId',
        'defendMaxRangeSteps',
        'flightPathCellIds',
        'useReactiveFire',
        'bombardmentDirectionCellId',
        'bombardmentAreaCellIds',
        'patrolRangeSteps',
        'fireFromCellId',
        'trenchEdgeDir',
        'wireEdgeDir',
      ]
      for (let k = 0; k < copyKeys.length; k++) {
        const key = copyKeys[k]
        if (spec[key] != null) row[key] = spec[key]
      }
    }
    revealed.push(row)
  }
  return {
    unitInstanceId: Number(unit.instanceId),
    faction: fac,
    radiusSteps: R,
    threshold,
    anySuccess,
    revealed,
    rolls,
  }
}

function resolveAllRadioIntercepts(cells, mergedOrders, rng) {
  const logLines = []
  const byFaction = {
    rkka: { anySuccess: false, revealed: [], listeners: [] },
    wehrmacht: { anySuccess: false, revealed: [], listeners: [] },
  }
  if (!mergedOrders || typeof mergedOrders.entries !== 'function') {
    return { logLines, byFaction: {} }
  }
  for (const [, spec] of mergedOrders.entries()) {
    const k = String(spec && spec.orderKey ? spec.orderKey : '').trim()
    if (k !== 'svzy') continue
    const uid = Number(spec.unitInstanceId ?? spec.unitId)
    if (!Number.isFinite(uid)) continue
    let listener = null
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      const us = c.units || []
      for (let ui = 0; ui < us.length; ui++) {
        if (Number(us[ui].instanceId) === uid && getStr(us[ui]) > 0) {
          listener = { unit: us[ui], cell: c }
          break
        }
      }
      if (listener) break
    }
    if (!listener) {
      logLines.push(`Радиоперехват: юнит ${uid} не найден на поле`)
      continue
    }
    const result = resolveOneListener({
      unit: listener.unit,
      cell: listener.cell,
      cells,
      radiusSteps: spec.reconRangeSteps,
      mergedOrders,
      rng,
    })
    const bucket = byFaction[result.faction]
    if (bucket) {
      bucket.listeners.push(result)
      if (result.anySuccess) bucket.anySuccess = true
      const seen = new Set(bucket.revealed.map((r) => r.unitInstanceId))
      for (const row of result.revealed) {
        if (seen.has(row.unitInstanceId)) continue
        seen.add(row.unitInstanceId)
        bucket.revealed.push(row)
      }
    }
    const hitTxt = result.revealed.length
      ? result.revealed.map((r) => `${r.unitInstanceId}: ${r.orderLabel}`).join('; ')
      : 'приказов не вскрыто'
    logLines.push(
      `Радиоперехват: юнит ${result.unitInstanceId} зона ${result.radiusSteps}, порог ${result.threshold} — ${hitTxt}`,
    )
  }

  const outByFaction = {}
  for (const fac of ['rkka', 'wehrmacht']) {
    const bucket = byFaction[fac]
    if (!bucket.listeners.length) continue
    const hq = bucket.anySuccess ? findValidHqForRewrite(cells, fac) : null
    const hqRoll = hq ? rollD6(rng) : 0
    const rewriteMax = hq ? hqRoll : 0
    if (bucket.anySuccess && !hq) {
      logLines.push(`Радиоперехват (${fac}): штаб недоступен — приказы не меняются`)
    } else if (rewriteMax > 0) {
      logLines.push(
        `Радиоперехват (${fac}): штаб ${hq.unit.instanceId}, куб ${hqRoll} — можно сменить до ${rewriteMax} приказов`,
      )
    }
    outByFaction[fac] = {
      anySuccess: bucket.anySuccess,
      revealed: bucket.revealed,
      rewriteMax,
      hqRoll,
      hqUnitInstanceId: hq ? Number(hq.unit.instanceId) : null,
    }
  }
  return { logLines, byFaction: outByFaction }
}

function orderFingerprint(spec) {
  if (!spec || typeof spec !== 'object') return ''
  return JSON.stringify({
    k: String(spec.orderKey || ''),
    tu: spec.targetUnitInstanceId ?? null,
    tc: spec.targetCellId ?? null,
    r: spec.reconRangeSteps ?? null,
    pr: spec.patrolRangeSteps ?? null,
    df: spec.defendFacingCellId ?? null,
    dr: spec.defendMaxRangeSteps ?? null,
    ta: spec.transferAmmo ?? null,
    ff: spec.fireFromCellId ?? null,
    te: spec.trenchEdgeDir ?? null,
    we: spec.wireEdgeDir ?? null,
    fp: spec.flightPathCellIds ?? null,
    bd: spec.bombardmentDirectionCellId ?? null,
    ba: spec.bombardmentAreaCellIds ?? null,
    adj: spec.useFireAdjustment ?? null,
  })
}

function countChangedOrderUnits(originalOrders, nextOrders) {
  const prev = new Map()
  const next = new Map()
  for (const o of Array.isArray(originalOrders) ? originalOrders : []) {
    const id = Number(o && o.unitInstanceId)
    if (Number.isFinite(id)) prev.set(id, o)
  }
  for (const o of Array.isArray(nextOrders) ? nextOrders : []) {
    const id = Number(o && o.unitInstanceId)
    if (Number.isFinite(id)) next.set(id, o)
  }
  const ids = new Set([...prev.keys(), ...next.keys()])
  let changed = 0
  for (const id of ids) {
    if (orderFingerprint(prev.get(id)) !== orderFingerprint(next.get(id))) changed += 1
  }
  return changed
}

module.exports = {
  orderLabelRu,
  findValidHqForRewrite,
  resolveAllRadioIntercepts,
  countChangedOrderUnits,
  orderFingerprint,
}

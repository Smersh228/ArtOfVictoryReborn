'use strict'

const { unitHasPropKey } = require('../../core/battleUnitType')

function blobOf(cell) {
  const ex = hexExtraOf(cell)
  const name = String((cell && cell.name) || (ex && (ex.name || ex.label)) || '')
  const img = String(
    (cell && (cell.img || cell.imagePath)) || (ex && (ex.image_path || ex.img || ex.imagePath)) || '',
  )
  const mb = String((cell && cell.mapBuilding && cell.mapBuilding.name) || '')
  return `${String((cell && cell.type) || '')} ${name} ${img} ${mb}`
}

function hexExtraOf(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function ensureHexExtra(cell) {
  if (!cell.hexExtra || typeof cell.hexExtra !== 'object') cell.hexExtra = {}
  return cell.hexExtra
}

function isRailwayDestroyed(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (
    ex &&
    (ex.railwayDestroyed === true ||
      ex.isDestroyedRailway === true ||
      ex.editorDestroyedRailway === true)
  ) {
    return true
  }
  const special = require('./battleSpecialTerrain')
  if (
    special.isDestroyedBridgeHex(cell) &&
    (special.isRailwayBridgeHex(cell) || (ex && (ex.isRailway === true || ex.railway === true)))
  ) {
    return true
  }
  return false
}

function markRailwayDestroyed(cell) {
  if (!cell) return false
  const ex = ensureHexExtra(cell)
  ex.railwayDestroyed = true
  ex.isDestroyedRailway = true
  return true
}

function repairRailwayOnCell(cell) {
  if (!cell) return false
  const ex = ensureHexExtra(cell)
  delete ex.railwayDestroyed
  delete ex.isDestroyedRailway
  if (ex.isRailway !== true && ex.railway !== true && ex.rail !== true) ex.isRailway = true
  return true
}

const RAIL_STATION_RE = /станци|вокзал|station|жд\s*стан|rail(?:way)?\s*stat/i

function isRailwayStationCell(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (ex && (ex.isRailStation === true || ex.railwayStation === true || ex.station === true)) return true
  const hp = cell.builds && cell.builds.structureHp
  if (hp && String(hp.kind || '') === 'station') return true
  return RAIL_STATION_RE.test(blobOf(cell))
}

function isRailwayCell(cell) {
  if (!cell) return false
  if (isRailwayDestroyed(cell)) return false
  if (isRailwayStationCell(cell)) return true
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  if (t === 'railway' || t === 'railroad' || t === 'rail' || t === 'train') return true
  const blob = blobOf(cell)
  if (/железн|railway|railroad|жд(?![а-я])/i.test(blob)) return true
  const ex = hexExtraOf(cell)
  if (ex && (ex.isRailway === true || ex.railway === true || ex.rail === true)) return true
  return false
}

function isDestroyedRailwayHex(cell) {
  if (!cell) return false
  if (!isRailwayDestroyed(cell)) return false
  const special = require('./battleSpecialTerrain')
  if (special.isDestroyedBridgeHex(cell)) return false
  const ex = hexExtraOf(cell)
  if (ex && (ex.isRailway === true || ex.railway === true || ex.rail === true || ex.isRailStation === true)) return true
  if (isRailwayStationCell(cell)) return true
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  if (t === 'railway' || t === 'railroad' || t === 'rail' || t === 'train') return true
  const blob = blobOf(cell)
  if (/железн|railway|railroad|жд(?![а-я])/i.test(blob)) return true
  return Boolean(ex && (ex.railwayDestroyed === true || ex.isDestroyedRailway === true))
}

function cellAllowsRailwayDetachment(cell) {
  return isRailwayCell(cell) || isDestroyedRailwayHex(cell)
}

function cellsEligibleForRepairRailway(fromCell, cells) {
  const out = []
  if (!fromCell || !Array.isArray(cells)) return out
  const { hexDistCells } = require('./battleHexGeometry')
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const d = hexDistCells(fromCell, c)
    if (!(d === 0 || d === 1)) continue
    if (isDestroyedRailwayHex(c)) out.push(c)
  }
  return out
}

function isRailwayUnit(u) {
  if (!u) return false
  return unitHasPropKey(u, 'railwayDetachment')
}

const RAILWAY_ENTRY_COST_DISCOUNT = 1.5
const RAILWAY_ENTRY_COST_MIN = 0.5

function applyRailwayEntryDiscount(cell, unit, cost) {
  if (!isRailwayUnit(unit) || !(cost > 0) || !isRailwayCell(cell)) return cost
  return Math.max(RAILWAY_ENTRY_COST_MIN, cost - RAILWAY_ENTRY_COST_DISCOUNT)
}

function railLoadDuration(cell) {
  if (!isRailwayStationCell(cell)) return 2
  const structureHp = require('./battleStructureHp')
  if (!structureHp.stationHasLoadBonus(cell)) return 2
  return 1
}

function isRailCargoOther(u) {
  const t = String((u && u.type) || '').toLowerCase()
  if (t === 'infantry') return false
  if (t === 'artillery' || t === 'armor' || t === 'lighttank' || t === 'mediumtank' || t === 'heavytank') return true
  if (t === 'tech' && !isRailwayUnit(u)) return true
  return false
}

function countRailSlots(train) {
  const arr = train && train.tactical && Array.isArray(train.tactical.carriedUnits) ? train.tactical.carriedUnits : []
  let inf = 0
  let other = 0
  for (const u of arr) {
    if (String(u.type || '').toLowerCase() === 'infantry') inf += 1
    else other += 1
  }
  return { inf, other, total: arr.length }
}

function canRailAcceptUnit(train, cargo) {
  if (!train || !cargo) return false
  if (isRailwayUnit(cargo)) return false
  const slots = countRailSlots(train)
  if (String(cargo.type || '').toLowerCase() === 'infantry') return slots.inf < 2
  if (isRailCargoOther(cargo)) return slots.other < 2
  return false
}

function isRailBusy(unit) {
  const job = unit && unit.tactical && unit.tactical.railJob
  return Boolean(job && Number(job.turnsLeft) > 0)
}

function railBusyReason(unit) {
  const job = unit && unit.tactical && unit.tactical.railJob
  if (!job || Number(job.turnsLeft) <= 0) return null
  const k = String(job.key || '')
  if (k === 'railLoading') return 'погрузка на железной дороге'
  if (k === 'railUnloading') return 'выгрузка на железной дороге'
  return 'погрузка/выгрузка на железной дороге'
}

function ensureTac(unit) {
  if (!unit.tactical) unit.tactical = {}
  return unit.tactical
}

function clearRailJob(unit) {
  if (unit && unit.tactical) delete unit.tactical.railJob
}

function startRailLoading(cells, cur, o, le, ph, deps) {
  const { hexDistCells, findUnitOnField, getStr, isUnitInAnyCarriedUnits, alliesSameFaction } = deps
  if (!isRailwayUnit(cur.unit)) {
    le(ph, `Погрузка на ЖД: ${cur.unit.instanceId} — нужен железнодорожный отряд`)
    return
  }
  if (!isRailwayCell(cur.cell)) {
    le(ph, `Погрузка на ЖД: ${cur.unit.instanceId} — отряд должен стоять на железной дороге`)
    return
  }
  if (isRailBusy(cur.unit)) {
    le(ph, `Погрузка на ЖД: ${cur.unit.instanceId} — ${railBusyReason(cur.unit)}`)
    return
  }
  const tid = Number(o.targetUnitInstanceId)
  const tgt = findUnitOnField(cells, tid)
  if (!tgt) {
    le(ph, `Погрузка на ЖД: цель не на поле`)
    return
  }
  if (!alliesSameFaction(cur.unit, tgt.unit)) {
    le(ph, `Погрузка на ЖД: только союзник`)
    return
  }
  if (hexDistCells(cur.cell, tgt.cell) !== 1) {
    le(ph, `Погрузка на ЖД: цель должна быть в соседнем гексе`)
    return
  }
  if (isUnitInAnyCarriedUnits(cells, tid)) {
    le(ph, `Погрузка на ЖД: цель уже в транспорте`)
    return
  }
  if (tgt.unit.tactical && tgt.unit.tactical.embarkedTransportInstanceId) {
    le(ph, `Погрузка на ЖД: цель уже погружена`)
    return
  }
  if (!canRailAcceptUnit(cur.unit, tgt.unit)) {
    le(ph, `Погрузка на ЖД: нет свободного места (2 пехоты + 2 техники/орудий)`)
    return
  }
  if (getStr(tgt.unit) <= 0) {
    le(ph, `Погрузка на ЖД: цель уничтожена`)
    return
  }
  const duration = railLoadDuration(cur.cell)
  ensureTac(cur.unit).railJob = {
    key: 'railLoading',
    turnsLeft: duration,
    stayCellId: Number(cur.cell.id),
    cargoInstanceId: Number(tgt.unit.instanceId),
  }
  le(ph, `Погрузка на ЖД: юнит ${cur.unit.instanceId} грузит ${tgt.unit.instanceId} (${duration} ход.)`, {
    railJob: 'railLoading',
    railJobTurnsLeft: duration,
    unitInstanceId: Number(cur.unit.instanceId),
  })
}

function startRailUnloading(cells, cur, o, le, ph, deps) {
  const { hexDistCells, canUnloadToCell, unitFaction, ensureCarriedUnits } = deps
  if (!isRailwayUnit(cur.unit)) {
    le(ph, `Выгрузка на ЖД: ${cur.unit.instanceId} — нужен железнодорожный отряд`)
    return
  }
  if (!isRailwayCell(cur.cell)) {
    le(ph, `Выгрузка на ЖД: ${cur.unit.instanceId} — отряд должен стоять на железной дороге`)
    return
  }
  if (isRailBusy(cur.unit)) {
    le(ph, `Выгрузка на ЖД: ${cur.unit.instanceId} — ${railBusyReason(cur.unit)}`)
    return
  }
  const cargoId = Number(o.targetUnitInstanceId)
  const arr = ensureCarriedUnits(cur.unit)
  const cargo = arr.find((u) => Number(u.instanceId) === cargoId)
  if (!cargo) {
    le(ph, `Выгрузка на ЖД: юнит ${cargoId} не в составе ${cur.unit.instanceId}`)
    return
  }
  const cid = Number(o.targetCellId)
  const tc = cells.find((c) => Number(c.id) === cid)
  if (!tc) {
    le(ph, `Выгрузка на ЖД: клетка не найдена`)
    return
  }
  if (hexDistCells(cur.cell, tc) > 1) {
    le(ph, `Выгрузка на ЖД: клетка ${cid} не рядом`)
    return
  }
  if (!canUnloadToCell(tc, unitFaction(cargo), cargoId)) {
    le(ph, `Выгрузка на ЖД: на клетку ${cid} нельзя`)
    return
  }
  const duration = railLoadDuration(cur.cell)
  ensureTac(cur.unit).railJob = {
    key: 'railUnloading',
    turnsLeft: duration,
    stayCellId: Number(cur.cell.id),
    cargoInstanceId: cargoId,
    targetCellId: cid,
  }
  le(ph, `Выгрузка на ЖД: юнит ${cur.unit.instanceId} выгружает ${cargoId} (${duration} ход.)`, {
    railJob: 'railUnloading',
    railJobTurnsLeft: duration,
    unitInstanceId: Number(cur.unit.instanceId),
  })
}

function completeRailLoading(cells, train, job, le, ph, deps) {
  const {
    findUnitOnField,
    hexDistCells,
    removeUnitFromCell,
    syncUnitCoor,
    ensureCarriedUnits,
    ensureTacticalBattle,
    isUnitInAnyCarriedUnits,
  } = deps
  const tgt = findUnitOnField(cells, job.cargoInstanceId)
  if (!tgt) return false
  const trainLive = findUnitOnField(cells, train.instanceId)
  if (!trainLive) return false
  if (hexDistCells(trainLive.cell, tgt.cell) !== 1) return false
  if (isUnitInAnyCarriedUnits(cells, job.cargoInstanceId)) return false
  if (!canRailAcceptUnit(trainLive.unit, tgt.unit)) return false
  const trenchLoad = require('./battleTrench')
  trenchLoad.leaveTrench(tgt.unit, tgt.cell)
  removeUnitFromCell(tgt.cell, tgt.unit.instanceId)
  const passTac = ensureTacticalBattle(tgt.unit)
  delete passTac.embarkedTransportInstanceId
  delete passTac.towedByInstanceId
  delete passTac.towingTargetInstanceId
  syncUnitCoor(tgt.unit, trainLive.cell)
  ensureCarriedUnits(trainLive.unit).push(tgt.unit)
  le(ph, `Погрузка на ЖД: ${tgt.unit.instanceId} в состав ${trainLive.unit.instanceId}`, {
    logisticsLine: {
      orderKey: 'railLoading',
      fromInstanceId: Number(trainLive.unit.instanceId),
      toInstanceId: Number(tgt.unit.instanceId),
    },
  })
  return true
}

function completeRailUnloading(cells, train, job, le, ph, deps) {
  const { findUnitOnField, hexDistCells, addUnitToCell, syncUnitCoor, ensureCarriedUnits, canUnloadToCell, unitFaction } =
    deps
  const trainLive = findUnitOnField(cells, train.instanceId)
  if (!trainLive) return false
  const arr = ensureCarriedUnits(trainLive.unit)
  const cargoId = Number(job.cargoInstanceId)
  const idx = arr.findIndex((u) => Number(u.instanceId) === cargoId)
  if (idx < 0) return false
  const cargo = arr[idx]
  const tc = cells.find((c) => Number(c.id) === Number(job.targetCellId))
  if (!tc) return false
  if (hexDistCells(trainLive.cell, tc) > 1) return false
  if (!canUnloadToCell(tc, unitFaction(cargo), cargoId)) return false
  arr.splice(idx, 1)
  addUnitToCell(tc, cargo)
  syncUnitCoor(cargo, tc)
  le(ph, `Выгрузка на ЖД: ${cargoId} → клетка ${tc.id}`, {
    logisticsLine: {
      orderKey: 'railUnloading',
      fromInstanceId: Number(trainLive.unit.instanceId),
      toInstanceId: Number(cargoId),
      toCellId: Number(tc.id),
    },
  })
  return true
}

function tickRailJobs(cells, le, ph, deps) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      const job = u && u.tactical && u.tactical.railJob
      if (!job || typeof job !== 'object') continue
      let left = Number(job.turnsLeft)
      if (!Number.isFinite(left) || left <= 0) {
        clearRailJob(u)
        continue
      }
      if (Number(c.id) !== Number(job.stayCellId)) {
        le(ph, `ЖД: юнит ${u.instanceId} покинул гекс — приказ прерван`)
        clearRailJob(u)
        continue
      }
      left -= 1
      if (left > 0) {
        job.turnsLeft = left
        le(ph, `ЖД: юнит ${u.instanceId} — «${job.key}», осталось ${left} ход.`, {
          railJob: job.key,
          railJobTurnsLeft: left,
          unitInstanceId: Number(u.instanceId),
        })
        continue
      }
      let ok = false
      if (job.key === 'railLoading') ok = completeRailLoading(cells, u, job, le, ph, deps)
      else if (job.key === 'railUnloading') ok = completeRailUnloading(cells, u, job, le, ph, deps)
      if (!ok) {
        le(ph, `ЖД: юнит ${u.instanceId} — «${job.key}» не выполнен`)
      }
      clearRailJob(u)
    }
  }
}

module.exports = {
  isRailwayCell,
  isRailwayStationCell,
  isRailwayDestroyed,
  isDestroyedRailwayHex,
  cellAllowsRailwayDetachment,
  cellsEligibleForRepairRailway,
  markRailwayDestroyed,
  repairRailwayOnCell,
  isRailwayUnit,
  applyRailwayEntryDiscount,
  railLoadDuration,
  isRailCargoOther,
  countRailSlots,
  canRailAcceptUnit,
  isRailBusy,
  railBusyReason,
  clearRailJob,
  startRailLoading,
  startRailUnloading,
  tickRailJobs,
}

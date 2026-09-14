'use strict'

const { splitNums } = require('../fire/battleFireNormalize')
const { getStr, setStr } = require('../unit/battleUnitField')

const CITY_STR = 18
const VILLAGE_STR = 24
const STATION_STR = 12
const BRIDGE_STR = 3
const BRIDGE_DEF = 3
const STORAGE_STR = 4
const STORAGE_DEF = 1

function ensureBuilds(cell) {
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  return cell.builds
}

function hpKindForCell(cell) {
  if (!cell) return null
  const special = require('./battleSpecialTerrain')
  const fire = require('./battleSettlementFire')
  const railway = require('./battleRailway')
  const stored = cell.builds && cell.builds.structureHp
  if (stored && String(stored.kind || '') === 'station') return 'station'
  if (fire.isSettlementDestroyed(cell)) return null
  if (special.isDestroyedBridgeHex(cell)) return null
  if (railway.isRailwayStationCell(cell)) return 'station'
  const sk = fire.settlementKind(cell)
  if (sk) return sk
  if (special.isIntactBridgeHex(cell) && special.isRailwayBridgeHex(cell)) return 'railBridge'
  if (special.isIntactBridgeHex(cell)) return 'bridge'
  const storage = require('./battleStorage')
  if (storage.hasStorage(cell)) return 'storage'
  return null
}

function defaultHp(kind) {
  if (kind === 'city') return { kind, str: CITY_STR, maxStr: CITY_STR, def: 2, maxDef: 2 }
  if (kind === 'village') return { kind, str: VILLAGE_STR, maxStr: VILLAGE_STR, def: 1, maxDef: 1 }
  if (kind === 'station') return { kind, str: STATION_STR, maxStr: STATION_STR, def: 1, maxDef: 1 }
  if (kind === 'bridge' || kind === 'railBridge') {
    return { kind, str: BRIDGE_STR, maxStr: BRIDGE_STR, def: BRIDGE_DEF, maxDef: BRIDGE_DEF }
  }
  if (kind === 'storage') {
    return { kind, str: STORAGE_STR, maxStr: STORAGE_STR, def: STORAGE_DEF, maxDef: STORAGE_DEF }
  }
  return null
}

function maxDefForHp(hp) {
  if (!hp) return 0
  const str = Math.max(0, Number(hp.str) || 0)
  if (hp.kind === 'city') {
    if (str >= 13) return 2
    if (str >= 7) return 1
    return 0
  }
  if (hp.kind === 'village') return str >= 17 ? 1 : 0
  if (hp.kind === 'station') return str > 0 ? 1 : 0
  if (hp.kind === 'bridge' || hp.kind === 'railBridge') return BRIDGE_DEF
  if (hp.kind === 'storage') return Number(hp.str) > 0 ? STORAGE_DEF : 0
  return 0
}

function isSettlementKind(kind) {
  return kind === 'city' || kind === 'village' || kind === 'station'
}

function isBridgeKind(kind) {
  return kind === 'bridge' || kind === 'railBridge'
}

function isStorageKind(kind) {
  return kind === 'storage'
}

function readHp(cell) {
  const raw = cell && cell.builds && cell.builds.structureHp
  if (!raw || typeof raw !== 'object') return null
  const kind = String(raw.kind || '')
  if (!kind) return null
  return raw
}

function ensureStructureHp(cell) {
  const kind = hpKindForCell(cell)
  if (!kind) return null
  const existing = readHp(cell)
  if (existing && existing.kind === kind) return existing
  const fresh = defaultHp(kind)
  if (!fresh) return null
  ensureBuilds(cell).structureHp = fresh
  return fresh
}

function ensureAllStructureHp(cells) {
  if (!Array.isArray(cells)) return
  for (let i = 0; i < cells.length; i++) ensureStructureHp(cells[i])
}

function regenSettlementDefense(cells) {
  if (!Array.isArray(cells)) return
  for (let i = 0; i < cells.length; i++) {
    const hp = ensureStructureHp(cells[i])
    if (!hp || !isSettlementKind(hp.kind)) continue
    hp.maxDef = maxDefForHp(hp)
    hp.def = hp.maxDef
  }
}

function buildFireSourcePositive(src) {
  if (!src || typeof src !== 'object') return false
  const raw = src.build
  if (raw == null || raw === '') return false
  return splitNums(raw).some((n) => n > 0)
}

function unitHasBuildFire(unit, useReactiveFire) {
  if (!unit) return false
  const reactive = !!(useReactiveFire || unit._useReactiveFire)
  if (reactive) return buildFireSourcePositive(unit.fireReactive)
  return (
    buildFireSourcePositive(unit._fireRaw) ||
    buildFireSourcePositive(unit.fire) ||
    buildFireSourcePositive(unit.fireParsed)
  )
}

function unitBuildFireIsMeleeOnly(unit, useReactiveFire) {
  if (!unit) return false
  const reactive = !!(useReactiveFire || unit._useReactiveFire)
  const opts = reactive ? unit.fireRowOptionsReactive : unit.fireRowOptions
  return !!(opts && typeof opts === 'object' && opts.build && opts.build.melee === true)
}

function unitCanRangedBuildFire(unit, useReactiveFire) {
  return unitHasBuildFire(unit, useReactiveFire) && !unitBuildFireIsMeleeOnly(unit, useReactiveFire)
}

function isShootableStructureCell(cell) {
  const hp = ensureStructureHp(cell)
  return !!(hp && Number(hp.str) > 0)
}

function isBuildFireTargetCell(cell) {
  if (isShootableStructureCell(cell)) return true
  const { hasDotOnCell } = require('./battleDot')
  if (cell && hasDotOnCell(cell.builds)) return true
  const storage = require('./battleStorage')
  return !!(cell && storage.hasStorage(cell))
}

function kindLabel(kind) {
  if (kind === 'city') return 'город'
  if (kind === 'village') return 'деревня'
  if (kind === 'station') return 'станция'
  if (kind === 'railBridge') return 'железнодорожный мост'
  if (kind === 'bridge') return 'мост'
  if (kind === 'storage') return 'склад'
  return 'сооружение'
}

function rollDice(n) {
  const out = []
  const count = Math.max(0, Math.floor(Number(n) || 0))
  for (let i = 0; i < count; i++) out.push(Math.floor(Math.random() * 6) + 1)
  return out
}

function buildDiceCap(attacker, deps) {
  if (!unitHasBuildFire(attacker)) return 0
  const { intensityArrayFor, getDiceCount } = deps || {}
  if (typeof intensityArrayFor !== 'function' || typeof getDiceCount !== 'function') return 0
  const ia = intensityArrayFor(attacker, { type: 'build' })
  return Math.max(0, Number(getDiceCount(attacker, ia)) || 0)
}

function markHpZero(cell) {
  const hp = readHp(cell)
  if (!hp) return
  hp.str = 0
  hp.def = 0
  hp.maxDef = 0
}

function killUnitsOnCell(cells, cell, le, ph, reason, deps) {
  const { logUnitDestroyed } = deps || {}
  const us = (cell && cell.units) || []
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    const prev = getStr(u)
    if (prev <= 0) continue
    setStr(u, 0)
    if (typeof logUnitDestroyed === 'function') {
      logUnitDestroyed(le, ph, u, prev, reason || 'обрушение сооружения', cell.id)
    } else if (typeof le === 'function') {
      le(ph, `Юнит ${u.instanceId} уничтожен (${reason || 'обрушение сооружения'})`)
    }
  }
}

function revealAmbushesOnDestroyedSettlement(cell, le, ph) {
  const ambush = require('../../core/battleAmbush')
  const us = (cell && cell.units) || []
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (getStr(u) <= 0) continue
    if (!ambush.isAmbushConcealed(u)) continue
    if (!ambush.clearAmbushOrderFully(u)) continue
    if (typeof le === 'function') {
      le(ph, `Засада раскрыта: юнит ${u.instanceId} (разрушение населённого пункта)`, {
        unitInstanceId: Number(u.instanceId),
        ambushCleared: true,
      })
    }
  }
}

function destroySettlement(cells, cell, le, ph) {
  const fire = require('./battleSettlementFire')
  if (fire.hasSettlementFire(cell)) {
    fire.completeFire(cells, cell, cell.builds.settlementFire, le, ph)
    return
  }
  fire.markSettlementDestroyed(cell)
  markHpZero(cell)
  revealAmbushesOnDestroyedSettlement(cell, le, ph)
  if (typeof le === 'function') {
    le(ph, `Населённый пункт на кл. ${cell.id} полностью разрушен (огонь по строениям)`, {
      settlementFireCellId: Number(cell.id),
      structureHp: true,
      structureDestroyed: true,
    })
  }
}

function destroyBridge(cells, cell, hp, le, ph, deps) {
  const special = require('./battleSpecialTerrain')
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : (cell.hexExtra = {})
  ex.isDestroyedBridge = true
  if (hp && hp.kind === 'railBridge') {
    const railway = require('./battleRailway')
    railway.markRailwayDestroyed(cell)
  }
  markHpZero(cell)
  killUnitsOnCell(cells, cell, le, ph, 'обрушение моста', deps)
  void special
  if (typeof le === 'function') {
    le(ph, `${kindLabel(hp && hp.kind)} на кл. ${cell.id} разрушен (огонь)`, {
      structureHp: true,
      structureDestroyed: true,
      structureKind: hp && hp.kind,
      structureCellId: Number(cell.id),
    })
  }
}

function applyStructureHits(cells, cell, hits, le, ph, deps) {
  const n = Math.max(0, Math.floor(Number(hits) || 0))
  if (!(n > 0)) return { applied: false, destroyed: false, defLost: 0, strLost: 0 }
  const hp = ensureStructureHp(cell)
  if (!hp || Number(hp.str) <= 0) return { applied: false, destroyed: false, defLost: 0, strLost: 0 }
  const prevDef = Math.max(0, Number(hp.def) || 0)
  const prevStr = Math.max(0, Number(hp.str) || 0)
  let left = n
  const defAbsorb = Math.min(left, prevDef)
  hp.def = prevDef - defAbsorb
  left -= defAbsorb
  const strAbsorb = Math.min(left, prevStr)
  hp.str = prevStr - strAbsorb
  if (isSettlementKind(hp.kind)) {
    hp.maxDef = maxDefForHp(hp)
    if (hp.def > hp.maxDef) hp.def = hp.maxDef
  }
  const destroyed = Number(hp.str) <= 0
  if (typeof le === 'function' && (defAbsorb > 0 || strAbsorb > 0 || destroyed)) {
    const fireLine = deps && deps.fireLine
    le(
      ph,
      `Огонь по сооружению: кл. ${cell.id} (${kindLabel(hp.kind)}) попаданий ${n}, защита ${prevDef}→${hp.def}, прочность ${prevStr}→${hp.str}`,
      {
        structureHp: true,
        structureKind: hp.kind,
        structureCellId: Number(cell.id),
        structureDef: hp.def,
        structureStr: hp.str,
        structureDestroyed: destroyed,
        ...(fireLine && typeof fireLine === 'object' ? { fireLine } : {}),
      },
    )
  }
  if (destroyed) {
    if (isSettlementKind(hp.kind)) destroySettlement(cells, cell, le, ph)
    else if (isBridgeKind(hp.kind)) destroyBridge(cells, cell, hp, le, ph, deps)
    else if (isStorageKind(hp.kind)) {
      require('./battleStorage').destroyWarehouse(cell)
    }
  }
  return { applied: true, destroyed, defLost: defAbsorb, strLost: strAbsorb }
}

function applyMissRerollsToStructure(cells, cell, rollResults, accuracy, attacker, le, ph, deps) {
  if (!unitCanRangedBuildFire(attacker)) return { applied: false }
  if (!isShootableStructureCell(cell)) return { applied: false }
  const cap = buildDiceCap(attacker, deps)
  if (!(cap > 0)) return { applied: false }
  const acc = Number(accuracy) || 0
  if (!(acc > 0)) return { applied: false }
  const rolls = Array.isArray(rollResults) ? rollResults : []
  const misses = rolls.filter((r) => Number(r) > acc)
  const n = Math.min(misses.length, cap)
  if (!(n > 0)) return { applied: false }
  const rerolls = rollDice(n)
  const hits = rerolls.filter((r) => r <= acc).length
  if (typeof le === 'function') {
    le(
      ph,
      `Промахи по отряду: ${n} куб. переброшены по сооружению кл. ${cell.id} (выпало: ${rerolls.join(',')}, попаданий ${hits})`,
    )
  }
  return applyStructureHits(cells, cell, hits, le, ph, deps)
}

function shootStructureDirect(cells, cell, attacker, shooterCell, distance, isSup, deps, le, ph) {
  if (!unitCanRangedBuildFire(attacker)) return { applied: false }
  if (!isShootableStructureCell(cell)) return { applied: false }
  const { intensityArrayFor, rangeArrayForAtCell, computeShoot } = deps || {}
  if (typeof computeShoot !== 'function') return { applied: false }
  const ia = intensityArrayFor(attacker, { type: 'build' })
  const ra = rangeArrayForAtCell(attacker, shooterCell)
  const virtualTarget = { type: 'build', def: 0, str: 1 }
  const res = computeShoot(
    attacker,
    virtualTarget,
    cell,
    distance,
    ia,
    ra,
    !!isSup,
    undefined,
    0,
    0,
    false,
    1,
  )
  const hits = Number(res && res.hits) || 0
  const fireLine = {
    attackerId: Number(attacker.instanceId),
    targetId: null,
    fromCellId: shooterCell && shooterCell.id != null ? Number(shooterCell.id) : null,
    targetCellId: Number(cell.id),
    hits,
    damages: hits,
    rollResults: Array.isArray(res && res.rollResults) ? res.rollResults : [],
    diceCount: Number(res && res.diceCount) || 0,
    baseDiceCount: Number(res && res.baseDiceCount) || 0,
    isSuppression: !!isSup,
  }
  return applyStructureHits(cells, cell, hits, le, ph, { ...(deps || {}), fireLine })
}

function unitCanEnterDamagedStructure(unit, cell) {
  if (!unit || !cell) return true
  const t = String(unit.type || '')
    .trim()
    .toLowerCase()
  if (t === 'lightair' || t === 'heavyair') return true
  const special = require('./battleSpecialTerrain')
  if (special.isDestroyedBridgeHex(cell)) {
    const { unitHasPropKey } = require('../../core/battleUnitType')
    return unitHasPropKey(unit, 'waterUnit')
  }
  const hp = readHp(cell) || ensureStructureHp(cell)
  if (!hp || !isBridgeKind(hp.kind)) return true
  const str = Math.max(0, Number(hp.str) || 0)
  if (str <= 0) return false
  if (str <= 2 && t === 'heavytank') return false
  if (str <= 1 && t !== 'infantry' && t !== 'artillery') return false
  if (hp.kind === 'railBridge' && str <= 2) {
    const { unitHasPropKey } = require('../../core/battleUnitType')
    if (unitHasPropKey(unit, 'railwayDetachment')) return false
  }
  return true
}

function stationHasLoadBonus(cell) {
  const fire = require('./battleSettlementFire')
  if (fire.isSettlementDestroyed(cell)) return false
  const hp = readHp(cell)
  if (hp && hp.kind === 'station' && Number(hp.str) <= 0) return false
  return true
}

function zeroHpOnArsonDestroy(cell) {
  markHpZero(cell)
}

module.exports = {
  hpKindForCell,
  ensureStructureHp,
  ensureAllStructureHp,
  regenSettlementDefense,
  unitHasBuildFire,
  unitBuildFireIsMeleeOnly,
  unitCanRangedBuildFire,
  isShootableStructureCell,
  isBuildFireTargetCell,
  applyStructureHits,
  applyMissRerollsToStructure,
  shootStructureDirect,
  buildDiceCap,
  unitCanEnterDamagedStructure,
  stationHasLoadBonus,
  zeroHpOnArsonDestroy,
  revealAmbushesOnDestroyedSettlement,
  readHp,
  maxDefForHp,
}

'use strict'

const { getNeighbor, findCellByCoor, hexDistCells } = require('./battleHexGeometry')
const { getStr, setStr, unitFaction, opposing } = require('../unit/battleUnitField')
const { unitHasPropKey } = require('../../core/battleUnitType')
const smoke = require('./battleSmoke')

const VILLAGE_MARKERS = 3
const CITY_MARKERS = 6
const VILLAGE_TURNS = 6
const CITY_TURNS = 9

function hexExtraOf(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function ensureHexExtra(cell) {
  if (!cell.hexExtra || typeof cell.hexExtra !== 'object') cell.hexExtra = {}
  return cell.hexExtra
}

function cellBlob(cell) {
  const ex = hexExtraOf(cell)
  const name = String((cell && cell.name) || (ex && (ex.name || ex.label)) || '')
  const type = String((cell && cell.type) || '')
  const img = String(
    (cell && (cell.img || cell.imagePath)) || (ex && (ex.image_path || ex.img || ex.imagePath)) || '',
  )
  return `${type} ${name} ${img}`
}

function isSettlementDestroyed(cell) {
  const ex = hexExtraOf(cell)
  if (ex && (ex.settlementDestroyed === true || ex.isDestroyedSettlement === true)) return true
  return /полностью разрушен|destroyed\s*settlement/i.test(cellBlob(cell))
}

function markSettlementDestroyed(cell) {
  const ex = ensureHexExtra(cell)
  ex.settlementDestroyed = true
  ex.isDestroyedSettlement = true
  ex.defBonusByType = {}
  ex.defBonusInf = 0
  ex.defBonusTech = 0
  ex.accuracyBonusByType = {}
  ex.accuracyBonusMeleeByType = {}
  ex.accuracyBonusRules = []
  cell.defBonusInf = 0
  cell.defBonusTech = 0
  if (cell.defBonusByType && typeof cell.defBonusByType === 'object') cell.defBonusByType = {}
  if (cell.baseDefend && typeof cell.baseDefend === 'object') {
    cell.baseDefend.infantry = 0
    cell.baseDefend.technics = 0
  }
}

function settlementKind(cell) {
  if (!cell || isSettlementDestroyed(cell)) return null
  const ex = hexExtraOf(cell)
  const blob = cellBlob(cell)
  const railway = require('./battleRailway')
  if (railway.isRailwayStationCell(cell) || (ex && ex.isRailStation === true)) return 'station'
  if (/станци|вокзал|station|жд\s*стан/i.test(blob)) return 'station'
  if (ex && ex.isCity === true) return 'city'
  if (/город|city/i.test(blob) && !/станци|вокзал|station/i.test(blob)) return 'city'
  if (ex && ex.isVillage === true) return 'village'
  if (/деревн|посёл|поселок|village/i.test(blob)) return 'village'
  if (ex && ex.isSettlement === true) return 'village'
  return null
}

function fireDuration(kind) {
  return kind === 'city' ? CITY_TURNS : VILLAGE_TURNS
}

function fireStartMarkers(kind) {
  return kind === 'city' ? CITY_MARKERS : VILLAGE_MARKERS
}

function hasSettlementFire(cell) {
  const f = cell && cell.builds && cell.builds.settlementFire
  return Boolean(f && typeof f === 'object')
}

function settlementFireMeta(cell) {
  return hasSettlementFire(cell) ? cell.builds.settlementFire : null
}

function fireGroupId(originCellId) {
  return 100000 + Number(originCellId)
}

function neighborAtDir(cells, cell, dir) {
  if (!cell || !cell.coor) return null
  const d = ((Math.floor(Number(dir)) % 6) + 6) % 6
  return findCellByCoor(cells, getNeighbor(cell.coor, d))
}

function placeFireSmoke(cell, originCellId) {
  if (!cell) return false
  smoke.placeSmokeOnCell(cell, {
    groupId: fireGroupId(originCellId),
    placedTurn: 0,
    originCellId,
    fromFire: true,
  })
  return true
}

function clearFireSmokes(cells, originCellId, extraIds) {
  const ids = new Set()
  ids.add(Number(originCellId))
  if (Array.isArray(extraIds)) {
    for (const id of extraIds) ids.add(Number(id))
  }
  for (const c of cells) {
    if (!ids.has(Number(c.id))) continue
    const m = smoke.smokeMeta(c.builds)
    if (m && m.fromFire && Number(m.originCellId) === Number(originCellId)) {
      smoke.clearSmokeOnCell(c)
    }
  }
}

function tryStartFire(cell, cells, le, ph, reason) {
  const kind = settlementKind(cell)
  if (!kind) return false
  if (hasSettlementFire(cell)) return false
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  const windDir = Math.abs(Number(cell.id) || 0) % 6
  cell.builds.settlementFire = {
    kind,
    markers: fireStartMarkers(kind),
    turn: 1,
    windDir,
    smokeCellIds: [],
    skipTick: true,
  }
  if (typeof le === 'function') {
    le(ph, `Пожар: ${kind === 'city' ? 'город' : kind === 'station' ? 'станция' : 'деревня'} на кл. ${cell.id} (${fireStartMarkers(kind)} марк.)${reason ? ` — ${reason}` : ''}`, {
      settlementFire: true,
      settlementFireKind: kind,
      settlementFireCellId: Number(cell.id),
      settlementFireMarkers: fireStartMarkers(kind),
      settlementFireTurn: 1,
    })
  }
  void cells
  return true
}

function completeFire(cells, cell, fire, le, ph) {
  const originId = Number(cell.id)
  clearFireSmokes(cells, originId, fire && fire.smokeCellIds)
  delete cell.builds.settlementFire
  markSettlementDestroyed(cell)
  const structureHp = require('./battleStructureHp')
  structureHp.zeroHpOnArsonDestroy(cell)
  structureHp.revealAmbushesOnDestroyedSettlement(cell, le, ph)
  if (typeof le === 'function') {
    le(ph, `Пожар: населённый пункт на кл. ${cell.id} полностью разрушен`, {
      settlementDestroyed: true,
      settlementFireCellId: originId,
    })
  }
}

function applyFireTurnEffects(cells, cell, fire, le, ph) {
  const turn = Number(fire.turn) || 1
  const maxTurn = fireDuration(fire.kind)
  const originId = Number(cell.id)
  if (turn === 2) {
    placeFireSmoke(cell, originId)
    if (!Array.isArray(fire.smokeCellIds)) fire.smokeCellIds = []
    if (!fire.smokeCellIds.includes(originId)) fire.smokeCellIds.push(originId)
    if (typeof le === 'function') {
      le(ph, `Пожар: дым на кл. ${cell.id} (ход ${turn}/${maxTurn})`, {
        settlementFire: true,
        settlementFireCellId: originId,
        settlementFireTurn: turn,
      })
    }
    return
  }
  if (turn === 3) {
    fire.markers = Math.max(0, Number(fire.markers) - 1)
    const n1 = neighborAtDir(cells, cell, fire.windDir)
    if (n1) {
      placeFireSmoke(n1, originId)
      if (!Array.isArray(fire.smokeCellIds)) fire.smokeCellIds = []
      if (!fire.smokeCellIds.includes(Number(n1.id))) fire.smokeCellIds.push(Number(n1.id))
    }
    if (typeof le === 'function') {
      le(ph, `Пожар: кл. ${cell.id} — маркер снят, осталось ${fire.markers}; дым по ветру${n1 ? ` кл. ${n1.id}` : ''}`, {
        settlementFire: true,
        settlementFireCellId: originId,
        settlementFireMarkers: fire.markers,
        settlementFireTurn: turn,
      })
    }
    return
  }
  if (turn === 4) {
    fire.markers = Math.max(0, Number(fire.markers) - 1)
    const n1 = neighborAtDir(cells, cell, fire.windDir)
    const n2 = n1 ? neighborAtDir(cells, n1, fire.windDir) : null
    if (n2) {
      placeFireSmoke(n2, originId)
      if (!Array.isArray(fire.smokeCellIds)) fire.smokeCellIds = []
      if (!fire.smokeCellIds.includes(Number(n2.id))) fire.smokeCellIds.push(Number(n2.id))
    }
    if (typeof le === 'function') {
      le(ph, `Пожар: кл. ${cell.id} — маркер снят, осталось ${fire.markers}; дым дальше по ветру${n2 ? ` кл. ${n2.id}` : ''}`, {
        settlementFire: true,
        settlementFireCellId: originId,
        settlementFireMarkers: fire.markers,
        settlementFireTurn: turn,
      })
    }
    return
  }
  if (turn > 4 && turn < maxTurn) {
    fire.markers = Math.max(0, Number(fire.markers) - 1)
    if (typeof le === 'function') {
      le(ph, `Пожар: кл. ${cell.id} — маркер снят, осталось ${fire.markers} (ход ${turn}/${maxTurn})`, {
        settlementFire: true,
        settlementFireCellId: originId,
        settlementFireMarkers: fire.markers,
        settlementFireTurn: turn,
      })
    }
    return
  }
  if (turn >= maxTurn) {
    completeFire(cells, cell, fire, le, ph)
  }
}

function tickSettlementFires(cells, le, ph) {
  if (!Array.isArray(cells)) return
  const burning = []
  for (const c of cells) {
    if (hasSettlementFire(c)) burning.push(c)
  }
  for (const c of burning) {
    const fire = c.builds.settlementFire
    if (!fire || typeof fire !== 'object') continue
    if (fire.skipTick) {
      delete fire.skipTick
      continue
    }
    fire.turn = (Number(fire.turn) || 1) + 1
    applyFireTurnEffects(cells, c, fire, le, ph)
  }
  smoke.markUnitsOnSmoke(cells)
}

function liveUnitsOnCell(cell) {
  const out = []
  for (const u of (cell && cell.units) || []) {
    if (getStr(u) <= 0) continue
    out.push(u)
  }
  return out
}

function cellHasEnemy(cell, faction) {
  for (const u of liveUnitsOnCell(cell)) {
    if (opposing(faction, unitFaction(u))) return true
  }
  return false
}

function cellCube(cell) {
  const x = Number(cell && cell.coor && cell.coor.x)
  const z = Number(cell && cell.coor && cell.coor.z)
  return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 }
}

function mapBounds(cells) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const c of cells || []) {
    if (!c || !c.coor) continue
    const p = cellCube(c)
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
  return { minX, maxX, minZ, maxZ }
}

function factionCentroid(cells, faction, ignoreCellId) {
  let sx = 0
  let sz = 0
  let n = 0
  const skipId = Number(ignoreCellId)
  for (const c of cells || []) {
    if (Number(c.id) === skipId) continue
    for (const u of liveUnitsOnCell(c)) {
      if (unitFaction(u) !== faction) continue
      const p = cellCube(c)
      sx += p.x
      sz += p.z
      n++
    }
  }
  if (!n) return null
  return { x: sx / n, z: sz / n }
}

function ownEdgeScore(cell, bounds, centroid, faction) {
  const p = cellCube(cell)
  const midX = (bounds.minX + bounds.maxX) / 2
  const midZ = (bounds.minZ + bounds.maxZ) / 2
  let dx = 0
  let dz = 0
  if (centroid) {
    dx = centroid.x - midX
    dz = centroid.z - midZ
  }
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) {
    dx = String(faction || '') === 'rkka' ? -1 : 1
    dz = 0
  }
  return p.x * dx + p.z * dz
}

function nearestEnemyDist(cells, fromCell, faction) {
  let best = Infinity
  for (const c of cells) {
    if (!cellHasEnemy(c, faction)) continue
    const d = hexDistCells(fromCell, c)
    if (d < best) best = d
  }
  return best
}

function nearestAllyDist(cells, fromCell, faction, selfId, ignoreCellId) {
  let best = Infinity
  const skipId = Number(ignoreCellId)
  for (const c of cells) {
    if (Number(c.id) === skipId) continue
    for (const u of liveUnitsOnCell(c)) {
      if (Number(u.instanceId) === Number(selfId)) continue
      if (unitFaction(u) !== faction) continue
      const d = hexDistCells(fromCell, c)
      if (d < best) best = d
    }
  }
  return best
}

function isImpassableFleeHex(unit, toCell) {
  const special = require('./battleSpecialTerrain')
  const { unitHasPropKey: hasProp } = require('../../core/battleUnitType')
  if (!special.canEnterElevation3(unit, toCell)) return true
  if (special.isDestroyedBridgeHex(toCell) && !special.unitCanEnterDestroyedBridge(unit, toCell)) return true
  const water =
    special.isWaterUnitRiverHex(toCell) || special.isWaterObstacleHex(toCell)
  if (water && !hasProp(unit, 'waterUnit') && !hasProp(unit, 'crossingAWaterObstacle')) return true
  const { isRavine, unitCannotCrossRavine } = require('./battleElevation')
  const ponton = require('./battlePonton')
  if (isRavine(toCell) && unitCannotCrossRavine(unit) && !ponton.isPontonComplete(toCell && toCell.builds)) {
    return true
  }
  return false
}

function canStepOffFire(fromCell, toCell, unit, cells) {
  if (!fromCell || !toCell || !unit) return false
  if (Number(toCell.id) === Number(fromCell.id)) return false
  if (hasSettlementFire(toCell)) return false
  if (cellHasEnemy(toCell, unitFaction(unit))) return false
  if (isImpassableFleeHex(unit, toCell)) return false
  let live = 0
  for (const u of toCell.units || []) {
    if (getStr(u) <= 0) continue
    live += 1
  }
  if (live >= 3) return false
  void cells
  return true
}

function pickFleeCell(cells, fromCell, unit) {
  const { isArtilleryDeployedForBattle } = require('../../core/battleUnitType')
  const elevation = require('./battleElevation')
  if (isArtilleryDeployedForBattle(unit)) return null
  if (elevation.isBattleAirUnitType(unit)) return null
  const fac = unitFaction(unit)
  const fromId = Number(fromCell.id)
  const cands = []
  for (let dir = 0; dir < 6; dir++) {
    const nb = neighborAtDir(cells, fromCell, dir)
    if (!nb) continue
    if (!canStepOffFire(fromCell, nb, unit, cells)) continue
    cands.push(nb)
  }
  if (!cands.length) return null
  const bounds = mapBounds(cells)
  const centroid = factionCentroid(cells, fac, fromId)
  cands.sort((a, b) => {
    const aEn = nearestEnemyDist(cells, a, fac)
    const bEn = nearestEnemyDist(cells, b, fac)
    if (aEn !== bEn) return bEn - aEn
    const aAl = nearestAllyDist(cells, a, fac, unit.instanceId, fromId)
    const bAl = nearestAllyDist(cells, b, fac, unit.instanceId, fromId)
    if (aAl !== bAl) return aAl - bAl
    const aEd = ownEdgeScore(a, bounds, centroid, fac)
    const bEd = ownEdgeScore(b, bounds, centroid, fac)
    if (aEd !== bEd) return bEd - aEd
    return Number(a.id) - Number(b.id)
  })
  return cands[0]
}

function tryFleeFromFire(cells, unit, fromCell, le, ph, deps) {
  const analog = require('../unit/battleMeleeAnalog')
  const { findUnitOnField } = require('../unit/battleUnitField')
  analog.breakMeleeLink(unit, cells, { findUnitOnField: (deps && deps.findUnitOnField) || findUnitOnField })
  const dest = pickFleeCell(cells, fromCell, unit)
  if (!dest) return false
  let remove = deps && deps.removeUnitFromCell
  let add = deps && deps.addUnitToCell
  let sync = deps && deps.syncUnitCoor
  if (typeof remove !== 'function') {
    remove = (cell, instanceId) => {
      if (!cell.units) return
      cell.units = cell.units.filter((u) => Number(u.instanceId) !== Number(instanceId))
    }
  }
  if (typeof add !== 'function') {
    add = (cell, u) => {
      if (!cell.units) cell.units = []
      cell.units.push(u)
    }
  }
  if (typeof sync !== 'function') {
    sync = (u, cell) => {
      if (cell && cell.coor) u.coor = { ...cell.coor }
    }
  }
  remove(fromCell, unit.instanceId)
  add(dest, unit)
  sync(unit, dest)
  if (unit.tactical) delete unit.tactical.onSettlementFire
  if (typeof le === 'function') {
    le(ph, `Пожар: юнит ${unit.instanceId} вышел с горящего гекса ${fromCell.id} → кл. ${dest.id}`)
  }
  return true
}

function sortFireLeavers(units) {
  return units.slice().sort((a, b) => {
    const aFlame = unitHasPropKey(a, 'attackMoral') ? 0 : 1
    const bFlame = unitHasPropKey(b, 'attackMoral') ? 0 : 1
    if (aFlame !== bFlame) return aFlame - bFlame
    return Number(a.instanceId) - Number(b.instanceId)
  })
}

function fleeEveryoneOnBurningCell(cells, cell, le, ph, deps) {
  if (!cell || !hasSettlementFire(cell)) return
  const elevation = require('./battleElevation')
  const leavers = sortFireLeavers(liveUnitsOnCell(cell))
  for (const u of leavers) {
    if (elevation.isBattleAirUnitType(u)) continue
    if (!u.tactical) u.tactical = {}
    u.tactical.onSettlementFire = true
    const left = tryFleeFromFire(cells, u, cell, le, ph, deps)
    if (!left && typeof le === 'function') {
      le(ph, `Пожар: юнит ${u.instanceId} остался на горящем гексе ${cell.id}`)
    }
  }
}

function applyFireStrengthLoss(cell, units, le, ph, deps) {
  const elevation = require('./battleElevation')
  const { logUnitDestroyed, trySteadfastnessAfterOverwatchDamage } = deps || {}
  for (const u of units) {
    if (elevation.isBattleAirUnitType(u)) continue
    const prev = getStr(u)
    setStr(u, prev - 1)
    if (typeof le === 'function') {
      le(ph, `Пожар: юнит ${u.instanceId} на кл. ${cell.id} −1 численности`)
    }
    if (getStr(u) <= 0) {
      if (typeof logUnitDestroyed === 'function') {
        logUnitDestroyed(le, ph, u, prev, 'пожар', cell.id)
      }
      continue
    }
    if (typeof trySteadfastnessAfterOverwatchDamage === 'function') {
      trySteadfastnessAfterOverwatchDamage(le, ph, u, 1)
    }
  }
}

function applyFireDamageAndFlee(cells, le, ph, deps) {
  if (!Array.isArray(cells)) return
  const burning = cells.filter((c) => hasSettlementFire(c))
  for (const c of burning) {
    const victims = liveUnitsOnCell(c).slice()
    applyFireStrengthLoss(c, victims, le, ph, deps)
    fleeEveryoneOnBurningCell(cells, c, le, ph, deps)
  }
}

function maybeIgniteFromFlamethrower(unit, cell, cells, le, ph) {
  if (!unitHasPropKey(unit, 'attackMoral')) return false
  return tryStartFire(cell, cells, le, ph, 'огнемётный танк (ближний бой)')
}

function maybeIgniteFromBombardment(unit, cell, cells, le, ph) {
  if (!unit || !cell) return false
  const incendiary =
    unitHasPropKey(unit, 'incendiary') ||
    /зажигат|incendiary/i.test(String(unit.name || ''))
  if (!incendiary) return false
  return tryStartFire(cell, cells, le, ph, 'зажигательная бомбардировка')
}

module.exports = {
  VILLAGE_TURNS,
  CITY_TURNS,
  settlementKind,
  isSettlementDestroyed,
  hasSettlementFire,
  settlementFireMeta,
  tryStartFire,
  tickSettlementFires,
  applyFireDamageAndFlee,
  maybeIgniteFromFlamethrower,
  maybeIgniteFromBombardment,
  markSettlementDestroyed,
}

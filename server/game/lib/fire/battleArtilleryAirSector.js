'use strict'

const { normalizeFireObject } = require('./battleFireNormalize')
const {
  isArtilleryDeployedForBattle,
  unitHasPropKey,
  unitUsesGunDeploy,
} = require('../../core/battleUnitType')
const airSortie = require('../air/battleAirSortie')
const { buildFlightPathCellIds } = require('../map/battleHexGeometry')
const { terrainAccuracyBonusFromCell } = require('../map/battleTerrain')

function fireRowKeyForAirUnit(airUnit) {
  const t = String(airUnit?.type ?? '').toLowerCase()
  if (t === 'lightair') return 'sa'
  if (t === 'heavyair') return 'ba'
  return null
}

function hasRangedFireIntensityAgainstAir(artillery, rowKey) {
  const fp = normalizeFireObject(artillery.fireParsed || artillery._fireRaw || artillery.fire)
  const arr = fp[rowKey]
  if (!Array.isArray(arr) || !arr.length) return false
  return arr.some((n) => Number(n) > 0)
}

/** Может ли орудие вести огонь ПВО по данному типу авиации. */
function artilleryCanSectorFireAtAirUnit(artillery, airUnit) {
  if (!unitUsesGunDeploy(artillery) || !isArtilleryDeployedForBattle(artillery)) return false
  if (!artillery.tactical?.artilleryFireSector) return false
  const sec = artillery.defendSectorCellIds
  if (!Array.isArray(sec) || !sec.length) return false
  const rowKey = fireRowKeyForAirUnit(airUnit)
  if (!rowKey) return false
  const opts = artillery.fireRowOptions?.[rowKey]
  if (opts && opts.melee === true) return false
  if (hasRangedFireIntensityAgainstAir(artillery, rowKey)) return true
  if (unitHasPropKey(artillery, 'fireAirGun')) return true
  if (unitHasPropKey(artillery, 'fireSector')) return true
  return false
}

function hasActiveArtillerySector(artillery) {
  return (
    unitUsesGunDeploy(artillery) &&
    isArtilleryDeployedForBattle(artillery) &&
    artillery.tactical?.artilleryFireSector === true &&
    Array.isArray(artillery.defendSectorCellIds) &&
    artillery.defendSectorCellIds.length > 0
  )
}

function findFirstSectorEntryCellId(pathCellIds, sectorCellIds) {
  if (!Array.isArray(pathCellIds) || !pathCellIds.length) return null
  const sec = new Set((sectorCellIds || []).map((x) => Number(x)).filter(Number.isFinite))
  if (!sec.size) return null
  const path = pathCellIds.map((x) => Number(x)).filter(Number.isFinite)
  if (!path.length) return null
  let prevIn = sec.has(path[0])
  if (prevIn) return path[0]
  for (let i = 1; i < path.length; i++) {
    const stepIn = sec.has(path[i])
    if (stepIn && !prevIn) return path[i]
    prevIn = stepIn
  }
  return null
}

function ensureSectorShotLedger(airUnit) {
  const sortie = airSortie.ensureAirSortie(airUnit)
  if (!Array.isArray(sortie.artillerySectorShotKeys)) sortie.artillerySectorShotKeys = []
  return sortie.artillerySectorShotKeys
}

function wasSectorShotFired(airUnit, key) {
  const ledger = airUnit.tactical?.airSortie?.artillerySectorShotKeys
  return Array.isArray(ledger) && ledger.includes(key)
}

function markSectorShotFired(airUnit, key) {
  const ledger = ensureSectorShotLedger(airUnit)
  if (!ledger.includes(key)) ledger.push(key)
}

function airMissionTargetsArtilleryUnit(cells, airUnit, artilleryUnit, findUnitOnField) {
  const artLive = findUnitOnField(cells, artilleryUnit.instanceId)
  if (!artLive || Number(artLive.unit.instanceId) !== Number(artilleryUnit.instanceId)) return false
  const targetCellId = Number(airUnit.tactical?.airMissionTargetCellId)
  if (!Number.isFinite(targetCellId)) return false
  if (Number(artLive.cell.id) !== targetCellId) return false
  const sortie = airUnit.tactical?.airSortie
  const ok = String(sortie?.activeOrderKey || airUnit.tactical?.airMissionOrderKey || '').trim()
  if (ok === 'interception') {
    const tid = Number(sortie?.interceptionTargetId)
    return Number.isFinite(tid) && tid === Number(artilleryUnit.instanceId)
  }
  return true
}

/** ПВО при прилёте: сектор покрывает клетку миссии (десант, сброс, штурмовка и т.д.). */
function defenderCoversMissionTargetCell(artilleryUnit, missionTargetCellId) {
  const tid = Number(missionTargetCellId)
  if (!Number.isFinite(tid)) return false
  const sec = artilleryUnit.defendSectorCellIds
  if (!Array.isArray(sec) || !sec.length) return false
  return sec.some((id) => Number(id) === tid)
}

function defenderEligibleForInboundStrikeSectorFire(
  cells,
  airUnit,
  artilleryUnit,
  missionTargetCellId,
  findUnitOnField,
) {
  const sortie = airUnit.tactical?.airSortie
  const orderKey = String(sortie?.activeOrderKey || airUnit.tactical?.airMissionOrderKey || '').trim()
  if (orderKey === 'interception') {
    return airMissionTargetsArtilleryUnit(cells, airUnit, artilleryUnit, findUnitOnField)
  }
  return defenderCoversMissionTargetCell(artilleryUnit, missionTargetCellId)
}

function collectArtillerySectorDefenders(cells, airUnit, deps) {
  const { getStr, opposing, unitFaction } = deps
  const out = []
  for (let ci = 0; ci < cells.length; ci++) {
    const c = cells[ci]
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      if (!hasActiveArtillerySector(u)) continue
      if (!opposing(unitFaction(u), unitFaction(airUnit))) continue
      if (!artilleryCanSectorFireAtAirUnit(u, airUnit)) continue
      out.push({ unit: u, cell: c })
    }
  }
  return out
}

function resolveShotCell(cells, cellId) {
  const id = Number(cellId)
  if (!Number.isFinite(id)) return null
  return cells.find((c) => Number(c.id) === id) || null
}

function expandFlightPathForSectorCheck(cells, pathCellIds) {
  if (!Array.isArray(pathCellIds) || pathCellIds.length < 2) return pathCellIds || []
  if (pathCellIds.length > 2) return pathCellIds
  const fromCell = resolveShotCell(cells, pathCellIds[0])
  const toCell = resolveShotCell(cells, pathCellIds[pathCellIds.length - 1])
  if (!fromCell || !toCell) return pathCellIds
  const full = buildFlightPathCellIds(cells, fromCell, toCell)
  return Array.isArray(full) && full.length >= 2 ? full : pathCellIds
}

function fireArtillerySectorShot(
  cells,
  defenderPack,
  airUnit,
  airPhysicalCell,
  shotCellId,
  shotKind,
  le,
  ph,
  deps,
) {
  const {
    getStr,
    getAmmo,
    setAmmo,
    defenderSeesCellForOverwatch,
    hexDist,
    rangeArrayFor,
    rangeArrayForAtCell,
    fireRangeTableMode,
    intensityArrayFor,
    computeShoot,
    setStr,
    logUnitDestroyed,
    isHexVisible,
    unitHasPropKey,
    trySteadfastnessAfterOverwatchDamage,
    sweepCorpses,
    findUnitOnField,
  } = deps

  const du = defenderPack.unit
  const defCell = defenderPack.cell
  const defInst = Number(du.instanceId)
  const airInst = Number(airUnit.instanceId)
  if (!Number.isFinite(defInst) || !Number.isFinite(airInst)) return false

  const owCell = resolveShotCell(cells, shotCellId)
  if (!owCell) return false

  const secSet = new Set((du.defendSectorCellIds || []).map((x) => Number(x)))
  if (!secSet.has(Number(owCell.id))) return false
  if (getAmmo(du) < 1) return false

  const airLive = findUnitOnField(cells, airInst)
  if (!airLive || getStr(airLive.unit) <= 0) return false

  if (!defenderSeesCellForOverwatch(cells, defCell, owCell, du)) return false

  const d = hexDist(
    defCell.coor.x,
    defCell.coor.y,
    defCell.coor.z,
    owCell.coor.x,
    owCell.coor.y,
    owCell.coor.z,
  )
  const ra = rangeArrayForAtCell(du, defCell)
  const rMode = fireRangeTableMode(ra)
  const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (outOfRange) return false

  const ia = intensityArrayFor(du, airLive.unit)
  const losOw = isHexVisible(defCell, owCell, cells)
  let artilleryClosedOw = false
  if (!losOw) {
    if (!unitHasPropKey(du, 'concealedTargetFire')) return false
    artilleryClosedOw = true
  }

  const accBonus = terrainAccuracyBonusFromCell(defCell, du, airLive.unit, false)
  const res = computeShoot(
    du,
    airLive.unit,
    owCell,
    d,
    ia,
    ra,
    false,
    undefined,
    0,
    accBonus,
    artilleryClosedOw,
    1,
  )
  setAmmo(du, getAmmo(du) - 1)

  const kindLabel =
    shotKind === 'strike'
      ? 'налёт на цель'
      : shotKind === 'return-entry'
        ? 'возвращение, вход в сектор'
        : 'вход в сектор'

  le(
    ph,
    `Огонь ПВО: ${defInst} → авиация ${airInst} (${kindLabel}, кл. ${owCell.id}), попаданий ${res.hits}, урон ${res.damages} (выпало: ${res.rollResults.join(',')})`,
    {
      fireLine: {
        attackerId: defInst,
        targetId: airInst,
        fromCellId: defCell.id,
        targetCellId: owCell.id,
        hits: res.hits,
        damages: res.damages,
        rollResults: res.rollResults,
        warDef: false,
        isSuppression: false,
        baseDiceCount: res.baseDiceCount,
        diceCount: res.diceCount,
        ammoCost: 1,
        accuracy: Number(res?.accuracy) || 0,
        defendOverwatch: true,
        artilleryAirSector: true,
        airSectorShotKind: shotKind,
      },
    },
  )

  const prevStr = getStr(airLive.unit)
  setStr(airLive.unit, prevStr - res.damages)
  logUnitDestroyed(le, ph, airLive.unit, prevStr, 'огонь ПВО', owCell.id)
  sweepCorpses(cells)
  const after = findUnitOnField(cells, airInst)
  if (after && getStr(after.unit) > 0) {
    trySteadfastnessAfterOverwatchDamage(le, ph, after.unit, res.damages)
  }
  return true
}

function processArtillerySectorFireForDefenders(
  cells,
  airUnit,
  airPhysicalCell,
  defenders,
  shotCellId,
  shotKind,
  ledgerPrefix,
  le,
  ph,
  deps,
) {
  if (!shotCellId || !defenders.length) return
  for (let i = 0; i < defenders.length; i++) {
    const def = defenders[i]
    const key = `${Number(def.unit.instanceId)}:${ledgerPrefix}:${Number(shotCellId)}`
    if (wasSectorShotFired(airUnit, key)) continue
    const ok = fireArtillerySectorShot(
      cells,
      def,
      airUnit,
      airPhysicalCell,
      shotCellId,
      shotKind,
      le,
      ph,
      deps,
    )
    if (ok) markSectorShotFired(airUnit, key)
  }
}

/** Первое пересечение сектора на маршруте (подлёт). */
function processInboundEntrySectorFire(cells, airUnit, airPhysicalCell, pathCellIds, le, ph, deps) {
  if (!airSortie.isBattleAirUnit(airUnit)) return
  const path = expandFlightPathForSectorCheck(cells, pathCellIds)
  const defenders = collectArtillerySectorDefenders(cells, airUnit, deps)
  if (!defenders.length) return
  for (let i = 0; i < defenders.length; i++) {
    const def = defenders[i]
    const entryCellId = findFirstSectorEntryCellId(path, def.unit.defendSectorCellIds)
    if (entryCellId == null) continue
    processArtillerySectorFireForDefenders(
      cells,
      airUnit,
      airPhysicalCell,
      [def],
      entryCellId,
      'inbound-entry',
      'inbound-entry',
      le,
      ph,
      deps,
    )
  }
}

/** Второй выстрел: самолёт над клеткой миссии — все зенитки, чей сектор её покрывает. */
function processInboundStrikeSectorFire(cells, airUnit, airPhysicalCell, missionTargetCellId, le, ph, deps) {
  if (!airSortie.isBattleAirUnit(airUnit)) return
  const targetCellId = Number(missionTargetCellId)
  if (!Number.isFinite(targetCellId)) return
  const defenders = collectArtillerySectorDefenders(cells, airUnit, deps).filter(({ unit }) =>
    defenderEligibleForInboundStrikeSectorFire(
      cells,
      airUnit,
      unit,
      targetCellId,
      deps.findUnitOnField,
    ),
  )
  if (!defenders.length) return
  processArtillerySectorFireForDefenders(
    cells,
    airUnit,
    airPhysicalCell,
    defenders,
    targetCellId,
    'strike',
    'inbound-strike',
    le,
    ph,
    deps,
  )
}

/** Первое пересечение сектора на обратном маршруте. */
function processReturnEntrySectorFire(cells, airUnit, airPhysicalCell, returnPathCellIds, le, ph, deps) {
  if (!airSortie.isBattleAirUnit(airUnit)) return
  const path = expandFlightPathForSectorCheck(cells, returnPathCellIds)
  const defenders = collectArtillerySectorDefenders(cells, airUnit, deps)
  if (!defenders.length) return
  for (let i = 0; i < defenders.length; i++) {
    const def = defenders[i]
    const entryCellId = findFirstSectorEntryCellId(path, def.unit.defendSectorCellIds)
    if (entryCellId == null) continue
    processArtillerySectorFireForDefenders(
      cells,
      airUnit,
      airPhysicalCell,
      [def],
      entryCellId,
      'return-entry',
      'return-entry',
      le,
      ph,
      deps,
    )
  }
}

function processAirInboundArrivalSectorFire(cells, airUnit, airPhysicalCell, le, ph, deps) {
  const path = airSortie.readFlightPathCellIds(airUnit)
  const targetCellId = Number(airUnit.tactical?.airMissionTargetCellId)
  processInboundEntrySectorFire(cells, airUnit, airPhysicalCell, path, le, ph, deps)
  processInboundStrikeSectorFire(cells, airUnit, airPhysicalCell, targetCellId, le, ph, deps)
}

function afterBeginAirCooldown(cells, airUnit, fromCellId, outboundPathIds, le, ph, deps) {
  const returnPath = airSortie.reversePathCellIds(outboundPathIds)
  const live = deps.findUnitOnField(cells, airUnit.instanceId)
  const physCell = live?.cell || { id: fromCellId }
  processReturnEntrySectorFire(cells, airUnit, physCell, returnPath, le, ph, deps)
}

function beginAirCooldownWithSector(
  cells,
  unit,
  departureCellId,
  outboundPathIds,
  fromCellId,
  firedWeapons,
  le,
  ph,
  deps,
) {
  airSortie.beginAirCooldown(unit, departureCellId, outboundPathIds, fromCellId, firedWeapons, le, ph)
  if (cells && deps) {
    afterBeginAirCooldown(cells, unit, fromCellId, outboundPathIds, le, ph, deps)
  }
}

function processAirAppearanceSectorFire(cells, airUnit, airPhysicalCell, le, ph, deps) {
  const sortie = airUnit.tactical?.airSortie
  if (sortie?.artilleryAppearanceSectorProcessed) return
  const path = airSortie.readFlightPathCellIds(airUnit)
  processInboundEntrySectorFire(cells, airUnit, airPhysicalCell, path, le, ph, deps)
  if (sortie && typeof sortie === 'object') sortie.artilleryAppearanceSectorProcessed = true
}

module.exports = {
  fireRowKeyForAirUnit,
  artilleryCanSectorFireAtAirUnit,
  findFirstSectorEntryCellId,
  processInboundEntrySectorFire,
  processInboundStrikeSectorFire,
  processReturnEntrySectorFire,
  processAirInboundArrivalSectorFire,
  processAirAppearanceSectorFire,
  afterBeginAirCooldown,
  beginAirCooldownWithSector,
}

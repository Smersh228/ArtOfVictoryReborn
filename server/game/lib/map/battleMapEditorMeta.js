'use strict'

const { isArtilleryUnit, isInfantryUnit, unitHasPropKey } = require('../../core/battleUnitType')
const { ensureCarriedUnits } = require('../../core/battleTransport')
const {
  computeDefendSectorIds,
  maxShootRangeStepsForUnit,
  isValidDefendFacing,
} = require('./battleDefendSector')

function isTruckUnitEditor(u) {
  const t = String(u?.type ?? '').toLowerCase()
  if (t !== 'tech') return false
  return /грузовик/i.test(String(u.name || ''))
}

function readArtilleryDeployMeta(meta) {
  if (!meta || typeof meta !== 'object') return {}
  if (meta.artilleryDeploy && typeof meta.artilleryDeploy === 'object') {
    return { ...meta.artilleryDeploy }
  }
  if (meta.artilleryDeployed === true) {
    return { deployed: true }
  }
  return {}
}

function isBattleAirUnitType(u) {
  const t = String(u?.type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

function maxBattleInstanceId(cells) {
  let max = 0
  if (!Array.isArray(cells)) return max
  const visit = (u) => {
    const id = Number(u?.instanceId)
    if (Number.isFinite(id) && id > max) max = id
    const carried = u?.tactical?.carriedUnits
    if (Array.isArray(carried)) {
      for (let i = 0; i < carried.length; i++) visit(carried[i])
    }
  }
  for (let ci = 0; ci < cells.length; ci++) {
    const us = cells[ci].units || []
    for (let ui = 0; ui < us.length; ui++) visit(us[ui])
  }
  return max
}

function ensureDeployedArtillerySector(cells, unitCell, unit) {
  if (!unit || !unitCell || !Array.isArray(cells)) return false
  if (!isArtilleryUnit(unit)) return false
  if (!unit.tactical || unit.tactical.artilleryDeployed !== true) return false

  const facingId = Number(unit.defendFacingCellId)
  if (!Number.isFinite(facingId)) return false
  if (!isValidDefendFacing(unitCell, facingId, cells)) return false
  const fCell = cells.find((fc) => Number(fc.id) === facingId)
  if (!fCell) return false

  const rcapRaw = Number(unit.defendMaxRangeSteps)
  const rcap =
    Number.isFinite(rcapRaw) && rcapRaw >= 1 ? Math.floor(rcapRaw) : maxShootRangeStepsForUnit(unit)
  if (rcap < 1) return false

  const sectorIds = computeDefendSectorIds(cells, unitCell, fCell, unit, rcap)
  if (!sectorIds.length) return false

  if (!unit.tactical || typeof unit.tactical !== 'object') unit.tactical = {}
  unit.tactical.artilleryFireSector = true
  unit.defendFacingCellId = facingId
  unit.defendMaxRangeSteps = rcap
  unit.defendSectorCellIds = sectorIds
  return true
}

/** Пересчёт сектора для развёрнутой артиллерии с направлением, но без defendSectorCellIds. */
function finalizeDeployedArtillerySectors(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isArtilleryUnit(u)) continue
      if (!u.tactical || u.tactical.artilleryDeployed !== true) continue
      const sec = u.defendSectorCellIds
      if (Array.isArray(sec) && sec.length > 0) continue
      ensureDeployedArtillerySector(cells, c, u)
    }
  }
}

function applyMapEditorMetaToBattleUnits(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      const meta = u.orderEditorMeta
      if (!meta || typeof meta !== 'object') continue
      if (!u.tactical || typeof u.tactical !== 'object') u.tactical = {}

      const artDep = readArtilleryDeployMeta(meta)
      if (artDep.deployed === true && isArtilleryUnit(u)) {
        u.tactical.artilleryDeployed = true
        if (artDep.facingCellId != null && Number.isFinite(Number(artDep.facingCellId))) {
          u.defendFacingCellId = Number(artDep.facingCellId)
        }
        ensureDeployedArtillerySector(cells, c, u)
      }

      for (const key of ['loading', 'unloading', 'tow']) {
        const block = meta[key]
        if (block && typeof block === 'object') {
          u.tactical[`mapEditor_${key}`] = {
            cargoKind: block.cargoKind != null ? String(block.cargoKind) : undefined,
            catalogUnitId:
              block.catalogUnitId != null && Number.isFinite(Number(block.catalogUnitId))
                ? Number(block.catalogUnitId)
                : undefined,
          }
        }
      }
    }
  }
}

/** Десантники из редактора карты → tactical.carriedUnits самолёта. */
function spawnMapEditorDesantParatroopers(cells, catalogById, enrichUnitFromCatalogRow) {
  if (!Array.isArray(cells) || !catalogById || typeof enrichUnitFromCatalogRow !== 'function') return
  let nextId = maxBattleInstanceId(cells) + 1
  for (let ci = 0; ci < cells.length; ci++) {
    for (const plane of cells[ci].units || []) {
      if (!isBattleAirUnitType(plane)) continue
      const meta = plane.orderEditorMeta
      const catalogId = Number(meta?.desant?.catalogUnitId)
      if (!Number.isFinite(catalogId)) continue
      const row = catalogById.get(catalogId)
      if (!row) continue
      const carried = ensureCarriedUnits(plane)
      if (carried.some((x) => Number(x.id) === catalogId)) continue
      const paratrooper = {
        id: catalogId,
        instanceId: nextId++,
        faction: plane.faction,
      }
      enrichUnitFromCatalogRow(paratrooper, row)
      if (!paratrooper.name || !String(paratrooper.name).trim()) {
        paratrooper.name = row.name != null ? String(row.name) : `Юнит ${paratrooper.instanceId}`
      }
      if (!paratrooper.type && row.type != null) paratrooper.type = String(row.type)
      if (paratrooper.str == null) {
        const n = Number(row.count)
        paratrooper.str = Number.isFinite(n) && n > 0 ? n : 1
      }
      if (paratrooper.strength == null) paratrooper.strength = paratrooper.str
      if (!unitHasPropKey(paratrooper, 'desant')) continue
      const planeStr = Number(plane.str ?? plane.strength)
      const pStr = Number(paratrooper.str ?? paratrooper.strength)
      if (Number.isFinite(planeStr) && planeStr > 0 && Number.isFinite(pStr) && pStr > planeStr) {
        paratrooper.str = planeStr
      }
      carried.push(paratrooper)
    }
  }
}

function collectTruckCargoCatalogUnitIds(cells) {
  const ids = new Set()
  if (!Array.isArray(cells)) return ids
  for (let ci = 0; ci < cells.length; ci++) {
    for (const u of cells[ci].units || []) {
      if (!isTruckUnitEditor(u)) continue
      const meta = u.orderEditorMeta
      if (!meta || typeof meta !== 'object') continue
      for (const key of ['loading', 'tow']) {
        const catalogId = Number(meta[key]?.catalogUnitId)
        if (Number.isFinite(catalogId)) ids.add(catalogId)
      }
    }
  }
  return ids
}

/** Пехота / артиллерия из редактора карты → tactical.carriedUnits грузовика. */
function spawnMapEditorTruckCargo(cells, catalogById, enrichUnitFromCatalogRow) {
  if (!Array.isArray(cells) || !catalogById || typeof enrichUnitFromCatalogRow !== 'function') return
  let nextId = maxBattleInstanceId(cells) + 1
  for (let ci = 0; ci < cells.length; ci++) {
    for (const truck of cells[ci].units || []) {
      if (!isTruckUnitEditor(truck)) continue
      const meta = truck.orderEditorMeta
      if (!meta || typeof meta !== 'object') continue
      const carried = ensureCarriedUnits(truck)
      const truckStr = Number(truck.str ?? truck.strength)
      const truckCap = Number.isFinite(truckStr) && truckStr > 0 ? truckStr : null

      for (const key of ['loading', 'tow']) {
        const block = meta[key]
        const catalogId = Number(block?.catalogUnitId)
        if (!Number.isFinite(catalogId)) continue
        if (carried.some((x) => Number(x.id) === catalogId)) continue
        const row = catalogById.get(catalogId)
        if (!row) continue
        const cargo = {
          id: catalogId,
          instanceId: nextId++,
          faction: truck.faction,
        }
        enrichUnitFromCatalogRow(cargo, row)
        if (!cargo.name || !String(cargo.name).trim()) {
          cargo.name = row.name != null ? String(row.name) : `Юнит ${cargo.instanceId}`
        }
        if (!cargo.type && row.type != null) cargo.type = String(row.type)
        if (cargo.str == null) {
          const n = Number(row.count)
          cargo.str = Number.isFinite(n) && n > 0 ? n : 1
        }
        if (cargo.strength == null) cargo.strength = cargo.str
        if (key === 'loading' && !isInfantryUnit(cargo)) continue
        if (key === 'tow' && !isArtilleryUnit(cargo)) continue
        if (truckCap != null) {
          const cStr = Number(cargo.str ?? cargo.strength)
          if (Number.isFinite(cStr) && cStr > truckCap) cargo.str = truckCap
        }
        if (!cargo.tactical || typeof cargo.tactical !== 'object') cargo.tactical = {}
        if (isArtilleryUnit(cargo)) {
          cargo.tactical.artilleryDeployed = false
        }
        carried.push(cargo)
      }
    }
  }
}

function collectDesantCatalogUnitIds(cells) {
  const ids = new Set()
  if (!Array.isArray(cells)) return ids
  for (let ci = 0; ci < cells.length; ci++) {
    for (const u of cells[ci].units || []) {
      const catalogId = Number(u.orderEditorMeta?.desant?.catalogUnitId)
      if (Number.isFinite(catalogId)) ids.add(catalogId)
    }
  }
  return ids
}

module.exports = {
  applyMapEditorMetaToBattleUnits,
  finalizeDeployedArtillerySectors,
  spawnMapEditorDesantParatroopers,
  spawnMapEditorTruckCargo,
  collectDesantCatalogUnitIds,
  collectTruckCargoCatalogUnitIds,
}

'use strict'

const { findPath } = require('../map/battleHexMovement')
const { hexDistCells } = require('../map/battleHexGeometry')
const { terrainAccuracyBonusFromCell } = require('../map/battleTerrain')
const { isHiddenConcealed, canSpotHiddenTarget } = require('../unit/battleHiddenState')

function pathContainsCellId(path, cellId) {
  const id = Number(cellId)
  if (!Number.isFinite(id) || !Array.isArray(path)) return false
  return path.some((c) => Number(c.id) === id)
}

function validateFireMoveOrder(cells, found, o, deps) {
  const {
    isArtilleryUnit,
    isArtilleryDeployedForBattle,
    isMoveOrderValid,
    findUnitOnField,
    factionsOpposed,
    unitFaction,
    computeRevealedCellIdsForFaction,
    isAmbushConcealed,
    canSpotAmbushTarget,
    rangeArrayForAtCell,
    fireRangeTableMode,
    isHexVisible,
    artilleryAreaClosedIgnoresTerrainLos,
  } = deps
  if (isArtilleryUnit(found.unit) && isArtilleryDeployedForBattle(found.unit)) {
    return 'развёрнутая артиллерия не передвигается — «Свёртывание»'
  }
  const cid = o.targetCellId
  if (cid == null) return 'нужна клетка назначения (targetCellId)'
  const dest = cells.find((c) => Number(c.id) === Number(cid))
  if (!dest) return 'клетка назначения не существует'
  if (!isMoveOrderValid(cells, found.unit.instanceId, cid, 'move')) {
    return 'клетка недостижима за ОД (походное положение)'
  }
  const tid = o.targetUnitInstanceId
  if (tid == null || !Number.isFinite(Number(tid))) return 'нужна цель (targetUnitInstanceId)'
  const tgt = findUnitOnField(cells, tid)
  if (!tgt) return 'цель не на поле'
  if (!factionsOpposed(unitFaction(found.unit), unitFaction(tgt.unit))) {
    return 'цель должна быть противником'
  }
  const fireFromId = o.fireFromCellId != null ? Number(o.fireFromCellId) : Number(cid)
  if (!Number.isFinite(fireFromId)) return 'укажите гекс выстрела (fireFromCellId)'
  const fog = computeRevealedCellIdsForFaction(cells, unitFaction(found.unit))
  const path = findPath(found.cell, dest, cells, found.unit, fog)
  if (!path) return 'нет пути до клетки назначения'
  if (!pathContainsCellId(path, fireFromId)) {
    return 'гекс выстрела должен лежать на пути движения'
  }
  const fromCell = cells.find((c) => Number(c.id) === fireFromId)
  if (!fromCell) return 'гекс выстрела не найден'
  if (isAmbushConcealed(tgt.unit) && !canSpotAmbushTarget(found.unit, fromCell, tgt.unit, tgt.cell, cells)) {
    return 'цель в засаде — не обнаружена'
  }
  if (isHiddenConcealed(tgt.unit) && !canSpotHiddenTarget(found.unit, fromCell, tgt.unit, tgt.cell, cells, deps)) {
    return 'скрытый отряд — не обнаружен'
  }
  const d = hexDistCells(fromCell, tgt.cell)
  const ra = rangeArrayForAtCell(found.unit, fromCell)
  const mode = fireRangeTableMode(ra)
  const out =
    mode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (out) return 'цель вне дальности с гекса выстрела'
  if (!artilleryAreaClosedIgnoresTerrainLos(found.unit) && !isHexVisible(fromCell, tgt.cell, cells)) {
    return 'нет прямой видимости с гекса выстрела'
  }
  return null
}

function resolveFireMoveShot(cells, o, moverPack, path, endStepIndex, le, ph, deps) {
  const {
    findUnitOnField,
    getStr,
    getAmmo,
    setAmmo,
    getMeleeOpponentId,
    rangeArrayForAtCell,
    fireRangeTableMode,
    intensityArrayFor,
    computeShoot,
    isHexVisible,
    artilleryAreaClosedIgnoresTerrainLos,
    moveWarDefenseBonus,
    ordersByUnit,
    isAmbushConcealed,
    canSpotAmbushTarget,
    revealHiddenUnit,
    hexDist,
  } = deps
  const tid = Number(o.targetUnitInstanceId)
  const destId = Number(o.targetCellId)
  const fireFromId = o.fireFromCellId != null ? Number(o.fireFromCellId) : destId
  const traversed = Array.isArray(path) ? path.slice(0, endStepIndex + 1) : []
  if (!pathContainsCellId(traversed, fireFromId)) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — гекс выстрела не достигнут`)
    return
  }
  const fromCell = cells.find((c) => Number(c.id) === fireFromId)
  if (!fromCell) return

  const tgt = findUnitOnField(cells, tid)
  const targetDead = !tgt || getStr(tgt.unit) <= 0
  if (!targetDead && getMeleeOpponentId(tgt.unit) != null) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — цель в ближнем бою, выстрел не производится`)
    return
  }

  const ammo = getAmmo(moverPack.unit)
  if (ammo < 1) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — нет БК`)
    return
  }

  if (targetDead) {
    setAmmo(moverPack.unit, ammo - 1)
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — цель уничтожена, −1 БК`)
    return
  }

  if (isAmbushConcealed(tgt.unit) && !canSpotAmbushTarget(moverPack.unit, fromCell, tgt.unit, tgt.cell, cells)) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — цель в засаде`)
    return
  }
  if (isHiddenConcealed(tgt.unit) && !canSpotHiddenTarget(moverPack.unit, fromCell, tgt.unit, tgt.cell, cells, deps)) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — скрытый отряд не обнаружен`)
    return
  }

  const d = hexDist(
    fromCell.coor.x,
    fromCell.coor.y,
    fromCell.coor.z,
    tgt.cell.coor.x,
    tgt.cell.coor.y,
    tgt.cell.coor.z,
  )
  const ra = rangeArrayForAtCell(moverPack.unit, fromCell)
  const mode = fireRangeTableMode(ra)
  const out = mode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (out) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — цель вне дальности`)
    return
  }
  if (!artilleryAreaClosedIgnoresTerrainLos(moverPack.unit) && !isHexVisible(fromCell, tgt.cell, cells)) {
    le(ph, `Стрельба в движении: юнит ${moverPack.unit.instanceId} — нет видимости`)
    return
  }

  const ia = intensityArrayFor(moverPack.unit, tgt.unit)
  const warDef = moveWarDefenseBonus(tgt.unit.instanceId, ordersByUnit)
  const accBonus = terrainAccuracyBonusFromCell(fromCell, moverPack.unit, tgt.unit, false)
  const res = computeShoot(
    moverPack.unit,
    tgt.unit,
    tgt.cell,
    d,
    ia,
    ra,
    false,
    undefined,
    warDef,
    accBonus,
    false,
    1,
    { intensityHalveCeil: true },
  )
  setAmmo(moverPack.unit, ammo - 1)
  if (isHiddenConcealed(tgt.unit)) revealHiddenUnit(tgt.unit)
  const structureHp = require('../map/battleStructureHp')
  structureHp.applyMissRerollsToStructure(
    cells,
    tgt.cell,
    res.rollResults,
    res.accuracy,
    moverPack.unit,
    le,
    ph,
    { intensityArrayFor, getDiceCount: deps.getDiceCount, computeShoot, rangeArrayForAtCell, logUnitDestroyed: deps.logUnitDestroyed },
  )
  const { setStr, logUnitDestroyed, isTruckUnit, applyCargoDamageFromTruckHit, sweepCorpses } = deps
  const prev = getStr(tgt.unit)
  setStr(tgt.unit, prev - (Number(res.damages) || 0))
  logUnitDestroyed(le, ph, tgt.unit, prev, 'стрельба в движении', tgt.cell?.id)
  if (isTruckUnit(tgt.unit)) applyCargoDamageFromTruckHit(cells, tgt.unit, Number(res.damages) || 0)
  sweepCorpses(cells)
  le(
    ph,
    `Стрельба в движении: ${moverPack.unit.instanceId} с кл. ${fromCell.id} → ${tgt.unit.instanceId}, попаданий ${res.hits} (куб. ${res.diceCount}), −1 БК`,
    {
      fireLine: {
        attackerId: moverPack.unit.instanceId,
        targetId: tgt.unit.instanceId,
        fromCellId: fromCell.id,
        targetCellId: tgt.cell.id,
        hits: res.hits,
        damages: res.damages,
        rollResults: res.rollResults,
        warDef: !!warDef,
        isSuppression: false,
        baseDiceCount: res.baseDiceCount,
        diceCount: res.diceCount,
        ammoCost: 1,
        fireMove: true,
      },
    },
  )
}

module.exports = {
  validateFireMoveOrder,
  resolveFireMoveShot,
  pathContainsCellId,
}

const {
  findUnitOnField,
  unitFaction,
  factionsOpposed,
  isMoveOrderValid,
  isAttackOrderValid,
  validateUnitOrdersAllowed,
  validateLogisticsOrder,
  isInfantryUnit,
  isArtilleryUnit,
  isArmoredVehicleTarget,
  isArtilleryDeployedForBattle,
  isArtilleryFireTargetCellAllowed,
  getAmmoForValidate,
  canSpotAmbushTarget,
  unitHasPropKey,
  validateArtilleryAreaFireOnCellOnly,
  shootingAccuracyAtHexDistance,
  hexDistCells,
} = require('../../battleEngine')
const { cellBlocksLineOfSight, isCellSeenByAnyHostileUnit } = require('../map/battleFogVisibility')
const { computeDefendSectorIds, isValidDefendFacing, maxShootRangeStepsForUnit } = require('../map/battleDefendSector')

function validateBattleOrders(cells, orders, context) {
  const { ownsUnit, normalizeOrderKey, submittableOrderKeys } = context
  if (!Array.isArray(orders)) return 'Некорректный список приказов'
  if (!cells || !cells.length) return 'Поле боя не загружено'
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i] || {}
    if (o.orderKey != null) o.orderKey = normalizeOrderKey(o.orderKey)
    const uid = Number(o.unitInstanceId)
    if (!Number.isFinite(uid)) return `Приказ ${i + 1}: нет unitInstanceId`
    const ok = String(o.orderKey ?? '').trim()
    if (!submittableOrderKeys.has(ok)) return `Приказ ${i + 1}: неизвестный orderKey`
    const found = findUnitOnField(cells, uid)
    if (!found) return `Приказ ${i + 1}: юнит не на поле`
    if (!ownsUnit(found.unit)) return `Приказ ${i + 1}: нельзя отдавать приказ чужому юниту`
    const block = validateUnitOrdersAllowed(found.unit)
    if (block) return `Приказ ${i + 1}: ${block} — приказы недоступны`
    if (ok === 'getSup' || ok === 'loading' || ok === 'unloading' || ok === 'tow') {
      const le = validateLogisticsOrder(cells, o)
      if (le) return `Приказ ${i + 1}: ${le}`
      continue
    }
    if (ok === 'fire' || ok === 'fireHard' || ok === 'attack') {
      const tid = o.targetUnitInstanceId
      const fireCellId = o.targetCellId
      if (
        (ok === 'fire' || ok === 'fireHard') &&
        isArtilleryUnit(found.unit) &&
        unitHasPropKey(found.unit, 'areaFire') &&
        fireCellId != null &&
        Number.isFinite(Number(fireCellId)) &&
        (tid == null || !Number.isFinite(Number(tid)))
      ) {
        const errAf = validateArtilleryAreaFireOnCellOnly(cells, found, Number(fireCellId), ok)
        if (errAf) return `Приказ ${i + 1}: ${errAf}`
        continue
      }
      if (tid == null) return `Приказ ${i + 1}: нужна цель (targetUnitInstanceId)`
      const tgt = findUnitOnField(cells, tid)
      if (!tgt) return `Приказ ${i + 1}: цель не на поле`
      if (!factionsOpposed(unitFaction(found.unit), unitFaction(tgt.unit))) return `Приказ ${i + 1}: цель должна быть противником`
      if ((ok === 'fire' || ok === 'fireHard') && isInfantryUnit(found.unit) && isArmoredVehicleTarget(tgt.unit)) {
        return `Приказ ${i + 1}: пехота не стреляет по бронетехнике и танкам`
      }
      if (ok === 'fire' || ok === 'fireHard') {
        const needAmmo = ok === 'fireHard' ? 3 : 1
        if (getAmmoForValidate(found.unit) < needAmmo) {
          return `Приказ ${i + 1}: недостаточно БК (${ok === 'fireHard' ? 'огонь на подавление — 3' : 'огонь — 1'})`
        }
        const dFire = hexDistCells(found.cell, tgt.cell)
        if (shootingAccuracyAtHexDistance(found.unit, dFire) <= 0) {
          return `Приказ ${i + 1}: на этой дистанции меткость 0 — стрельба невозможна`
        }
      }
      if ((ok === 'fire' || ok === 'fireHard') && isArtilleryUnit(found.unit)) {
        if (!isArtilleryDeployedForBattle(found.unit)) {
          return `Приказ ${i + 1}: артиллерия свёрнута — приказ «Развёртывание»`
        }
        if (!isArtilleryFireTargetCellAllowed(found.unit, tgt.cell.id)) {
          return `Приказ ${i + 1}: цель вне сектора обстрела артиллерии`
        }
      }
      if (
        (ok === 'fire' || ok === 'fireHard' || ok === 'attack') &&
        !canSpotAmbushTarget(found.unit, found.cell, tgt.unit, tgt.cell, cells)
      ) {
        return `Приказ ${i + 1}: цель в засаде — заметна только вплотную, огнём по площади или после её выстрела`
      }
      if (ok === 'attack') {
        if (!isAttackOrderValid(cells, uid, Number(tid))) {
          return `Приказ ${i + 1}: атака невозможна (дистанция ≤ ОП−1 до соседнего гекса цели, на гексе цели только один противник)`
        }
      }
    }
    if (ok === 'move' || ok === 'moveWar') {
      if (isArtilleryUnit(found.unit) && isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: развёрнутая артиллерия не передвигается — «Свёртывание»`
      }
      const cid = o.targetCellId
      if (cid == null) return `Приказ ${i + 1}: нужна клетка (targetCellId)`
      const tc = cells.find((c) => Number(c.id) === Number(cid))
      if (!tc) return `Приказ ${i + 1}: клетка не существует`
      if (!isMoveOrderValid(cells, uid, cid, ok)) {
        return `Приказ ${i + 1}: клетка недостижима за ОД (${ok === 'moveWar' ? 'боевое' : 'походное'} положение)`
      }
    }
    if (ok === 'clotting') {
      if (!isArtilleryUnit(found.unit)) return `Приказ ${i + 1}: только артиллерия`
      continue
    }
    if (ok === 'deploy') {
      if (!isArtilleryUnit(found.unit)) return `Приказ ${i + 1}: только артиллерия`
      if (isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: артиллерия уже развёрнута`
      }
      const tag = 'развёртывание'
      const fid = o.defendFacingCellId
      if (fid == null) return `Приказ ${i + 1}: ${tag} — выберите направление орудия (defendFacingCellId)`
      if (!isValidDefendFacing(found.cell, fid, cells)) {
        return `Приказ ${i + 1}: ${tag} — направление должно быть соседним гексом`
      }
      const fCell = cells.find((c) => Number(c.id) === Number(fid))
      if (!fCell) return `Приказ ${i + 1}: ${tag} — клетка направления не найдена`
      const rcap = Number(o.defendMaxRangeSteps)
      if (!Number.isFinite(rcap) || rcap < 1) {
        return `Приказ ${i + 1}: ${tag} — укажите дистанцию сектора (defendMaxRangeSteps)`
      }
      const wmax = maxShootRangeStepsForUnit(found.unit)
      if (rcap > wmax) return `Приказ ${i + 1}: ${tag} — дистанция больше максимальной для юнита`
      const sectorIds = computeDefendSectorIds(cells, found.cell, fCell, found.unit, rcap)
      if (!sectorIds.length) return `Приказ ${i + 1}: ${tag} — сектор обстрела пуст`
      continue
    }
    if (ok === 'changeSector') {
      if (!isArtilleryUnit(found.unit)) return `Приказ ${i + 1}: только артиллерия`
      if (!isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: смена сектора — сначала «Развёртывание»`
      }
      const tag = 'смена сектора'
      const fid = o.defendFacingCellId
      if (fid == null) return `Приказ ${i + 1}: ${tag} — выберите направление (defendFacingCellId)`
      if (!isValidDefendFacing(found.cell, fid, cells)) {
        return `Приказ ${i + 1}: ${tag} — направление должно быть соседним гексом`
      }
      const fCell = cells.find((c) => Number(c.id) === Number(fid))
      if (!fCell) return `Приказ ${i + 1}: ${tag} — клетка направления не найдена`
      const rcap = Number(o.defendMaxRangeSteps)
      if (!Number.isFinite(rcap) || rcap < 1) {
        return `Приказ ${i + 1}: ${tag} — укажите дистанцию сектора (defendMaxRangeSteps)`
      }
      const wmax = maxShootRangeStepsForUnit(found.unit)
      if (rcap > wmax) return `Приказ ${i + 1}: ${tag} — дистанция больше максимальной для юнита`
      const sectorIds = computeDefendSectorIds(cells, found.cell, fCell, found.unit, rcap)
      if (!sectorIds.length) return `Приказ ${i + 1}: ${tag} — сектор пуст`
      continue
    }
    if (ok === 'defend' || ok === 'ambush') {
      if (isArtilleryUnit(found.unit) && !isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: артиллерия свёрнута — сначала «Развёртывание»`
      }
      const tag = ok === 'ambush' ? 'засада' : 'оборона'
      const fid = o.defendFacingCellId
      if (fid == null) return `Приказ ${i + 1}: ${tag} — выберите направление сектора (defendFacingCellId)`
      if (!isValidDefendFacing(found.cell, fid, cells)) {
        return `Приказ ${i + 1}: ${tag} — направление должно быть соседним гексом`
      }
      const fCell = cells.find((c) => Number(c.id) === Number(fid))
      if (!fCell) return `Приказ ${i + 1}: ${tag} — клетка направления не найдена`
      const rcap = Number(o.defendMaxRangeSteps)
      if (!Number.isFinite(rcap) || rcap < 1) {
        return `Приказ ${i + 1}: ${tag} — укажите дистанцию сектора (defendMaxRangeSteps)`
      }
      const wmax = maxShootRangeStepsForUnit(found.unit)
      if (rcap > wmax) return `Приказ ${i + 1}: ${tag} — дистанция больше максимальной для юнита`
      const sectorIds = computeDefendSectorIds(cells, found.cell, fCell, found.unit, rcap)
      if (!sectorIds.length) return `Приказ ${i + 1}: ${tag} — сектор обстрела пуст`
      if (ok === 'ambush') {
        if (isCellSeenByAnyHostileUnit(found.unit, found.cell, cells)) {
          return `Приказ ${i + 1}: засада — гекс должен быть вне обзора всех юнитов противника`
        }
        if (!cellBlocksLineOfSight(found.cell)) {
          return `Приказ ${i + 1}: засада — гекс юнита должен быть с преградой видимости (лес, город, здание, visionBlock и т.п.)`
        }
      }
    }
  }
  return null
}

module.exports = {
  validateBattleOrders,
}

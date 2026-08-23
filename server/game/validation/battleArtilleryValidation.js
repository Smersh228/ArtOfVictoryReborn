'use strict'

function validateArtilleryAreaFireOnCellOnly(cells, atk, targetCellId, orderKey, deps, options) {
  const {
    isArtilleryUnit,
    unitHasPropKey,
    isArtilleryDeployedForBattle,
    isArtilleryFireTargetCellAllowed,
    hexDistCells,
    rangeArrayFor,
    rangeArrayForAtCell,
    fireRangeTableMode,
    shootingAccuracyAtHexDistance,
    getAmmo,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
    resolveArtilleryFireVisibility,
  } = deps
  const tc = cells.find((c) => Number(c.id) === Number(targetCellId))
  if (!tc) return 'клетка не найдена'
  if (!isArtilleryUnit(atk.unit)) return 'только артиллерия'
  if (!unitHasPropKey(atk.unit, 'areaFire')) return 'нужно свойство «стрельба по площади»'
  const dotMod = require('../lib/map/battleDot')
  if (dotMod.unitInDot(atk.unit)) {
    if (!dotMod.isDotFireTargetCellAllowed(atk.unit, atk.cell, tc.id, cells)) {
      return 'клетка вне сектора стрельбы ДОТ'
    }
  } else {
    if (!isArtilleryDeployedForBattle(atk.unit)) {
      return 'артиллерия свёрнута — приказ «Развёртывание»'
    }
    if (!isArtilleryFireTargetCellAllowed(atk.unit, tc.id)) return 'клетка вне сектора обстрела'
  }
  const d = hexDistCells(atk.cell, tc)
  const ra = rangeArrayForAtCell ? rangeArrayForAtCell(atk.unit, atk.cell) : rangeArrayFor(atk.unit)
  const rMode = fireRangeTableMode(ra)
  const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (outOfRange) return 'клетка вне дальности стрельбы'
  const acc =
    shootingAccuracyAtHexDistance.length >= 3
      ? shootingAccuracyAtHexDistance(atk.unit, d, atk.cell)
      : shootingAccuracyAtHexDistance(atk.unit, d)
  if (acc <= 0) {
    return 'на этой дистанции меткость 0 — огонь невозможен'
  }
  const isSup = String(orderKey || '').trim() === 'fireHard'
  const needAmmo = isSup ? 3 : 1
  if (getAmmo(atk.unit) < needAmmo) {
    return isSup ? 'недостаточно БК для подавления (нужно 3)' : 'недостаточно БК для огня (нужен 1)'
  }
  const losVis = resolveArtilleryFireVisibility
    ? resolveArtilleryFireVisibility(
        atk,
        tc,
        cells,
        { unitHasPropKey, isArtilleryUnit, artilleryAreaClosedIgnoresTerrainLos, isHexVisible },
        { useFireAdjustment: !!(options && options.useFireAdjustment) },
      )
    : {
        allowed:
          artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, tc, cells),
      }
  if (!losVis.allowed) {
    return losVis.reason || 'нет прямой видимости на клетку (нужно «Стрельба по закрытым целям» или корректировка огня)'
  }
  return null
}

module.exports = {
  validateArtilleryAreaFireOnCellOnly,
}

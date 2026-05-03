'use strict'

function validateArtilleryAreaFireOnCellOnly(cells, atk, targetCellId, orderKey, deps) {
  const {
    isArtilleryUnit,
    unitHasPropKey,
    isArtilleryDeployedForBattle,
    isArtilleryFireTargetCellAllowed,
    hexDistCells,
    rangeArrayFor,
    fireRangeTableMode,
    shootingAccuracyAtHexDistance,
    getAmmo,
    artilleryAreaClosedIgnoresTerrainLos,
    isHexVisible,
  } = deps
  const tc = cells.find((c) => Number(c.id) === Number(targetCellId))
  if (!tc) return 'клетка не найдена'
  if (!isArtilleryUnit(atk.unit)) return 'только артиллерия'
  if (!unitHasPropKey(atk.unit, 'areaFire')) return 'нужно свойство «стрельба по площади»'
  if (!isArtilleryDeployedForBattle(atk.unit)) {
    return 'артиллерия свёрнута — приказ «Развёртывание»'
  }
  if (!isArtilleryFireTargetCellAllowed(atk.unit, tc.id)) return 'клетка вне сектора обстрела'
  const d = hexDistCells(atk.cell, tc)
  const ra = rangeArrayFor(atk.unit)
  const rMode = fireRangeTableMode(ra)
  const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (outOfRange) return 'клетка вне дальности стрельбы'
  if (shootingAccuracyAtHexDistance(atk.unit, d) <= 0) {
    return 'на этой дистанции меткость 0 — огонь невозможен'
  }
  const isSup = String(orderKey || '').trim() === 'fireHard'
  const needAmmo = isSup ? 3 : 1
  if (getAmmo(atk.unit) < needAmmo) {
    return isSup ? 'недостаточно БК для подавления (нужно 3)' : 'недостаточно БК для огня (нужен 1)'
  }
  const losClear =
    artilleryAreaClosedIgnoresTerrainLos(atk.unit) || isHexVisible(atk.cell, tc, cells)
  if (!losClear && !unitHasPropKey(atk.unit, 'concealedTargetFire')) {
    return 'нет прямой видимости на клетку (нужно свойство «Стрельба по закрытым целям»)'
  }
  return null
}

module.exports = {
  validateArtilleryAreaFireOnCellOnly,
}

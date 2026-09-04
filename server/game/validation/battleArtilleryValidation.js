'use strict'

function validateArtilleryAreaFireOnCellOnly(cells, atk, targetCellId, orderKey, deps, options) {
  const {
    isArtilleryUnit,
    unitUsesGunDeploy,
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
  const reactive = !!(options && options.useReactiveFire)
  if (!unitHasPropKey(atk.unit, 'areaFire') && !reactive) {
    return 'нужно свойство «стрельба по площади»'
  }
  const dotMod = require('../lib/map/battleDot')
  if (dotMod.unitInDot(atk.unit)) {
    if (!dotMod.isDotFireTargetCellAllowed(atk.unit, atk.cell, tc.id, cells)) {
      return 'клетка вне сектора стрельбы ДОТ'
    }
  } else {
    if (unitUsesGunDeploy(atk.unit) && !isArtilleryDeployedForBattle(atk.unit)) {
      return 'орудие свёрнуто — приказ «Развёртывание»'
    }
    if (!isArtilleryFireTargetCellAllowed(atk.unit, tc.id)) return 'клетка вне сектора обстрела'
  }
  const d = hexDistCells(atk.cell, tc)
  const { normalizeFireObject } = require('../lib/fire/battleFireNormalize')
  const fireTables =
    options && options.useReactiveFire
      ? normalizeFireObject(atk.unit.fireReactive)
      : undefined
  const ra = rangeArrayForAtCell
    ? rangeArrayForAtCell(atk.unit, atk.cell, fireTables)
    : rangeArrayFor(atk.unit, fireTables)
  const rMode = fireRangeTableMode(ra)
  const outOfRange = rMode === 'ranged' ? d < 1 || d >= ra.length : d > ra.length
  if (outOfRange) return 'клетка вне дальности стрельбы'
  const acc =
    shootingAccuracyAtHexDistance.length >= 3
      ? shootingAccuracyAtHexDistance(atk.unit, d, atk.cell, fireTables)
      : shootingAccuracyAtHexDistance(atk.unit, d)
  if (acc <= 0) {
    return 'на этой дистанции меткость 0 — огонь невозможен'
  }
  const isSup = String(orderKey || '').trim() === 'fireHard'
  const needAmmo = isSup ? 3 : 1
  let haveAmmo = getAmmo(atk.unit)
  if (dotMod.dotShooterUsesDotAmmo(atk.unit)) {
    haveAmmo = dotMod.getDotAmmo(atk.cell.builds)
  }
  if (haveAmmo < needAmmo) {
    const src = dotMod.dotShooterUsesDotAmmo(atk.unit) ? 'боезапас ДОТ' : 'БК'
    return isSup ? `недостаточно ${src} для подавления (нужно 3)` : `недостаточно ${src} для огня (нужен 1)`
  }
  if (dotMod.dotFireIgnoresTerrainLos(atk.unit)) return null
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

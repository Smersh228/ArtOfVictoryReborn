'use strict'

function getDef(u) {
  const n = Number(u.def ?? u.defend)
  return Number.isFinite(n) ? n : 0
}

function usesTechMoveCost(type) {
  const t = String(type || '')
  return [
    'tech',
    'armor',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'lightAir',
    'heavyAir',
  ].includes(t)
}

function terrainEntryCost(cell, unit) {
  const mcInf = cell.moveCostInf ?? cell.moveCost ?? 1
  const mcTech = cell.moveCostTech ?? cell.moveCost ?? 1
  if (usesTechMoveCost(unit.type)) return mcTech
  return mcInf
}

function terrainDefenseBonusFromCell(targetCell, targetUnit) {
  if (!targetCell || !targetUnit) return 0
  const usesTech = usesTechMoveCost(targetUnit.type)
  let bi = Math.max(0, Number(targetCell.defBonusInf) || 0)
  let bt = Math.max(0, Number(targetCell.defBonusTech) || 0)
  if (bi === 0 && bt === 0 && targetCell.baseDefend != null && typeof targetCell.baseDefend === 'object') {
    bi = Math.max(0, Number(targetCell.baseDefend.infantry) || 0)
    bt = Math.max(0, Number(targetCell.baseDefend.technics) || 0)
  }
  return usesTech ? bt : bi
}

module.exports = {
  getDef,
  usesTechMoveCost,
  terrainEntryCost,
  terrainDefenseBonusFromCell,
}

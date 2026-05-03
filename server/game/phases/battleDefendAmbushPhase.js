'use strict'

function processDefendPhase(cells, list, le, ph, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    isArtilleryUnit,
    isArtilleryDeployedForBattle,
    isValidDefendFacing,
    maxShootRangeStepsForUnit,
    computeDefendSectorIds,
  } = deps
  for (const o of list) {
    const cur = findUnitOnField(cells, o.unitId)
    if (!cur) continue
    const stBlock = validateUnitOrdersAllowed(cur.unit)
    if (stBlock) {
      le(ph, `Оборона: юнит ${o.unitId} — ${stBlock}`)
      continue
    }
    const okOrder = String(o.orderKey || '').trim()
    if (okOrder !== 'defend') continue
    if (isArtilleryUnit(cur.unit)) {
      if (!isArtilleryDeployedForBattle(cur.unit)) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — сначала развернитесь`)
        continue
      }
      const fidA = o.defendFacingCellId
      if (fidA == null || !isValidDefendFacing(cur.cell, fidA, cells)) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — неверное направление`)
        continue
      }
      const fCellA = cells.find((c) => Number(c.id) === Number(fidA))
      if (!fCellA) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — клетка направления не найдена`)
        continue
      }
      const rcapA = Number(o.defendMaxRangeSteps)
      if (!Number.isFinite(rcapA) || rcapA < 1) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — укажите дистанцию сектора`)
        continue
      }
      const wmaxA = maxShootRangeStepsForUnit(cur.unit)
      if (rcapA > wmaxA) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — дистанция больше максимальной`)
        continue
      }
      const sectorIdsA = computeDefendSectorIds(cells, cur.cell, fCellA, cur.unit, rcapA)
      if (!sectorIdsA.length) {
        le(ph, `Сектор обстрела: артиллерия ${o.unitId} — пустой сектор`)
        continue
      }
      if (!cur.unit.tactical) cur.unit.tactical = {}
      delete cur.unit.tactical.defendOrder
      delete cur.unit.tactical.ambushOrder
      delete cur.unit.tactical.ambushRevealed
      cur.unit.tactical.artilleryFireSector = true
      cur.unit.defendFacingCellId = Number(fidA)
      cur.unit.defendMaxRangeSteps = Math.floor(rcapA)
      cur.unit.defendSectorCellIds = sectorIdsA
      le(ph, `Сектор обстрела: артиллерия ${o.unitId}, дист. ${Math.floor(rcapA)}, ${sectorIdsA.length} кл.`, {
        defendFacingCellId: Number(fidA),
        defendMaxRangeSteps: Math.floor(rcapA),
        defendSectorCellIds: sectorIdsA,
        unitInstanceId: Number(o.unitId),
        artilleryFireSector: true,
      })
      continue
    }
    const fid = o.defendFacingCellId
    if (fid == null || !isValidDefendFacing(cur.cell, fid, cells)) {
      le(ph, `Оборона: юнит ${o.unitId} — нет или неверное направление сектора`)
      continue
    }
    const fCell = cells.find((c) => Number(c.id) === Number(fid))
    if (!fCell) {
      le(ph, `Оборона: юнит ${o.unitId} — клетка направления не найдена`)
      continue
    }
    const rcap = Number(o.defendMaxRangeSteps)
    if (!Number.isFinite(rcap) || rcap < 1) {
      le(ph, `Оборона: юнит ${o.unitId} — не выбрана дистанция сектора`)
      continue
    }
    const sectorIds = computeDefendSectorIds(cells, cur.cell, fCell, cur.unit, rcap)
    if (!sectorIds.length) {
      le(ph, `Оборона: юнит ${o.unitId} — пустой сектор обстрела`)
      continue
    }
    if (!cur.unit.tactical) cur.unit.tactical = {}
    delete cur.unit.tactical.ambushRevealed
    cur.unit.tactical.defendOrder = true
    cur.unit.tactical.ambushOrder = false
    cur.unit.defendFacingCellId = Number(fid)
    cur.unit.defendMaxRangeSteps = Math.floor(rcap)
    cur.unit.defendSectorCellIds = sectorIds
    le(ph, `Оборона: юнит ${o.unitId}, дист. ${Math.floor(rcap)}, сектор ${sectorIds.length} кл.`, {
      defendFacingCellId: Number(fid),
      defendMaxRangeSteps: Math.floor(rcap),
      defendSectorCellIds: sectorIds,
      unitInstanceId: Number(o.unitId),
      isAmbush: false,
    })
  }
}

function processAmbushPhase(cells, list, le, ph, deps) {
  const {
    findUnitOnField,
    validateUnitOrdersAllowed,
    isArtilleryUnit,
    isArtilleryDeployedForBattle,
    isValidDefendFacing,
    maxShootRangeStepsForUnit,
    computeDefendSectorIds,
    cellBlocksLineOfSight,
  } = deps
  for (const o of list) {
    const cur = findUnitOnField(cells, o.unitId)
    if (!cur) continue
    const stBlock = validateUnitOrdersAllowed(cur.unit)
    if (stBlock) {
      le(ph, `Засада: юнит ${o.unitId} — ${stBlock}`)
      continue
    }
    const okOrder = String(o.orderKey || '').trim()
    if (okOrder !== 'ambush') continue
    if (isArtilleryUnit(cur.unit)) {
      if (!isArtilleryDeployedForBattle(cur.unit)) {
        le(ph, `Засада: артиллерия ${o.unitId} — сначала развернитесь`)
        continue
      }
      const fidA = o.defendFacingCellId
      if (fidA == null || !isValidDefendFacing(cur.cell, fidA, cells)) {
        le(ph, `Засада (артиллерия): юнит ${o.unitId} — неверное направление`)
        continue
      }
      const fCellA = cells.find((c) => Number(c.id) === Number(fidA))
      if (!fCellA) {
        le(ph, `Засада (артиллерия): юнит ${o.unitId} — клетка направления не найдена`)
        continue
      }
      const rcapA = Number(o.defendMaxRangeSteps)
      if (!Number.isFinite(rcapA) || rcapA < 1) {
        le(ph, `Засада (артиллерия): юнит ${o.unitId} — укажите дистанцию сектора`)
        continue
      }
      const wmaxA = maxShootRangeStepsForUnit(cur.unit)
      if (rcapA > wmaxA) {
        le(ph, `Засада (артиллерия): юнит ${o.unitId} — дистанция больше максимальной`)
        continue
      }
      const sectorIdsA = computeDefendSectorIds(cells, cur.cell, fCellA, cur.unit, rcapA)
      if (!sectorIdsA.length) {
        le(ph, `Засада (артиллерия): юнит ${o.unitId} — пустой сектор`)
        continue
      }
      if (!cur.unit.tactical) cur.unit.tactical = {}
      delete cur.unit.tactical.ambushRevealed
      cur.unit.tactical.defendOrder = false
      cur.unit.tactical.ambushOrder = true
      cur.unit.tactical.artilleryFireSector = true
      cur.unit.defendFacingCellId = Number(fidA)
      cur.unit.defendMaxRangeSteps = Math.floor(rcapA)
      cur.unit.defendSectorCellIds = sectorIdsA
      le(ph, `Засада (артиллерия): юнит ${o.unitId}, дист. ${Math.floor(rcapA)}, ${sectorIdsA.length} кл.`, {
        defendFacingCellId: Number(fidA),
        defendMaxRangeSteps: Math.floor(rcapA),
        defendSectorCellIds: sectorIdsA,
        unitInstanceId: Number(o.unitId),
        artilleryFireSector: true,
        isAmbush: true,
      })
      continue
    }
    if (!cellBlocksLineOfSight(cur.cell)) {
      le(ph, `Засада: юнит ${o.unitId} — только на клетке с преградой видимости`)
      continue
    }
    const fid = o.defendFacingCellId
    if (fid == null || !isValidDefendFacing(cur.cell, fid, cells)) {
      le(ph, `Засада: юнит ${o.unitId} — нет или неверное направление сектора`)
      continue
    }
    const fCell = cells.find((c) => Number(c.id) === Number(fid))
    if (!fCell) {
      le(ph, `Засада: юнит ${o.unitId} — клетка направления не найдена`)
      continue
    }
    const rcap = Number(o.defendMaxRangeSteps)
    if (!Number.isFinite(rcap) || rcap < 1) {
      le(ph, `Засада: юнит ${o.unitId} — не выбрана дистанция сектора`)
      continue
    }
    const sectorIds = computeDefendSectorIds(cells, cur.cell, fCell, cur.unit, rcap)
    if (!sectorIds.length) {
      le(ph, `Засада: юнит ${o.unitId} — пустой сектор обстрела`)
      continue
    }
    if (!cur.unit.tactical) cur.unit.tactical = {}
    delete cur.unit.tactical.ambushRevealed
    cur.unit.tactical.defendOrder = false
    cur.unit.tactical.ambushOrder = true
    cur.unit.defendFacingCellId = Number(fid)
    cur.unit.defendMaxRangeSteps = Math.floor(rcap)
    cur.unit.defendSectorCellIds = sectorIds
    le(ph, `Засада: юнит ${o.unitId}, дист. ${Math.floor(rcap)}, сектор ${sectorIds.length} кл.`, {
      defendFacingCellId: Number(fid),
      defendMaxRangeSteps: Math.floor(rcap),
      defendSectorCellIds: sectorIds,
      unitInstanceId: Number(o.unitId),
      isAmbush: true,
    })
  }
}

module.exports = {
  processDefendPhase,
  processAmbushPhase,
}

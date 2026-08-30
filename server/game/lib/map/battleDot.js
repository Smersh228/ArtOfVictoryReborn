'use strict'

const { getNeighbor, findCellByCoor, hexDistCells } = require('./battleHexGeometry')
const { targetTypeToFireKey } = require('../fire/battleFireNormalize')

const EMPTY_BUILDS = {
  trench: 0,
  trenchEdges: 0,
  wire: 0,
  wireEdges: 0,
  antiTankBuild: 0,
  antiTankEdges: 0,
  storage: 0,
  mine: 0,
  trenchTank: 0,
  dot: 0,
  pontonBridge: 0,
}

const DOT_INF_RANGE = [3, 2, 1]
const DOT_ART_RANGE = [2, 2, 1, 1]

const DOT_INF_INTENSITY = { inf: 10, art: 10, tech: 10 }
const DOT_ART_INTENSITY = {
  inf: 6,
  art: 6,
  tech: 9,
  armor: 10,
  lt: 12,
  mt: 12,
  ht: 10,
}

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return { ...EMPTY_BUILDS }
  return { ...EMPTY_BUILDS, ...builds }
}

function hasDotOnCell(builds) {
  return Number(ensureBuilds(builds).dot) > 0
}

function initDotBattleFields(builds) {
  const b = ensureBuilds(builds)
  if (!hasDotOnCell(b)) return b
  const out = { ...b }
  const def = Number(out.dotDef)
  if (!Number.isFinite(def) || def <= 0) out.dotDef = 4
  const ammo = Number(out.dotAmmo)
  if (!Number.isFinite(ammo)) out.dotAmmo = 15
  return out
}

function getDotOccupantInstanceId(builds) {
  const id = Number(ensureBuilds(builds).dotOccupantId)
  return Number.isFinite(id) && id > 0 ? id : null
}

function isDotEmpty(builds, dotCell, cells, getStr, findUnitOnField) {
  if (!hasDotOnCell(builds)) return false
  const occId = getDotOccupantInstanceId(builds)
  if (occId == null) return true
  if (!dotCell || !cells || !getStr || !findUnitOnField) return false
  const found = findUnitOnField(cells, occId)
  if (!found || getStr(found.unit) <= 0 || !unitHoldsDot(found.unit)) {
    dotCell.builds = ensureBuilds(dotCell.builds)
    delete dotCell.builds.dotOccupantId
    return true
  }
  return false
}

function unitInDot(unit) {
  return !!(unit && unit.tactical && unit.tactical.inDot)
}

function unitDotExiting(unit) {
  const n = Number(unit?.tactical?.dotExitTurnsLeft)
  return Number.isFinite(n) && n > 0
}

function unitDotEntering(unit) {
  const n = Number(unit?.tactical?.dotEnterTurnsLeft)
  return Number.isFinite(n) && n > 0
}

function unitHoldsDot(unit) {
  return unitInDot(unit) || unitDotEntering(unit)
}

function countSurfaceUnitsOnCell(cell, getStr) {
  const us = cell.units || []
  let n = 0
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (getStr(u) <= 0) continue
    if (unitInDot(u)) continue
    n++
  }
  return n
}

function maxSurfaceUnitsOnCell(cell) {
  if (hasDotOnCell(cell.builds)) return 2
  return 3
}

function canUnitOccupySurfaceOnCell(cell, getStr) {
  return countSurfaceUnitsOnCell(cell, getStr) < maxSurfaceUnitsOnCell(cell)
}

function canEnterDotUnitType(unit, isInfantryUnit, isArtilleryUnit) {
  return isInfantryUnit(unit) || isArtilleryUnit(unit)
}

function dotExitTurnsForUnit(unit, isInfantryUnit, isArtilleryUnit) {
  if (isArtilleryUnit(unit)) return 2
  if (isInfantryUnit(unit)) return 1
  return 0
}

function isAxialNeighbor(a, b) {
  if (!a || !b) return false
  const dx = Number(b.coor.x) - Number(a.coor.x)
  const dz = Number(b.coor.z) - Number(a.coor.z)
  const axial = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ]
  for (let i = 0; i < axial.length; i++) {
    if (axial[i][0] === dx && axial[i][1] === dz) return true
  }
  return false
}

function findMoveDir(fromCell, toCell, allCells) {
  if (!fromCell || !toCell) return 0
  const dx = Number(toCell.coor.x) - Number(fromCell.coor.x)
  const dz = Number(toCell.coor.z) - Number(fromCell.coor.z)
  const dirs = [
    { x: 1, z: 0 },
    { x: 1, z: -1 },
    { x: 0, z: -1 },
    { x: -1, z: 0 },
    { x: -1, z: 1 },
    { x: 0, z: 1 },
  ]
  for (let dir = 0; dir < 6; dir++) {
    if (dirs[dir].x === dx && dirs[dir].z === dz) return dir
  }
  for (let dir = 0; dir < 6; dir++) {
    const nb = getNeighbor(fromCell.coor, dir)
    const c = findCellByCoor(allCells, nb)
    if (c && Number(c.id) === Number(toCell.id)) return dir
  }
  return 0
}

function resolveDotFacingDir(dotCell, allCells) {
  const facingCellId = Number(dotCell?.builds?.dotFacingCellId)
  if (allCells && Number.isFinite(facingCellId)) {
    const nb = allCells.find((c) => Number(c.id) === facingCellId)
    if (nb) return findMoveDir(dotCell, nb, allCells)
  }
  const n = Number(dotCell?.builds?.dotFacing)
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.floor(n)
  return 0
}

function hasEditorDotFacing(builds) {
  const n = Number(builds && builds.dotFacing)
  if (Number.isFinite(n) && n >= 0 && n <= 5) return true
  const cid = Number(builds && builds.dotFacingCellId)
  return Number.isFinite(cid)
}

function dotRangeArrayForUnit(unit, isInfantryUnit, isArtilleryUnit) {
  if (!unitInDot(unit) || unitDotExiting(unit)) return null
  if (isArtilleryUnit(unit)) return DOT_ART_RANGE.slice()
  if (isInfantryUnit(unit)) return DOT_INF_RANGE.slice()
  return null
}

function dotIntensityArrayFor(attacker, target, isInfantryUnit, isArtilleryUnit) {
  if (!unitInDot(attacker) || unitDotExiting(attacker)) return null
  const key = targetTypeToFireKey(target.type)
  let v = 0
  if (isInfantryUnit(attacker)) {
    v = DOT_INF_INTENSITY[key] ?? 0
  } else if (isArtilleryUnit(attacker)) {
    v = DOT_ART_INTENSITY[key] ?? 0
  } else {
    return null
  }
  return [v]
}

function getDotAmmo(builds) {
  return Math.max(0, Math.floor(Number(ensureBuilds(builds).dotAmmo) || 0))
}

function setDotAmmoOnCell(cell, n) {
  cell.builds = ensureBuilds(cell.builds)
  cell.builds.dotAmmo = Math.max(0, Math.floor(n))
}

function getDotDef(builds) {
  const d = Number(ensureBuilds(builds).dotDef)
  return Number.isFinite(d) && d > 0 ? d : 4
}

function dotShooterUsesDotAmmo(unit) {
  return unitInDot(unit) && !unitDotExiting(unit)
}

function dotShooterCanFire(unit) {
  if (!unitInDot(unit)) return true
  return !unitDotExiting(unit)
}

function getDotAmmoCost(isSup) {
  return isSup ? 3 : 1
}

function shooterHasAmmoForFire(atk, ammoCost, getAmmo) {
  if (dotShooterUsesDotAmmo(atk.unit)) {
    return getDotAmmo(atk.cell.builds) >= ammoCost
  }
  return getAmmo(atk.unit) >= ammoCost
}

function deductShooterAmmoForFire(atk, ammoCost, isSup, getAmmo, setAmmo) {
  if (dotShooterUsesDotAmmo(atk.unit)) {
    const have = getDotAmmo(atk.cell.builds)
    setDotAmmoOnCell(atk.cell, have - ammoCost)
    return
  }
  setAmmo(atk.unit, getAmmo(atk.unit) - ammoCost)
}

function consumeDotAmmoForFire(cell, isSup) {
  const cost = getDotAmmoCost(isSup)
  const have = getDotAmmo(cell.builds)
  if (have < cost) return false
  setDotAmmoOnCell(cell, have - cost)
  return true
}

function ejectDotOccupant(cells, cell, le, ph, findUnitOnField, ensureTacticalBattle) {
  const occId = getDotOccupantInstanceId(cell.builds)
  if (occId == null) return
  const found = findUnitOnField(cells, occId)
  if (found) {
    const tac = ensureTacticalBattle(found.unit)
    delete tac.inDot
    delete tac.dotExitTurnsLeft
    delete tac.dotEnterTurnsLeft
    if (le && ph) le(ph, `Юнит ${occId} выбит из ДОТ на кл. ${cell.id}`)
  }
  cell.builds = ensureBuilds(cell.builds)
  delete cell.builds.dotOccupantId
}

function destroyDot(cells, cell, le, ph, reason, deps) {
  const { findUnitOnField, ensureTacticalBattle } = deps || {}
  if (findUnitOnField && ensureTacticalBattle) {
    ejectDotOccupant(cells, cell, le, ph, findUnitOnField, ensureTacticalBattle)
  }
  cell.builds = ensureBuilds(cell.builds)
  cell.builds.dot = 0
  cell.builds.dotDef = 0
  cell.builds.dotAmmo = 0
  delete cell.builds.dotOccupantId
  delete cell.builds.dotFacing
  delete cell.builds.dotFacingCellId
  if (le && ph) le(ph, `ДОТ на кл. ${cell.id} уничтожен (${reason})`)
}

function applyDotDefDamage(cells, cell, damages, le, ph, deps) {
  if (!hasDotOnCell(cell.builds) || damages <= 0) return false
  let def = getDotDef(cell.builds)
  def -= damages
  cell.builds = ensureBuilds(cell.builds)
  if (def <= 0) {
    destroyDot(cells, cell, le, ph, 'потеря защиты', deps)
    return true
  }
  cell.builds.dotDef = def
  if (le && ph) le(ph, `ДОТ кл. ${cell.id}: защита ${def} (−${damages})`)
  return true
}

function tryDamageDotFromFire(targetCell, attacker, shooterCell, distance, deps, le, ph) {
  if (!targetCell || !attacker || !hasDotOnCell(targetCell.builds)) return false
  const { intensityArrayFor, rangeArrayForAtCell, computeShoot, cells, findUnitOnField, ensureTacticalBattle } =
    deps
  const virtualTarget = { type: 'build', def: 1, str: 1 }
  const intensity = intensityArrayFor(attacker, virtualTarget)
  const buildPower = intensity && intensity.length ? Number(intensity[0]) : 0
  if (!(buildPower > 0)) return false
  const dotDef = getDotDef(targetCell.builds)
  const rangeArray = rangeArrayForAtCell(attacker, shooterCell)
  const result = computeShoot(
    attacker,
    virtualTarget,
    targetCell,
    distance,
    [buildPower],
    rangeArray,
    false,
    null,
    Math.max(0, dotDef - 1),
    0,
    false,
    1,
  )
  if (result.damages > 0) {
    applyDotDefDamage(cells, targetCell, result.damages, le, ph, { findUnitOnField, ensureTacticalBattle })
  } else if (le && ph) {
    le(ph, `Огонь по ДОТ кл. ${targetCell.id}: попаданий ${result.hits}, урон 0 (защита ${dotDef})`)
  }
  return true
}

function finishEnterDotOnUnit(cell, unit, deps) {
  const { ensureTacticalBattle, isArtilleryUnit } = deps
  const tac = ensureTacticalBattle(unit)
  tac.inDot = true
  delete tac.dotEnterTurnsLeft
  delete tac.dotExitTurnsLeft
  cell.builds = initDotBattleFields(cell.builds)
  cell.builds.dotOccupantId = Number(unit.instanceId)
  if (typeof isArtilleryUnit === 'function' && isArtilleryUnit(unit)) {
    tac.artilleryDeployed = true
  }
}

function tickDotEnterStates(cells, le, turnIndex, deps) {
  const { getStr, ensureTacticalBattle, isArtilleryUnit } = deps
  const ph = 'dotEnter'
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      const tac = u.tactical
      if (!tac || !tac.dotEnterTurnsLeft) continue
      let left = Number(tac.dotEnterTurnsLeft)
      if (!Number.isFinite(left) || left <= 0) continue
      left -= 1
      if (left <= 0) {
        finishEnterDotOnUnit(c, u, { ensureTacticalBattle, isArtilleryUnit })
        le(ph, `Юнит ${u.instanceId} занял ДОТ на кл. ${c.id}`, turnIndex)
      } else {
        tac.dotEnterTurnsLeft = left
        le(ph, `Юнит ${u.instanceId} занимает ДОТ (осталось ${left} ход.)`, turnIndex)
      }
    }
  }
}

function tickDotExitStates(cells, le, turnIndex, deps) {
  const { getStr, ensureTacticalBattle, hexDistCells, removeUnitFromCell, addUnitToCell, syncUnitCoor } = deps
  const finished = []
  for (const c of cells) {
    for (const u of c.units || []) {
      if (getStr(u) <= 0) continue
      const tac = u.tactical
      if (!tac) continue
      if (!tac.dotExitTurnsLeft) continue
      let left = Number(tac.dotExitTurnsLeft)
      if (!Number.isFinite(left) || left <= 0) continue
      left -= 1
      if (left <= 0) {
        finished.push({ cell: c, unit: u, destId: Number(tac.dotExitCellId) })
      } else {
        tac.dotExitTurnsLeft = left
        le('dotExit', `Юнит ${u.instanceId} выходит из ДОТ (осталось ${left} ход.)`, turnIndex)
      }
    }
  }
  for (const item of finished) {
    const tac = ensureTacticalBattle(item.unit)
    delete tac.inDot
    delete tac.dotExitTurnsLeft
    delete tac.dotExitCellId
    if (item.cell.builds) {
      item.cell.builds = ensureBuilds(item.cell.builds)
      delete item.cell.builds.dotOccupantId
    }
    const dest = Number.isFinite(item.destId) ? cells.find((x) => Number(x.id) === item.destId) : null
    if (
      dest &&
      Number(dest.id) !== Number(item.cell.id) &&
      isAxialNeighbor(item.cell, dest) &&
      canUnitOccupySurfaceOnCell(dest, getStr) &&
      typeof removeUnitFromCell === 'function' &&
      typeof addUnitToCell === 'function' &&
      typeof syncUnitCoor === 'function'
    ) {
      removeUnitFromCell(item.cell, item.unit.instanceId)
      addUnitToCell(dest, item.unit)
      syncUnitCoor(item.unit, dest)
      le('dotExit', `Юнит ${item.unit.instanceId} покинул ДОТ → кл. ${dest.id}`, turnIndex)
    } else {
      le('dotExit', `Юнит ${item.unit.instanceId} покинул ДОТ`, turnIndex)
    }
  }
}

function resolveEnterDot(cells, cur, o, le, ph, deps) {
  const {
    hexDistCells: hexDistCellsFn,
    isInfantryUnit,
    isArtilleryUnit,
    getStr,
    removeUnitFromCell,
    addUnitToCell,
    syncUnitCoor,
    ensureTacticalBattle,
    clearDefendOnUnit,
    findUnitOnField,
  } = deps
  const tid = o.targetCellId
  if (tid == null) {
    le(ph, `Занять ДОТ: ${cur.unit.instanceId} — не указана цель`)
    return
  }
  const dotCell = cells.find((c) => Number(c.id) === Number(tid))
  if (!dotCell) {
    le(ph, `Занять ДОТ: ${cur.unit.instanceId} — клетка не найдена`)
    return
  }
  if (!hasDotOnCell(dotCell.builds)) {
    le(ph, `Занять ДОТ: на кл. ${dotCell.id} нет ДОТ`)
    return
  }
  if (!isDotEmpty(dotCell.builds, dotCell, cells, getStr, findUnitOnField)) {
    le(ph, `Занять ДОТ: ДОТ на кл. ${dotCell.id} занят`)
    return
  }
  if (!canEnterDotUnitType(cur.unit, isInfantryUnit, isArtilleryUnit)) {
    le(ph, `Занять ДОТ: ${cur.unit.instanceId} — только пехота или артиллерия`)
    return
  }
  const dist = hexDistCellsFn(cur.cell, dotCell)
  if (dist > 1) {
    le(ph, `Занять ДОТ: ${cur.unit.instanceId} — цель не рядом и не на том же гексе`)
    return
  }
  if (dist === 1 && !canUnitOccupySurfaceOnCell(dotCell, getStr)) {
    le(ph, `Занять ДОТ: на кл. ${dotCell.id} нет места на поверхности`)
    return
  }
  const fromCellForFacing = cur.cell
  if (dist === 1) {
    removeUnitFromCell(cur.cell, cur.unit.instanceId)
    addUnitToCell(dotCell, cur.unit)
    syncUnitCoor(cur.unit, dotCell)
    cur.cell = dotCell
  }
  const keepFacingCellId = Number(dotCell.builds && dotCell.builds.dotFacingCellId)
  let facing = resolveDotFacingDir(dotCell, cells)
  let facingCellId = Number.isFinite(keepFacingCellId) ? keepFacingCellId : null
  const fid = o.defendFacingCellId != null ? Number(o.defendFacingCellId) : null
  if (fid != null && Number.isFinite(fid)) {
    const fCell = cells.find((c) => Number(c.id) === fid)
    if (fCell) {
      facing = findMoveDir(dotCell, fCell, cells)
      facingCellId = Number(fCell.id)
    }
  } else if (!hasEditorDotFacing(dotCell.builds) && dist === 1) {
    facing = findMoveDir(dotCell, fromCellForFacing, cells)
  }
  dotCell.builds = initDotBattleFields(dotCell.builds)
  dotCell.builds.dotOccupantId = Number(cur.unit.instanceId)
  dotCell.builds.dotFacing = facing
  if (facingCellId != null) dotCell.builds.dotFacingCellId = facingCellId
  const tac = ensureTacticalBattle(cur.unit)
  delete tac.inDot
  delete tac.dotExitTurnsLeft
  tac.dotEnterTurnsLeft = 1
  clearDefendOnUnit(cur.unit)
  const trench = require('./battleTrench')
  trench.leaveTrench(cur.unit, cur.cell)
  le(ph, `Юнит ${cur.unit.instanceId} начинает занимать ДОТ на кл. ${dotCell.id} (войдёт на следующем ходу)`)
}

function resolveExitDot(cells, cur, o, le, ph, deps) {
  const { isInfantryUnit, isArtilleryUnit, ensureTacticalBattle, hexDistCells: hexDistCellsFn, getStr } = deps
  if (!unitInDot(cur.unit)) {
    le(ph, `Покинуть ДОТ: ${cur.unit.instanceId} — не в ДОТ`)
    return
  }
  const turns = dotExitTurnsForUnit(cur.unit, isInfantryUnit, isArtilleryUnit)
  if (turns < 1) {
    le(ph, `Покинуть ДОТ: ${cur.unit.instanceId} — отклонено`)
    return
  }
  const cid = o && o.targetCellId != null ? Number(o.targetCellId) : NaN
  const dest = (cells || []).find((c) => Number(c.id) === cid)
  if (!dest) {
    le(ph, `Покинуть ДОТ: ${cur.unit.instanceId} — не указана клетка выхода`)
    return
  }
  if (!isAxialNeighbor(cur.cell, dest)) {
    le(ph, `Покинуть ДОТ: ${cur.unit.instanceId} — выйти можно только на соседний гекс`)
    return
  }
  if (typeof getStr === 'function' && !canUnitOccupySurfaceOnCell(dest, getStr)) {
    le(ph, `Покинуть ДОТ: ${cur.unit.instanceId} — на кл. ${dest.id} нет места`)
    return
  }
  const tac = ensureTacticalBattle(cur.unit)
  tac.dotExitTurnsLeft = turns
  tac.dotExitCellId = Number(dest.id)
  le(ph, `Юнит ${cur.unit.instanceId} выходит из ДОТ на кл. ${dest.id} (${turns} ход.)`)
}

/** Сектор пулемётчика в ДОТ: заполненный веер (фронт + два соседних направления). */
function computeDotMgSectorCellIds(dotCell, facingDir, allCells, maxSteps) {
  if (!dotCell || facingDir < 0 || facingDir > 5 || maxSteps < 1) return []
  const dirs = [
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
  ]
  const d0 = dirs[facingDir]
  const dLeft = dirs[(facingDir + 1) % 6]
  const dRight = dirs[(facingDir + 5) % 6]
  const ox = Number(dotCell.coor.x)
  const oz = Number(dotCell.coor.z)
  const out = []
  const seen = new Set()
  for (const d1 of [dLeft, dRight]) {
    for (let s = 1; s <= maxSteps; s++) {
      for (let i = 0; i <= s; i++) {
        const j = s - i
        const wantX = ox + i * d0.x + j * d1.x
        const wantZ = oz + i * d0.z + j * d1.z
        const cell = allCells.find((c) => Number(c.coor.x) === wantX && Number(c.coor.z) === wantZ) || null
        if (!cell || Number(cell.id) === Number(dotCell.id)) continue
        const id = Number(cell.id)
        if (seen.has(id)) continue
        seen.add(id)
        out.push(id)
      }
    }
  }
  return out
}

/** Видимость гарнизона ДОТ: свой гекс + сектор стрельбы (без круговой дальности юнита). */
function dotOccupantVisionCellIds(dotCell, unit, allCells) {
  if (!unitInDot(unit) || !dotCell || !hasDotOnCell(dotCell.builds)) return null
  const maxSteps =
    String(unit.type || '').toLowerCase() === 'artillery' ? DOT_ART_RANGE.length : DOT_INF_RANGE.length
  const facing = resolveDotFacingDir(dotCell, allCells)
  const ids = computeDotMgSectorCellIds(dotCell, facing, allCells, maxSteps)
  const out = new Set(ids)
  out.add(Number(dotCell.id))
  return out
}

function isDotFireTargetCellAllowed(attacker, attackerCell, targetCellId, allCells) {
  if (!unitInDot(attacker) || unitDotExiting(attacker)) return true
  if (!attackerCell || !hasDotOnCell(attackerCell.builds)) return true
  const facing = resolveDotFacingDir(attackerCell, allCells)
  const maxSteps = String(attacker.type || '').toLowerCase() === 'artillery' ? DOT_ART_RANGE.length : DOT_INF_RANGE.length
  const ids = computeDotMgSectorCellIds(attackerCell, facing, allCells, maxSteps)
  const cid = Number(targetCellId)
  return ids.some((id) => Number(id) === cid)
}

module.exports = {
  ensureBuilds,
  hasDotOnCell,
  initDotBattleFields,
  getDotOccupantInstanceId,
  isDotEmpty,
  unitInDot,
  unitDotExiting,
  unitDotEntering,
  unitHoldsDot,
  countSurfaceUnitsOnCell,
  maxSurfaceUnitsOnCell,
  canUnitOccupySurfaceOnCell,
  isAxialNeighbor,
  canEnterDotUnitType,
  dotExitTurnsForUnit,
  dotRangeArrayForUnit,
  dotIntensityArrayFor,
  getDotAmmo,
  getDotDef,
  dotShooterUsesDotAmmo,
  dotShooterCanFire,
  shooterHasAmmoForFire,
  deductShooterAmmoForFire,
  tryDamageDotFromFire,
  tickDotExitStates,
  tickDotEnterStates,
  resolveEnterDot,
  resolveExitDot,
  computeDotMgSectorCellIds,
  resolveDotFacingDir,
  dotOccupantVisionCellIds,
  isDotFireTargetCellAllowed,
  destroyDot,
}

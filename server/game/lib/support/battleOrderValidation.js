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
const { hexFlightPathCellIds } = require('../map/battleHexGeometry')
const { readVisionRange } = require('../unit/battleUnitVision')
const { getStr } = require('../unit/battleUnitField')
const { isDesantOnlyBattleMoveUnit } = require('../air/battleDesant')
const { unitHasMeleeOnlyFireRowOptions } = require('../unit/battleUnitFireOptions')
const { cellBlocksLineOfSight, isCellSeenByAnyHostileUnit } = require('../map/battleFogVisibility')
const { computeDefendSectorIds, isValidDefendFacing, maxShootRangeStepsForUnit } = require('../map/battleDefendSector')
const fireAdj = require('../fire/battleFireAdjustment')
const desantCombat = require('../air/battleDesantCombat')
const { isHexVisible } = require('../map/battleFogVisibility')
const { artilleryAreaClosedIgnoresTerrainLos } = require('../../core/battleUnitType')

function parseIntCsvNums(s) {
  if (s == null || s === '') return []
  return String(s)
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n))
}

/** Для авиации линия полёта на карте не режется таблицами огня/разведки (как неограниченная дальность). */
const AIR_MISSION_UNLIMITED_HEX_STEPS = 99999999

function maxIntelligenceAirFlightHexSteps(unit) {
  const raw = unit.intelligenceAirRange ?? unit.intelligence_air_range
  const nums = parseIntCsvNums(raw)
  const ra = nums.length ? nums : [3, 2, 1]
  return ra.length >= 2 ? Math.max(0, ra.length - 1) : ra.length
}

function maxAirMissionHexSteps(unit) {
  const t = String(unit?.type ?? '')
  if (t === 'lightAir' || t === 'heavyAir') return AIR_MISSION_UNLIMITED_HEX_STEPS
  const ia = maxIntelligenceAirFlightHexSteps(unit)
  const sh = maxShootRangeStepsForUnit(unit)
  return Math.max(ia, sh, 3)
}

const AIR_HEX_TARGET_ORDER_KEYS = new Set([
  'intelligenceAir',
  'airSupply',
  'attackAir',
  'bombardment',
  'desant',
  'interception',
  'patrol',
])

function isBattleAirCatalogUnit(unit) {
  const t = String(unit?.type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

function validateFireAdjustmentOrder(cells, found, orderKey, targetCellId, targetUnit) {
  if (!found?.unit) return 'юнит не на поле'
  if (!fireAdj.canShooterUseFireAdjustmentOrder(found.unit, orderKey, isArtilleryUnit)) {
    return 'корректировка огня доступна только артиллерии (приказ «Огонь»), не для авиации'
  }
  const fac = unitFaction(found.unit)
  if (!fireAdj.hasActiveFireAdjustmentSpotter(cells, fac)) {
    return 'нет доступного корректировщика огня (живой, не в транспорте; авиация не считается)'
  }
  let targetCell = null
  if (targetCellId != null && Number.isFinite(Number(targetCellId))) {
    targetCell = cells.find((c) => Number(c.id) === Number(targetCellId))
  } else if (targetUnit?.cell) {
    targetCell = targetUnit.cell
  }
  if (!targetCell) return 'цель не найдена'
  const vis = fireAdj.resolveArtilleryFireVisibility(
    found,
    targetCell,
    cells,
    {
      unitHasPropKey,
      isArtilleryUnit,
      artilleryAreaClosedIgnoresTerrainLos,
      isHexVisible,
    },
    { useFireAdjustment: true },
  )
  if (!vis.allowed) return vis.reason || 'корректировка огня невозможна'
  return null
}

function validateBattleOrders(cells, orders, context) {
  const { ownsUnit, normalizeOrderKey, submittableOrderKeys } = context
  if (!Array.isArray(orders)) return 'Некорректный список приказов'
  if (!cells || !cells.length) return 'Поле боя не загружено'
  const fireAdjCounts = fireAdj.countFireAdjustmentUsesInOrders(orders, cells, findUnitOnField)
  for (const fac of Object.keys(fireAdjCounts)) {
    if (fireAdjCounts[fac] > 1) return 'Корректировка огня: только один приказ с корректировкой за ход на сторону'
  }
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i] || {}
    const rawKey = o.orderKey ?? o.order_key ?? o.order ?? ''
    const ok = normalizeOrderKey(String(rawKey).trim())
    o.orderKey = ok
    const uid = Number(o.unitInstanceId)
    if (!Number.isFinite(uid)) return `Приказ ${i + 1}: нет unitInstanceId`
    if (!submittableOrderKeys.has(ok)) {
      const shown = ok || String(rawKey).trim() || '(пусто)'
      return `Приказ ${i + 1}: неизвестный orderKey «${shown}»`
    }
    const found = findUnitOnField(cells, uid)
    if (!found) return `Приказ ${i + 1}: юнит не на поле`
    if (!ownsUnit(found.unit)) return `Приказ ${i + 1}: нельзя отдавать приказ чужому юниту`
    if (isDesantOnlyBattleMoveUnit(found.unit) && ok !== 'moveWar') {
      return `Приказ ${i + 1}: после десанта на водную/болотную местность доступно только «Боевое положение»`
    }
    const block = validateUnitOrdersAllowed(found.unit, ok)
    if (block) return `Приказ ${i + 1}: ${block} — приказы недоступны`
    if (ok === 'getSup' || ok === 'loading' || ok === 'unloading' || ok === 'tow') {
      const le = validateLogisticsOrder(cells, o)
      if (le) return `Приказ ${i + 1}: ${le}`
      continue
    }
    if (ok === 'fire' || ok === 'fireHard') {
      if (unitHasMeleeOnlyFireRowOptions(found.unit)) {
        return `Приказ ${i + 1}: нет дальнего огня (меткость 0 на всех дистанциях)`
      }
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
        const errAf = validateArtilleryAreaFireOnCellOnly(cells, found, Number(fireCellId), ok, {
          useFireAdjustment: !!o.useFireAdjustment,
        })
        if (errAf) return `Приказ ${i + 1}: ${errAf}`
        if (o.useFireAdjustment) {
          const errAdj = validateFireAdjustmentOrder(cells, found, ok, Number(fireCellId), null)
          if (errAdj) return `Приказ ${i + 1}: ${errAdj}`
        }
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
        const meleeId = Number(found.unit.tactical?.meleeOpponentInstanceId)
        const tidNum = Number(tid)
        if (Number.isFinite(meleeId) && Number.isFinite(tidNum) && meleeId === tidNum) {
          const dMelee = hexDistCells(found.cell, tgt.cell)
          if (!desantCombat.canDesantHalfCombatShootTarget(found.unit, tgt.unit, dMelee)) {
            return `Приказ ${i + 1}: по связанному ближнему оппоненту — только «Атака»`
          }
        }
      }
      if (ok === 'fire' || ok === 'fireHard') {
        const needAmmo = ok === 'fireHard' ? 3 : 1
        const dotMod = require('../map/battleDot')
        let haveAmmo = getAmmoForValidate(found.unit)
        if (dotMod.dotShooterUsesDotAmmo(found.unit)) {
          haveAmmo = dotMod.getDotAmmo(found.cell.builds)
        }
        if (haveAmmo < needAmmo) {
          const src = dotMod.dotShooterUsesDotAmmo(found.unit) ? 'боезапас ДОТ' : 'БК'
          return `Приказ ${i + 1}: недостаточно ${src} (${ok === 'fireHard' ? 'огонь на подавление — 3' : 'огонь — 1'})`
        }
        const dFire = hexDistCells(found.cell, tgt.cell)
        const effDFire = desantCombat.effectiveFireDistanceForAccuracy(found.unit, tgt.unit, dFire)
        const acc =
          shootingAccuracyAtHexDistance.length >= 3
            ? shootingAccuracyAtHexDistance(found.unit, effDFire, found.cell)
            : shootingAccuracyAtHexDistance(found.unit, effDFire)
        if (acc <= 0) {
          return `Приказ ${i + 1}: на этой дистанции меткость 0 — стрельба невозможна`
        }
        if (o.useFireAdjustment) {
          const errAdj = validateFireAdjustmentOrder(cells, found, ok, tgt.cell.id, tgt)
          if (errAdj) return `Приказ ${i + 1}: ${errAdj}`
        }
      }
      if ((ok === 'fire' || ok === 'fireHard') && isArtilleryUnit(found.unit)) {
        const dotMod = require('../map/battleDot')
        if (!dotMod.unitInDot(found.unit)) {
          if (!isArtilleryDeployedForBattle(found.unit)) {
            return `Приказ ${i + 1}: артиллерия свёрнута — приказ «Развёртывание»`
          }
          if (!isArtilleryFireTargetCellAllowed(found.unit, tgt.cell.id)) {
            return `Приказ ${i + 1}: цель вне сектора обстрела артиллерии`
          }
        }
      }
      if (ok === 'fire' || ok === 'fireHard') {
        const dotMod = require('../map/battleDot')
        if (!dotMod.isDotFireTargetCellAllowed(found.unit, found.cell, tgt.cell.id, cells)) {
          return `Приказ ${i + 1}: цель вне сектора стрельбы ДОТ`
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
      continue
    }
    if (ok === 'airRecall') {
      if (!isBattleAirCatalogUnit(found.unit)) {
        return `Приказ ${i + 1}: отзыв доступен только авиации`
      }
      const sortie = found.unit.tactical?.airSortie
      if (!sortie || sortie.phase !== 'patrol') {
        return `Приказ ${i + 1}: самолёт не на патруле/разведке`
      }
      const ak = String(sortie.activeOrderKey || '').trim()
      if (ak !== 'patrol' && ak !== 'intelligenceAir') {
        return `Приказ ${i + 1}: этот приказ нельзя отменить`
      }
      continue
    }
    if (ok === 'accompaniment') {
      if (!isBattleAirCatalogUnit(found.unit)) {
        return `Приказ ${i + 1}: сопровождение доступно только авиации`
      }
      const tid = Number(o.targetUnitInstanceId)
      if (!Number.isFinite(tid)) return `Приказ ${i + 1}: укажите сопровождаемый самолёт (targetUnitInstanceId)`
      if (tid === uid) return `Приказ ${i + 1}: нельзя сопровождать самого себя`
      const tgt = findUnitOnField(cells, tid)
      if (!tgt || !isBattleAirCatalogUnit(tgt.unit)) {
        return `Приказ ${i + 1}: сопровождаемый юнит не найден или не авиация`
      }
      if (unitFaction(tgt.unit) !== unitFaction(found.unit)) {
        return `Приказ ${i + 1}: сопровождение только дружественной авиации`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: укажите клетку назначения (targetCellId)`
      const tc = cells.find((c) => Number(c.id) === cid)
      if (!tc) return `Приказ ${i + 1}: клетка назначения не существует`
      const maxSteps = maxAirMissionHexSteps(found.unit)
      const dist = hexDistCells(found.cell, tc)
      if (dist < 1) return `Приказ ${i + 1}: цель сопровождения должна быть дальше точки вылета`
      if (dist > maxSteps) {
        return `Приказ ${i + 1}: цель сопровождения вне дальности полёта (${dist} гекс., макс. ${maxSteps})`
      }
      const pathIds = hexFlightPathCellIds(cells, found.cell, tc)
      if (!pathIds || !pathIds.length) return `Приказ ${i + 1}: траектория сопровождения проходит вне поля`
      const clientPath = o.flightPathCellIds
      if (clientPath != null && Array.isArray(clientPath)) {
        const normalized = clientPath.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        if (normalized.length !== pathIds.length || normalized.some((v, j) => v !== pathIds[j])) {
          return `Приказ ${i + 1}: траектория сопровождения не совпадает с расчётной`
        }
      }
      continue
    }
    if (AIR_HEX_TARGET_ORDER_KEYS.has(ok)) {
      if (!isBattleAirCatalogUnit(found.unit)) {
        return `Приказ ${i + 1}: авиаприказ «${ok}» доступен только авиации`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: укажите клетку назначения (targetCellId)`
      const tc = cells.find((c) => Number(c.id) === cid)
      if (!tc) return `Приказ ${i + 1}: клетка назначения не существует`
      const maxSteps = maxAirMissionHexSteps(found.unit)
      const dist = hexDistCells(found.cell, tc)
      if (dist < 1) return `Приказ ${i + 1}: выберите клетку дальше точки вылета`
      if (dist > maxSteps) {
        return `Приказ ${i + 1}: цель вне дальности авиазадания (${dist} гекс., макс. ${maxSteps})`
      }
      const pathIds = hexFlightPathCellIds(cells, found.cell, tc)
      if (!pathIds || !pathIds.length) return `Приказ ${i + 1}: траектория проходит вне поля боя`
      const clientPath = o.flightPathCellIds
      if (clientPath != null && Array.isArray(clientPath)) {
        const normalized = clientPath.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        if (normalized.length !== pathIds.length || normalized.some((v, j) => v !== pathIds[j])) {
          return `Приказ ${i + 1}: траектория полёта не совпадает с расчётной`
        }
      }
      if (ok === 'attackAir' || ok === 'bombardment') {
        if (getAmmoForValidate(found.unit) < 1) {
          return `Приказ ${i + 1}: недостаточно БК для авиаудара (нужно 1)`
        }
      }
      if (ok === 'patrol') {
        const pr = Number(o.patrolRangeSteps)
        if (!Number.isFinite(pr) || pr < 1) {
          return `Приказ ${i + 1}: патруль — укажите радиус зоны (patrolRangeSteps)`
        }
        const maxVis = readVisionRange(found.unit)
        if (pr > maxVis) {
          return `Приказ ${i + 1}: радиус патруля больше дальности видимости (${pr} > ${maxVis})`
        }
      }
      if (ok === 'desant') {
        const carried = found.unit.tactical?.carriedUnits
        const hasLive =
          Array.isArray(carried) && carried.some((c) => c && getStr(c) > 0)
        if (!hasLive) return `Приказ ${i + 1}: на борту нет десантников`
      }
      if (ok === 'interception') {
        const tid = Number(o.targetUnitInstanceId)
        if (!Number.isFinite(tid)) return `Приказ ${i + 1}: укажите цель перехвата (клик по вражеской авиации)`
        const tgt = findUnitOnField(cells, tid)
        if (!tgt || !isBattleAirCatalogUnit(tgt.unit)) {
          return `Приказ ${i + 1}: цель перехвата — вражеская авиация на поле`
        }
        if (!factionsOpposed(unitFaction(found.unit), unitFaction(tgt.unit))) {
          return `Приказ ${i + 1}: перехват только против вражеской авиации`
        }
        const airSortie = require('../air/battleAirSortie')
        if (!airSortie.isAirUnitAirborneForInterception(tgt.unit)) {
          return `Приказ ${i + 1}: цель перехвата должна быть в воздухе (уже вылетела)`
        }
        const battleAirCombat = require('../air/battleAirCombat')
        const meeting = battleAirCombat.computeInterceptionMeetingCell(
          cells,
          found.cell,
          tgt.unit,
          hexFlightPathCellIds,
        )
        const expectedCellId =
          meeting?.meetingCellId ??
          airSortie.readAirFlightPositionCellId(tgt.unit, Number(tgt.cell.id))
        const cid = Number(o.targetCellId)
        if (!Number.isFinite(expectedCellId) || !Number.isFinite(cid) || Number(cid) !== Number(expectedCellId)) {
          return `Приказ ${i + 1}: клетка назначения должна совпадать с точкой встречи на траектории`
        }
        const interceptorPath =
          meeting?.interceptorPath ??
          hexFlightPathCellIds(cells, found.cell, cells.find((c) => Number(c.id) === Number(expectedCellId)))
        if (!interceptorPath?.length) {
          return `Приказ ${i + 1}: перехват — маршрут пересекает границу карты`
        }
      }
      continue
    }
    if (ok === 'clotting') {
      if (!isArtilleryUnit(found.unit)) return `Приказ ${i + 1}: только артиллерия`
      continue
    }
    if (ok === 'enterDot') {
      const dotMod = require('../map/battleDot')
      if (!dotMod.canEnterDotUnitType(found.unit, isInfantryUnit, isArtilleryUnit)) {
        return `Приказ ${i + 1}: занять ДОТ могут только пехота и артиллерия`
      }
      if (dotMod.unitInDot(found.unit)) return `Приказ ${i + 1}: юнит уже в ДОТ`
      if (dotMod.unitDotEntering(found.unit)) return `Приказ ${i + 1}: юнит уже занимает ДОТ`
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: укажите клетку с ДОТ (targetCellId)`
      const dotCell = cells.find((c) => Number(c.id) === cid)
      if (!dotCell) return `Приказ ${i + 1}: клетка с ДОТ не найдена`
      if (!dotMod.hasDotOnCell(dotCell.builds)) return `Приказ ${i + 1}: на клетке нет ДОТ`
      if (!dotMod.isDotEmpty(dotCell.builds, dotCell, cells, getStr, findUnitOnField)) {
        return `Приказ ${i + 1}: ДОТ уже занят`
      }
      const dist = hexDistCells(found.cell, dotCell)
      if (dist > 1) return `Приказ ${i + 1}: ДОТ должен быть на соседнем гексе или на гексе юнита`
      if (dist === 1 && !dotMod.canUnitOccupySurfaceOnCell(dotCell, getStr)) {
        return `Приказ ${i + 1}: на гексе с ДОТ нет места (макс. 2 юнита на поверхности)`
      }
      continue
    }
    if (ok === 'exitDot') {
      const dotMod = require('../map/battleDot')
      if (!dotMod.unitInDot(found.unit)) return `Приказ ${i + 1}: юнит не в ДОТ`
      if (dotMod.unitDotExiting(found.unit)) return `Приказ ${i + 1}: юнит уже выходит из ДОТ`
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: укажите клетку выхода (targetCellId)`
      const dest = cells.find((c) => Number(c.id) === cid)
      if (!dest) return `Приказ ${i + 1}: клетка выхода не найдена`
      if (!dotMod.isAxialNeighbor(found.cell, dest)) {
        return `Приказ ${i + 1}: выйти можно только на соседний гекс`
      }
      if (!dotMod.canUnitOccupySurfaceOnCell(dest, getStr)) {
        return `Приказ ${i + 1}: на клетке выхода нет места`
      }
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
        const hexEx = found.cell.hexExtra
        const aa = hexEx && typeof hexEx === 'object' ? hexEx.ambushAllowed : null
        if (aa && typeof aa === 'object') {
          const ut = String(found.unit?.type || '')
          if (aa[ut] === false) {
            return `Приказ ${i + 1}: засада на этом гексе запрещена для типа «${ut}»`
          }
        }
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

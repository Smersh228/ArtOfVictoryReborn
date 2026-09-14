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
  canSpotHiddenTarget,
  isHiddenConcealed,
  unitHasPropKey,
  validateArtilleryAreaFireOnCellOnly,
  shootingAccuracyAtHexDistance,
  hexDistCells,
  getMovePoint,
  computeRevealedCellIdsForFaction,
  rangeArrayFor,
  rangeArrayForAtCell,
  fireRangeTableMode,
  getStr,
} = require('../../battleEngine')
const { hexFlightPathCellIds } = require('../map/battleHexGeometry')
const { readVisionRange } = require('../unit/battleUnitVision')
const { isDesantOnlyBattleMoveUnit } = require('../air/battleDesant')
const { unitHasMeleeOnlyFireRowOptions } = require('../unit/battleUnitFireOptions')
const { isCellSeenByAnyHostileUnit } = require('../map/battleFogVisibility')
const { computeDefendSectorIds, isValidDefendFacing, maxShootRangeStepsForUnit } = require('../map/battleDefendSector')
const fireAdj = require('../fire/battleFireAdjustment')
const desantCombat = require('../air/battleDesantCombat')
const { isHexVisible } = require('../map/battleFogVisibility')
const { artilleryAreaClosedIgnoresTerrainLos, unitUsesGunDeploy, unitOrderUsesAreaHexFire } = require('../../core/battleUnitType')

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

/** Огонь/атака с targetCellId: взять противника на гексе, если цель-юнит не указана. */
function pickDirectFireTargetOnCell(found, cell, order) {
  if (!found?.unit || !cell) return null
  const { infantryCanRangedFireAtTarget } = require('../unit/battleUnitFireOptions')
  const { unitInDot } = require('../map/battleDot')
  const ok = String(order?.orderKey || '').trim()
  const us = cell.units || []
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (!u || getStr(u) <= 0) continue
    if (!factionsOpposed(unitFaction(found.unit), unitFaction(u))) continue
    if (unitInDot(u)) continue
    if (
      (ok === 'fire' || ok === 'fireHard') &&
      isInfantryUnit(found.unit) &&
      isArmoredVehicleTarget(u) &&
      !infantryCanRangedFireAtTarget(found.unit, u, !!order.useReactiveFire)
    ) {
      continue
    }
    return u
  }
  return null
}

function validateFireAdjustmentSpotterOrder(cells, found, o, orders, normalizeOrderKeyFn) {
  if (!found?.unit) return 'юнит не на поле'
  if (!fireAdj.unitIsFireAdjustmentSpotter(found.unit)) {
    return 'нет приказа «Корректировка огня артиллерии» в каталоге'
  }
  if (fireAdj.isUnitInTransport(found.unit)) return 'корректировщик в транспорте'
  const tid = Number(o.targetUnitInstanceId)
  if (!Number.isFinite(tid)) return 'укажите дружественную артиллерию'
  const tgt = findUnitOnField(cells, tid)
  if (!tgt) return 'цель не на поле'
  if (unitFaction(tgt.unit) !== unitFaction(found.unit)) return 'только союзник'
  if (!isArtilleryUnit(tgt.unit) && !unitUsesGunDeploy(tgt.unit)) return 'корректируется только артиллерия'
  if (fireAdj.isUnitInTransport(tgt.unit)) return 'артиллерия в транспорте'
  if (getStr(tgt.unit) <= 0) return 'артиллерия уничтожена'
  let artFire = null
  let otherAdjOnSame = 0
  for (let i = 0; i < orders.length; i++) {
    const other = orders[i] || {}
    const ok = normalizeOrderKeyFn(String(other.orderKey ?? other.order_key ?? '').trim())
    if (ok === 'fire' && (Number(other.unitInstanceId) === tid || Number(other.unitId) === tid)) artFire = other
    if (ok === 'fireHard' && Number(other.unitInstanceId) === tid) {
      return 'корректировка огня невозможна при приказе «Огонь на подавление»'
    }
    if (ok === 'fireAdjustment' && Number(other.targetUnitInstanceId) === tid) otherAdjOnSame += 1
  }
  if (otherAdjOnSame > 1) return 'на одну артиллерию — только одна корректировка'
  if (!artFire) return 'у артиллерии должен быть приказ «Огонь»'
  const fireTid = Number(artFire.targetUnitInstanceId)
  let fireCell = null
  let fireTgtUnit = null
  if (Number.isFinite(fireTid)) {
    const ft = findUnitOnField(cells, fireTid)
    if (ft) {
      fireTgtUnit = ft.unit
      fireCell = ft.cell
    }
  }
  if (!fireCell && artFire.targetCellId != null) {
    fireCell = cells.find((c) => Number(c.id) === Number(artFire.targetCellId)) || null
  }
  const fireTy = String((fireTgtUnit && fireTgtUnit.type) || '').toLowerCase()
  if (fireTy === 'lightair' || fireTy === 'heavyair') {
    return 'корректировка не действует при стрельбе по авиации'
  }
  return null
}

function stripStaleOngoingOrders(orders, cells, normalizeOrderKey) {
  if (!Array.isArray(orders) || !cells) return
  const ambush = require('../../core/battleAmbush')
  const sapper = require('../map/battleSapperJobs')
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i] || {}
    const ok = normalizeOrderKey(String(o.orderKey ?? o.order_key ?? o.order ?? '').trim())
    const uid = Number(o.unitInstanceId)
    if (!Number.isFinite(uid)) continue
    const found = findUnitOnField(cells, uid)
    if (!found) continue
    if (ok === 'ambush' && ambush.isAmbushConcealed(found.unit)) {
      orders.splice(i, 1)
      continue
    }
    if (sapper.isSapperBusy(found.unit)) {
      orders.splice(i, 1)
      continue
    }
    if ((ok === 'move' || ok === 'moveWar') && Number(o.targetCellId) === Number(found.cell.id)) {
      orders.splice(i, 1)
    }
  }
}

function validateBattleOrders(cells, orders, context) {
  const { ownsUnit, normalizeOrderKey, submittableOrderKeys } = context
  if (!Array.isArray(orders)) return 'Некорректный список приказов'
  if (!cells || !cells.length) return 'Поле боя не загружено'
  stripStaleOngoingOrders(orders, cells, normalizeOrderKey)
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
    if (ok === 'getSup' || ok === 'loadingSup' || ok === 'loading' || ok === 'unloading' || ok === 'tow') {
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
      let tid = o.targetUnitInstanceId
      let fireCellId = o.targetCellId
      if (tid != null && Number.isFinite(Number(tid)) && (ok === 'fire' || ok === 'fireHard')) {
        const tgtDot = findUnitOnField(cells, tid)
        const structureHpPre = require('../map/battleStructureHp')
        const dotModPre = require('../map/battleDot')
        if (
          tgtDot &&
          dotModPre.unitInDot(tgtDot.unit) &&
          (structureHpPre.unitCanRangedBuildFire(found.unit, !!o.useReactiveFire) ||
            dotModPre.unitInDot(found.unit)) &&
          structureHpPre.isBuildFireTargetCell(tgtDot.cell)
        ) {
          o.targetCellId = Number(tgtDot.cell.id)
          delete o.targetUnitInstanceId
          tid = null
          fireCellId = o.targetCellId
        }
      }
      if (
        (ok === 'fire' || ok === 'fireHard') &&
        unitOrderUsesAreaHexFire(found.unit, o) &&
        fireCellId != null &&
        Number.isFinite(Number(fireCellId)) &&
        (tid == null || !Number.isFinite(Number(tid)))
      ) {
      const errAf = validateArtilleryAreaFireOnCellOnly(cells, found, Number(fireCellId), ok, {
        useFireAdjustment: !!o.useFireAdjustment,
        useReactiveFire: !!o.useReactiveFire,
      })
      if (errAf) return `Приказ ${i + 1}: ${errAf}`
      continue
    }
    if (
      (ok === 'fire' || ok === 'fireHard') &&
      fireCellId != null &&
      Number.isFinite(Number(fireCellId)) &&
      (tid == null || !Number.isFinite(Number(tid)))
    ) {
      const structureHp = require('../map/battleStructureHp')
      const tcStruct = cells.find((c) => Number(c.id) === Number(fireCellId))
      const dotMod = require('../map/battleDot')
      if (tcStruct && structureHp.isBuildFireTargetCell(tcStruct)) {
        if (
          !structureHp.unitCanRangedBuildFire(found.unit, !!o.useReactiveFire) &&
          !dotMod.unitInDot(found.unit)
        ) {
          return `Приказ ${i + 1}: нет дальнего огня по сооружениям`
        }
        const needAmmo = ok === 'fireHard' ? 3 : 1
        let haveAmmo = getAmmoForValidate(found.unit)
        if (dotMod.dotShooterUsesDotAmmo(found.unit)) {
          haveAmmo = dotMod.getDotAmmo(found.cell.builds)
        }
        if (haveAmmo < needAmmo) {
          const src = dotMod.dotShooterUsesDotAmmo(found.unit) ? 'боезапас ДОТ' : 'БК'
          return `Приказ ${i + 1}: недостаточно ${src} (${ok === 'fireHard' ? 'огонь на подавление — 3' : 'огонь — 1'})`
        }
        const dFire = hexDistCells(found.cell, tcStruct)
        const { normalizeFireObject } = require('../fire/battleFireNormalize')
        const reactiveTables = o.useReactiveFire
          ? normalizeFireObject(found.unit.fireReactive)
          : undefined
        const acc =
          shootingAccuracyAtHexDistance.length >= 3
            ? shootingAccuracyAtHexDistance(found.unit, dFire, found.cell, reactiveTables)
            : shootingAccuracyAtHexDistance(found.unit, dFire)
        if (acc <= 0) {
          return `Приказ ${i + 1}: на этой дистанции меткость 0 — стрельба невозможна`
        }
        if (dotMod.unitInDot(found.unit)) {
          if (!dotMod.isDotFireTargetCellAllowed(found.unit, found.cell, tcStruct.id, cells)) {
            return `Приказ ${i + 1}: клетка вне сектора стрельбы ДОТ`
          }
        } else if (unitUsesGunDeploy(found.unit)) {
          if (!dotMod.unitInDot(found.unit) && !isArtilleryDeployedForBattle(found.unit)) {
            return `Приказ ${i + 1}: орудие свёрнуто — приказ «Развёртывание»`
          }
          if (!isArtilleryFireTargetCellAllowed(found.unit, tcStruct.id)) {
            return `Приказ ${i + 1}: клетка вне сектора обстрела`
          }
        }
        const smokeMod = require('../map/battleSmoke')
        if (smokeMod.hasSmokeOnCell(tcStruct.builds)) {
          return `Приказ ${i + 1}: цель в дымовой завесе`
        }
        continue
      }
    }
    if ((tid == null || !Number.isFinite(Number(tid))) && fireCellId != null && Number.isFinite(Number(fireCellId))) {
      const tcUnit = cells.find((c) => Number(c.id) === Number(fireCellId))
      const picked = pickDirectFireTargetOnCell(found, tcUnit, o)
      if (picked && Number.isFinite(Number(picked.instanceId))) {
        o.targetUnitInstanceId = Number(picked.instanceId)
        tid = o.targetUnitInstanceId
      }
    }
    if (tid == null) return `Приказ ${i + 1}: нужна цель (targetUnitInstanceId)`
    const tgt = findUnitOnField(cells, tid)
    if (!tgt) return `Приказ ${i + 1}: цель не на поле`
    if (!factionsOpposed(unitFaction(found.unit), unitFaction(tgt.unit))) return `Приказ ${i + 1}: цель должна быть противником`
    if ((ok === 'fire' || ok === 'fireHard') && isInfantryUnit(found.unit) && isArmoredVehicleTarget(tgt.unit)) {
      const { infantryCanRangedFireAtTarget } = require('../unit/battleUnitFireOptions')
      if (!infantryCanRangedFireAtTarget(found.unit, tgt.unit, !!o.useReactiveFire)) {
        return `Приказ ${i + 1}: пехота не стреляет по бронетехнике и танкам`
      }
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
      const { normalizeFireObject } = require('../fire/battleFireNormalize')
      const reactiveTables = o.useReactiveFire
        ? normalizeFireObject(found.unit.fireReactive)
        : undefined
      const acc =
        shootingAccuracyAtHexDistance.length >= 3
          ? shootingAccuracyAtHexDistance(found.unit, effDFire, found.cell, reactiveTables)
          : shootingAccuracyAtHexDistance(found.unit, effDFire)
        if (acc <= 0) {
          return `Приказ ${i + 1}: на этой дистанции меткость 0 — стрельба невозможна`
        }
      }
      if ((ok === 'fire' || ok === 'fireHard') && unitUsesGunDeploy(found.unit)) {
        const dotMod = require('../map/battleDot')
        if (!dotMod.unitInDot(found.unit)) {
          if (unitUsesGunDeploy(found.unit) && !isArtilleryDeployedForBattle(found.unit)) {
            return `Приказ ${i + 1}: орудие свёрнуто — приказ «Развёртывание»`
          }
          if (!isArtilleryFireTargetCellAllowed(found.unit, tgt.cell.id)) {
            return `Приказ ${i + 1}: цель вне сектора обстрела`
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
      if (
        (ok === 'fire' || ok === 'fireHard' || ok === 'attack') &&
        isHiddenConcealed(tgt.unit) &&
        !canSpotHiddenTarget(found.unit, found.cell, tgt.unit, tgt.cell, cells)
      ) {
        return `Приказ ${i + 1}: скрытый отряд не обнаружен`
      }
      const smokeMod = require('../map/battleSmoke')
      if ((ok === 'fire' || ok === 'fireHard' || ok === 'attack') && smokeMod.hasSmokeOnCell(tgt.cell.builds)) {
        return `Приказ ${i + 1}: цель в дымовой завесе`
      }
      if (ok === 'attack') {
        if (!isAttackOrderValid(cells, uid, Number(tid))) {
          return `Приказ ${i + 1}: атака невозможна (дистанция ≤ ОП−1 до соседнего гекса цели, на гексе цели только один противник)`
        }
      }
    }
    if (ok === 'hardMove') {
      const tid = o.targetUnitInstanceId
      if (tid == null) return `Приказ ${i + 1}: нужна цель (targetUnitInstanceId)`
      const tgt = findUnitOnField(cells, tid)
      if (!tgt) return `Приказ ${i + 1}: цель не на поле`
      if (!factionsOpposed(unitFaction(found.unit), unitFaction(tgt.unit))) {
        return `Приказ ${i + 1}: цель должна быть противником`
      }
      if (!canSpotAmbushTarget(found.unit, found.cell, tgt.unit, tgt.cell, cells)) {
        return `Приказ ${i + 1}: цель в засаде — заметна только вплотную, огнём по площади или после её выстрела`
      }
      if (isHiddenConcealed(tgt.unit) && !canSpotHiddenTarget(found.unit, found.cell, tgt.unit, tgt.cell, cells)) {
        return `Приказ ${i + 1}: скрытый отряд не обнаружен`
      }
      if (!isAttackOrderValid(cells, uid, Number(tid))) {
        return `Приказ ${i + 1}: мощная атака невозможна (дистанция ≤ ОП−1 до соседнего гекса цели, на гексе цели только один противник)`
      }
      continue
    }
    if (ok === 'fireMove') {
      const fireMoveMod = require('../unit/battleFireMove')
      const errFm = fireMoveMod.validateFireMoveOrder(cells, found, o, {
        isArtilleryUnit,
        isArtilleryDeployedForBattle,
        isMoveOrderValid,
        findUnitOnField,
        factionsOpposed,
        unitFaction,
        getMovePoint,
        computeRevealedCellIdsForFaction,
        isAmbushConcealed: require('../../core/battleAmbush').isAmbushConcealed,
        canSpotAmbushTarget,
        rangeArrayForAtCell,
        fireRangeTableMode,
        isHexVisible,
        artilleryAreaClosedIgnoresTerrainLos,
        hexDistCells,
        isArtilleryUnit,
        unitHasPropKey,
        rangeArrayFor,
        getStr,
      })
      if (errFm) return `Приказ ${i + 1}: ${errFm}`
      continue
    }
    if (ok === 'fireAdjustment') {
      const errAdj = validateFireAdjustmentSpotterOrder(cells, found, o, orders, normalizeOrderKey)
      if (errAdj) return `Приказ ${i + 1}: ${errAdj}`
      continue
    }
    if (ok === 'medical') {
      const medical = require('../unit/battleMedical')
      const tid = Number(o.targetUnitInstanceId)
      if (!Number.isFinite(tid)) return `Приказ ${i + 1}: лечение — укажите отряд`
      const tgt = findUnitOnField(cells, tid)
      if (!tgt) return `Приказ ${i + 1}: лечение — цель не на поле`
      if (unitFaction(tgt.unit) !== unitFaction(found.unit)) {
        return `Приказ ${i + 1}: лечение — только союзник`
      }
      if (hexDistCells(found.cell, tgt.cell) > 1) {
        return `Приказ ${i + 1}: лечение — свой или соседний гекс`
      }
      if (!medical.isMedicalAidReceiver(tgt.unit)) {
        return `Приказ ${i + 1}: лечение — только пехота или артиллерия`
      }
      continue
    }
    if (ok === 'razvedka' || ok === 'svzy') {
      const recon = require('../recon/battleReconResolve')
      const rangeArray = recon.readRangeCsvFromUnit(found.unit, ok)
      const maxR = Math.max(1, rangeArray.length)
      const r = Number(o.reconRangeSteps)
      if (!Number.isFinite(r) || r < 1 || r > maxR) {
        return `Приказ ${i + 1}: укажите радиус 1…${maxR} (клик по гексу зоны)`
      }
      continue
    }
    if (ok === 'move' || ok === 'moveWar') {
      if (unitUsesGunDeploy(found.unit) && isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: развёрнутое орудие не передвигается — «Свёртывание»`
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
    if (ok === 'accompaniment' || AIR_HEX_TARGET_ORDER_KEYS.has(ok)) {
      const airSortieMod = require('../air/battleAirSortie')
      const rainBlock = airSortieMod.airLaunchWeatherBlockReason(ok)
      if (rainBlock) return `Приказ ${i + 1}: ${rainBlock}`
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
      if (!unitUsesGunDeploy(found.unit)) return `Приказ ${i + 1}: свёртывание доступно орудию с сектором стрельбы`
      continue
    }
    if (ok === 'enterDot') {
      const dotMod = require('../map/battleDot')
      if (!dotMod.canEnterDotUnitType(found.unit, isInfantryUnit, isArtilleryUnit)) {
        return `Приказ ${i + 1}: занять ДОТ могут только пехота и артиллерия`
      }
      if (isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: развёрнутое орудие не может занять ДОТ — сначала «Свёртывание»`
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
      if (!unitUsesGunDeploy(found.unit)) return `Приказ ${i + 1}: развёртывание доступно орудию с сектором стрельбы`
      if (isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: орудие уже развёрнуто`
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
      if (!unitUsesGunDeploy(found.unit)) return `Приказ ${i + 1}: смена сектора доступна орудию с сектором стрельбы`
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
      if (unitUsesGunDeploy(found.unit) && !isArtilleryDeployedForBattle(found.unit)) {
        return `Приказ ${i + 1}: орудие свёрнуто — сначала «Развёртывание»`
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
        const { isAmbushAllowedOnCell } = require('../map/battleTerrain')
        if (!isAmbushAllowedOnCell(found.cell, found.unit)) {
          const ut = String(found.unit?.type || '')
          return `Приказ ${i + 1}: засада на этом гексе запрещена для типа «${ut}»`
        }
        const already = require('../../core/battleAmbush').isAmbushConcealed(found.unit)
        if (!already && isCellSeenByAnyHostileUnit(found.unit, found.cell, cells)) {
          return `Приказ ${i + 1}: засада — гекс должен быть вне обзора всех юнитов противника`
        }
      }
    }
    if (ok === 'trenches') {
      const trench = require('../map/battleTrench')
      if (trench.isTrenchDigging(found.unit)) {
        return `Приказ ${i + 1}: юнит уже окапывается`
      }
      if (getStr(found.unit) < trench.TRENCH_DIG_MIN_STR) {
        return `Приказ ${i + 1}: окопаться — численность не менее ${trench.TRENCH_DIG_MIN_STR}`
      }
      if (trench.isTrenchForbiddenOnCell(found.cell)) {
        return `Приказ ${i + 1}: окоп нельзя ставить на эту местность`
      }
      const fid = o.defendFacingCellId != null ? Number(o.defendFacingCellId) : Number(o.targetCellId)
      if (!Number.isFinite(fid)) return `Приказ ${i + 1}: окопаться — укажите соседний гекс направления`
      const fCell = cells.find((c) => Number(c.id) === fid)
      if (!fCell) return `Приказ ${i + 1}: окопаться — клетка направления не найдена`
      if (hexDistCells(found.cell, fCell) !== 1) {
        return `Приказ ${i + 1}: окопаться — направление должно быть соседним гексом`
      }
      const dir = trench.findMoveDir(found.cell, fCell)
      if (dir < 0) return `Приказ ${i + 1}: окопаться — неверное направление`
      const visualEdge = trench.moveDirToVisualEdge(dir)
      if (trench.hasTrenchOnEdge(found.cell.builds, visualEdge)) {
        return `Приказ ${i + 1}: окоп с этой стороны уже есть`
      }
    }
    if (ok === 'cutWire') {
      const wireEdges = require('../map/battleWireEdges')
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: снятие проволоки — укажите клетку`
      const tgtCell = cells.find((c) => Number(c.id) === cid)
      if (!tgtCell) return `Приказ ${i + 1}: снятие проволоки — клетка не найдена`
      const dist = hexDistCells(found.cell, tgtCell)
      if (dist > 1) return `Приказ ${i + 1}: снятие проволоки — только свой или соседний гекс`
      if (dist === 0) {
        const edgeDir = Math.floor(Number(o.wireEdgeDir != null ? o.wireEdgeDir : o.trenchEdgeDir))
        if (!Number.isFinite(edgeDir) || edgeDir < 0 || edgeDir > 5) {
          return `Приказ ${i + 1}: снятие проволоки — укажите грань с проволокой`
        }
        if (!wireEdges.hasWireOnEdge(tgtCell.builds, edgeDir)) {
          return `Приказ ${i + 1}: на этой грани нет проволоки`
        }
      } else {
        const dir = wireEdges.findMoveDir(found.cell, tgtCell)
        if (dir < 0) return `Приказ ${i + 1}: снятие проволоки — не соседний гекс`
        const oppDir = (dir + 3) % 6
        const hasShared =
          wireEdges.hasWireOnMoveDir(found.cell.builds, dir) ||
          wireEdges.hasWireOnMoveDir(tgtCell.builds, oppDir)
        if (!hasShared) return `Приказ ${i + 1}: на общей грани нет проволоки`
      }
    }
    if (ok === 'buildPonton') {
      const sapper = require('../map/battleSapperJobs')
      const ponton = require('../map/battlePonton')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      if (getStr(found.unit) < sapper.PONTON_MIN_STR) {
        return `Приказ ${i + 1}: наведение переправы — численность не менее ${sapper.PONTON_MIN_STR}`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: наведение переправы — укажите гекс реки`
      const river = cells.find((c) => Number(c.id) === cid)
      if (!river || !ponton.isRiverCell(river)) {
        return `Приказ ${i + 1}: наведение переправы — цель должна быть рекой`
      }
      if (!ponton.isAdjacentRiverTarget(found.cell, river)) {
        return `Приказ ${i + 1}: наведение переправы — отряд должен стоять на соседнем с рекой гексе`
      }
      if (ponton.isPontonComplete(river.builds)) {
        return `Приказ ${i + 1}: на этой реке переправа уже наведена`
      }
    }
    if (ok === 'cutEj') {
      const sapper = require('../map/battleSapperJobs')
      const atEdges = require('../map/battleAntiTankEdges')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: снятие ежей — укажите клетку`
      const tgtCell = cells.find((c) => Number(c.id) === cid)
      if (!tgtCell) return `Приказ ${i + 1}: снятие ежей — клетка не найдена`
      const dist = hexDistCells(found.cell, tgtCell)
      if (dist > 1) return `Приказ ${i + 1}: снятие ежей — только свой или соседний гекс`
      if (dist === 0) {
        const edgeDir = Math.floor(Number(o.wireEdgeDir != null ? o.wireEdgeDir : o.trenchEdgeDir))
        if (!Number.isFinite(edgeDir) || edgeDir < 0 || edgeDir > 5) {
          return `Приказ ${i + 1}: снятие ежей — укажите грань с заграждением`
        }
        if (!atEdges.hasAntiTankOnEdge(tgtCell.builds, edgeDir)) {
          return `Приказ ${i + 1}: на этой грани нет противотанкового заграждения`
        }
      } else {
        const dir = atEdges.findMoveDir(found.cell, tgtCell)
        if (dir < 0) return `Приказ ${i + 1}: снятие ежей — не соседний гекс`
        const oppDir = (dir + 3) % 6
        const hasShared =
          atEdges.hasAntiTankOnMoveDir(found.cell.builds, dir) ||
          atEdges.hasAntiTankOnMoveDir(tgtCell.builds, oppDir)
        if (!hasShared) return `Приказ ${i + 1}: на общей грани нет противотанкового заграждения`
      }
    }
    if (ok === 'demining') {
      const sapper = require('../map/battleSapperJobs')
      const mineMod = require('../map/battleMines')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      const cid = Number(o.targetCellId != null ? o.targetCellId : found.cell.id)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: разминирование — укажите клетку`
      const tgtCell = cells.find((c) => Number(c.id) === cid)
      if (!tgtCell) return `Приказ ${i + 1}: разминирование — клетка не найдена`
      if (hexDistCells(found.cell, tgtCell) > 1) {
        return `Приказ ${i + 1}: разминирование — только свой или соседний гекс`
      }
      if (!mineMod.isMineDiscoveredForUnit(tgtCell, found.unit)) {
        return `Приказ ${i + 1}: разминирование — минное поле должно быть обнаружено`
      }
    }
    if (ok === 'mining') {
      const sapper = require('../map/battleSapperJobs')
      const mineMod = require('../map/battleMines')
      const { getMines } = require('../unit/battleUnitResources')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      if (getMines(found.unit) < 1) {
        return `Приказ ${i + 1}: минирование — нет мин в запасе`
      }
      if (mineMod.hasMineOnCell(found.cell.builds)) {
        return `Приказ ${i + 1}: минирование — на этом гексе уже есть минное поле`
      }
      const trench = require('../map/battleTrench')
      if (trench.cellBlocksSapperPlacement(found.cell)) {
        return `Приказ ${i + 1}: минирование — нельзя на гексе с ДОТ, складом или понтоном`
      }
      if (o.mineKind !== 'infantry' && o.mineKind !== 'tank') {
        return `Приказ ${i + 1}: минирование — выберите тип мины (пехотная или танковая)`
      }
    }
    if (ok === 'smoke') {
      const smokeMod = require('../map/battleSmoke')
      if (smokeMod.getSmokeShells(found.unit) < 1) {
        return `Приказ ${i + 1}: нет дымовых снарядов`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: дымовая завеса — укажите гекс`
      const tc = cells.find((c) => Number(c.id) === cid)
      if (!tc) return `Приказ ${i + 1}: дымовая завеса — клетка не найдена`
      if (!smokeMod.fireSectorAllowsSmokeHex(found.unit, found.cell, tc, cells)) {
        return `Приказ ${i + 1}: дымовая завеса — гекс вне сектора стрельбы (артиллерия: развернитесь)`
      }
      if (
        !smokeMod.friendlyCanSpotSmokeHex(cells, found.unit, tc, {
          unitFaction,
          getStr,
          isHexVisible,
          maxShootRangeStepsForUnit,
          hexDistCells,
        })
      ) {
        return `Приказ ${i + 1}: дымовая завеса — гекс вне линии видимости или дальности стрельбы (своей или союзника)`
      }
    }
    if (ok === 'explomost' || ok === 'demolition') {
      const sapper = require('../map/battleSapperJobs')
      const demo = require('../map/battleDemolition')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      if (!demo.canPayDemolitionCharge(found.unit)) {
        return demo.unitPaysWithMines(found.unit)
          ? `Приказ ${i + 1}: подрыв — нет мин`
          : `Приказ ${i + 1}: подрыв — нет взрывчатки`
      }
      const cid = Number(o.targetCellId)
      if (!Number.isFinite(cid)) return `Приказ ${i + 1}: подрыв — укажите клетку`
      const tc = cells.find((c) => Number(c.id) === cid)
      if (!tc) return `Приказ ${i + 1}: подрыв — клетка не найдена`
      if (hexDistCells(found.cell, tc) !== 1) return `Приказ ${i + 1}: подрыв — только соседний гекс`
      if (!demo.structureKind(tc)) {
        return `Приказ ${i + 1}: подрыв — на гексе нет склада, ДОТа, моста или железной дороги`
      }
    }
    if (ok === 'repairRailway') {
      const sapper = require('../map/battleSapperJobs')
      const railway = require('../map/battleRailway')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      const eligible = railway.cellsEligibleForRepairRailway(found.cell, cells)
      if (!eligible.length) {
        return `Приказ ${i + 1}: ремонт ЖД — нет разрушенного пути на своём или соседнем гексе`
      }
      const cid = Number(o.targetCellId)
      if (Number.isFinite(cid)) {
        if (!eligible.some((c) => Number(c.id) === cid)) {
          return `Приказ ${i + 1}: ремонт ЖД — укажите свой или соседний гекс с разрушенной железной дорогой`
        }
      }
    }
    if (ok === 'arson') {
      const sapper = require('../map/battleSapperJobs')
      const fire = require('../map/battleSettlementFire')
      if (sapper.isSapperBusy(found.unit)) {
        return `Приказ ${i + 1}: ${sapper.sapperBusyReason(found.unit)}`
      }
      if (!fire.settlementKind(found.cell)) {
        return `Приказ ${i + 1}: поджог — только город, деревня или железнодорожная станция`
      }
      if (fire.hasSettlementFire(found.cell)) {
        return `Приказ ${i + 1}: поджог — на гексе уже идёт пожар`
      }
      if (fire.isSettlementDestroyed(found.cell)) {
        return `Приказ ${i + 1}: поджог — населённый пункт уже разрушен`
      }
    }
    if (ok === 'railLoading' || ok === 'railUnloading') {
      const railway = require('../map/battleRailway')
      if (!railway.isRailwayUnit(found.unit)) {
        return `Приказ ${i + 1}: нужен железнодорожный отряд`
      }
      if (!railway.isRailwayCell(found.cell)) {
        return `Приказ ${i + 1}: железнодорожный отряд должен стоять на железной дороге`
      }
      if (railway.isRailBusy(found.unit)) {
        return `Приказ ${i + 1}: ${railway.railBusyReason(found.unit)}`
      }
      if (ok === 'railLoading') {
        const tid = Number(o.targetUnitInstanceId)
        if (!Number.isFinite(tid)) return `Приказ ${i + 1}: погрузка на ЖД — укажите отряд`
        const tgt = findUnitOnField(cells, tid)
        if (!tgt) return `Приказ ${i + 1}: погрузка на ЖД — цель не на поле`
        if (unitFaction(found.unit) !== unitFaction(tgt.unit)) {
          return `Приказ ${i + 1}: погрузка на ЖД — только союзник`
        }
        if (hexDistCells(found.cell, tgt.cell) !== 1) {
          return `Приказ ${i + 1}: погрузка на ЖД — цель в соседнем гексе`
        }
        if (!railway.canRailAcceptUnit(found.unit, tgt.unit)) {
          return `Приказ ${i + 1}: погрузка на ЖД — нет места (2 пехоты + 2 техники/орудий)`
        }
      }
      if (ok === 'railUnloading') {
        const cargoId = Number(o.targetUnitInstanceId)
        const cid = Number(o.targetCellId)
        if (!Number.isFinite(cargoId)) return `Приказ ${i + 1}: выгрузка на ЖД — укажите груз`
        if (!Number.isFinite(cid)) return `Приказ ${i + 1}: выгрузка на ЖД — укажите клетку`
        const arr = found.unit.tactical && Array.isArray(found.unit.tactical.carriedUnits)
          ? found.unit.tactical.carriedUnits
          : []
        if (!arr.some((u) => Number(u.instanceId) === cargoId)) {
          return `Приказ ${i + 1}: выгрузка на ЖД — юнит не в составе`
        }
        const tc = cells.find((c) => Number(c.id) === cid)
        if (!tc) return `Приказ ${i + 1}: выгрузка на ЖД — клетка не найдена`
        if (hexDistCells(found.cell, tc) > 1) return `Приказ ${i + 1}: выгрузка на ЖД — клетка не рядом`
      }
    }
  }
  return null
}

function validateBattleOrdersWithFogMemo(cells, orders, context) {
  const fogVis = require('../map/battleFogVisibility')
  fogVis.beginFogMemo(cells)
  try {
    return validateBattleOrders(cells, orders, context)
  } finally {
    fogVis.endFogMemo()
  }
}

module.exports = {
  validateBattleOrders: validateBattleOrdersWithFogMemo,
}

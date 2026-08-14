'use strict'

const { ensureCarriedUnits } = require('../../core/battleTransport')
const { terrainEntryCost } = require('../map/battleTerrain')
const { unitHasPropKey } = require('../../core/battleUnitType')
const { unitFaction, opposing, getStr } = require('../unit/battleUnitField')
const { isBattleAirUnit } = require('./battleAirSortie')
const { pickDesantLandingMeleeOpponent } = require('./battleDesantCombat')

const DESANT_MISSION_STEPS = 3

const LIGHT_TERRAIN = new Set([
  'plain',
  'field',
  'meadow',
  'steppe',
  'shrub',
  'bush',
  'farmland',
  'grass',
])

const MEDIUM_TERRAIN = new Set([
  'hill',
  'sparse_forest',
  'sparseforest',
  'village',
  'city',
  'town',
  'ravine',
  'ford',
  'stones',
  'rock',
  'rocks',
])

const HEAVY_TERRAIN = new Set([
  'forest',
  'swamp',
  'marsh',
  'bog',
  'river',
  'lake',
  'water',
  'mountain',
])

const LIGHT_NAME = /равнин|кустарник|пашн|луг|степ/i
const MEDIUM_NAME = /редколес|деревн|город|овраг|брод|камн/i
const HEAVY_NAME = /(?:^|\s)лес(?:$|\s)|болот|река|озер/i

const WATER_LANDING = new Set(['river', 'swamp', 'lake', 'marsh', 'bog', 'water'])
const WATER_NAME = /река|болот|озер/i

const BRIDGE_KEYS = new Set([
  'pontonBridge',
  'bridge',
  'railBridge',
  'destroyedBridge',
  'destroyedRailBridge',
])

function normalizeTerrainToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function cellBuildingKeys(cell) {
  const out = new Set()
  const ab = cell?.allowedBuildings
  if (Array.isArray(ab)) {
    for (let i = 0; i < ab.length; i++) out.add(String(ab[i] || '').trim())
  }
  const ex = cell?.hexExtra
  if (ex && typeof ex === 'object' && ex.placement && typeof ex.placement === 'object') {
    for (const k of Object.keys(ex.placement)) {
      if (ex.placement[k]) out.add(String(k).trim())
    }
  }
  return out
}

function classifyDesantLandingTerrain(cell) {
  if (!cell) return 'medium'
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
  const fromExtra = ex?.desantLandingClass
  if (fromExtra === 'light' || fromExtra === 'medium' || fromExtra === 'heavy') return fromExtra

  const buildings = cellBuildingKeys(cell)
  for (const b of buildings) {
    if (BRIDGE_KEYS.has(b)) return 'heavy'
  }

  const type = normalizeTerrainToken(cell.terrainType)
  const name = String(cell.name || '')

  if (LIGHT_TERRAIN.has(type) || LIGHT_NAME.test(name)) return 'light'
  if (HEAVY_TERRAIN.has(type) || HEAVY_NAME.test(name)) return 'heavy'
  if (MEDIUM_TERRAIN.has(type) || MEDIUM_NAME.test(name)) return 'medium'

  const mc = Number(cell.moveCostInf ?? cell.moveCost ?? 1)
  if (mc >= 3) return 'heavy'
  if (mc >= 2) return 'medium'
  return 'light'
}

function isDesantWaterLandingTerrain(cell) {
  const cls = classifyDesantLandingTerrain(cell)
  if (cls === 'heavy') {
    const type = normalizeTerrainToken(cell?.terrainType)
    const name = String(cell?.name || '')
    return WATER_LANDING.has(type) || WATER_NAME.test(name)
  }
  return false
}

function rollD6(rng) {
  const rand = rng || Math.random
  return Math.floor(rand() * 6) + 1
}

function runDesantLandingTest(cell, paratrooper, rng) {
  const terrainClass = classifyDesantLandingTerrain(cell)
  if (terrainClass === 'light') {
    return { terrainClass, roll: null, loss: 0 }
  }
  const roll = rollD6(rng)
  if (terrainClass === 'medium') {
    return { terrainClass, roll, loss: roll === 1 ? 1 : 0 }
  }
  if (roll === 1) return { terrainClass, roll, loss: 1 }
  if (roll === 2) return { terrainClass, roll, loss: 2 }
  return { terrainClass, roll, loss: 0 }
}

function capCarriedDesantToTransportStrength(plane, deps) {
  const { getStr: getStrFn, setStr } = deps
  const cap = getStrFn(plane)
  const carried = ensureCarriedUnits(plane)
  for (let i = 0; i < carried.length; i++) {
    const p = carried[i]
    if (getStrFn(p) > cap) setStr(p, cap)
  }
}

function ensureDesantSortie(unit) {
  const tac = unit.tactical && typeof unit.tactical === 'object' ? unit.tactical : {}
  unit.tactical = tac
  if (!tac.airSortie || typeof tac.airSortie !== 'object') tac.airSortie = {}
  const sortie = tac.airSortie
  sortie.phase = 'desant'
  sortie.activeOrderKey = 'desant'
  sortie.firedWeapons = false
  return sortie
}

function startDesantMissionStep1({ unit, departureCellId, targetCellId, pathIds, le, ph, deps }) {
  capCarriedDesantToTransportStrength(unit, deps)
  const sortie = ensureDesantSortie(unit)
  sortie.desantStep = 2
  sortie.departureCellId = Number(departureCellId)
  sortie.dropTargetCellId = Number(targetCellId)
  sortie.outboundPathIds = Array.isArray(pathIds) ? pathIds.map(Number) : []
  sortie.landedParatrooperInstanceIds = []

  const tac = unit.tactical
  tac.airMissionFlightPath = sortie.outboundPathIds
  tac.airMissionTargetCellId = Number(targetCellId)
  tac.airMissionOrderKey = 'desant'

  const carried = ensureCarriedUnits(unit)
  const names = carried.map((c) => String(c.name || c.instanceId)).join(', ') || '—'
  le(
    ph,
    `Десант · ход 1/3 — вылет: юнит ${unit.instanceId}, десантники на борту (${names}), цель кл. ${targetCellId}`,
    {
      airMissionLine: {
        orderKey: 'desant',
        unitInstanceId: Number(unit.instanceId),
        fromCellId: Number(departureCellId),
        toCellId: Number(targetCellId),
        pathCellIds: sortie.outboundPathIds,
        desantStep: 1,
        desantStepMax: DESANT_MISSION_STEPS,
      },
    },
  )
}

function findOpposingLiveOnCell(cell, faction) {
  const out = []
  for (const u of cell.units || []) {
    if (getStr(u) <= 0) continue
    if (opposing(unitFaction(u), faction)) out.push(u)
  }
  return out
}

function canDesantLandOnCell(cell, paratrooper) {
  if (!cell) return false
  if (terrainEntryCost(cell, paratrooper) === 0) return false
  let liveOnHex = 0
  for (const u of cell.units || []) {
    if (Number(u.instanceId) === Number(paratrooper.instanceId)) continue
    if (getStr(u) <= 0) continue
    liveOnHex++
  }
  return liveOnHex < 3
}

function executeDesantDrop({ cells, plane, targetCellId, le, ph, deps }) {
  const {
    findUnitOnField,
    getStr: getStrFn,
    setStr,
    addUnitToCell,
    logUnitDestroyed,
    sweepCorpses,
    linkMeleeOpponents,
    ensureTacticalBattle,
  } = deps

  const targetCell = cells.find((c) => Number(c.id) === Number(targetCellId))
  if (!targetCell) {
    le(ph, `Десант · ход 2/3: юнит ${plane.instanceId} — клетка ${targetCellId} не найдена`)
    return []
  }

  const carried = ensureCarriedUnits(plane)
  const landedIds = []
  const planeFac = unitFaction(plane)

  for (let i = carried.length - 1; i >= 0; i--) {
    const paratrooper = carried[i]
    if (getStrFn(paratrooper) <= 0) {
      carried.splice(i, 1)
      continue
    }

    if (!canDesantLandOnCell(targetCell, paratrooper)) {
      le(ph, `Десант: отряд ${paratrooper.instanceId} — высадка на кл. ${targetCellId} невозможна (местность или переполнение)`)
      setStr(paratrooper, 0)
      carried.splice(i, 1)
      continue
    }

    const landing = runDesantLandingTest(targetCell, paratrooper)
    if (landing.loss > 0) {
      const prev = getStrFn(paratrooper)
      setStr(paratrooper, prev - landing.loss)
      le(
        ph,
        `Десант · тест приземления (${landing.terrainClass}): отряд ${paratrooper.instanceId}, d6=${landing.roll}, потери ${landing.loss}`,
        {
          desantLandingLine: {
            unitInstanceId: Number(paratrooper.instanceId),
            targetCellId: Number(targetCellId),
            terrainClass: landing.terrainClass,
            roll: landing.roll,
            loss: landing.loss,
          },
        },
      )
      logUnitDestroyed(le, ph, paratrooper, prev, 'десантирование', targetCellId)
    }

    if (getStrFn(paratrooper) <= 0) {
      carried.splice(i, 1)
      continue
    }

    carried.splice(i, 1)
    addUnitToCell(targetCell, paratrooper)
    syncUnitCoords(paratrooper, targetCell)
    landedIds.push(Number(paratrooper.instanceId))

    const tacP = ensureTacticalBattle(paratrooper)
    tacP.desantDroppedByPlaneId = Number(plane.instanceId)
    if (isDesantWaterLandingTerrain(targetCell)) tacP.desantWaterLanding = true
    if (unitHasPropKey(paratrooper, 'equipment')) tacP.desantEquipScheduled = true

    const enemies = findOpposingLiveOnCell(targetCell, planeFac)
    if (enemies.length > 0) {
      tacP.desantHalfCombat = true
      const meleeTarget = pickDesantLandingMeleeOpponent(paratrooper, enemies)
      if (meleeTarget && typeof linkMeleeOpponents === 'function') {
        linkMeleeOpponents(paratrooper, meleeTarget, deps)
        le(
          ph,
          `Десант: отряд ${paratrooper.instanceId} высадился на кл. ${targetCellId} с противником — ближний бой (половинные З/IO)`,
        )
      } else {
        le(
          ph,
          `Десант: отряд ${paratrooper.instanceId} высадился на кл. ${targetCellId} с противником — огонь по пехоте (половинные З/IO)`,
        )
      }
    } else {
      le(ph, `Десант: отряд ${paratrooper.instanceId} высадился на кл. ${targetCellId}`)
    }
  }

  sweepCorpses(cells)
  return landedIds
}

function syncUnitCoords(unit, cell) {
  if (!unit || !cell) return
  unit.coor = { q: cell.q, r: cell.r }
  if (cell.x != null) unit.x = cell.x
  if (cell.y != null) unit.y = cell.y
}

function applyDesantPostReturnEffects(cells, instanceIds, le, ph, deps) {
  const { findUnitOnField } = deps
  for (let i = 0; i < instanceIds.length; i++) {
    const id = Number(instanceIds[i])
    const live = findUnitOnField(cells, id)
    if (!live || getStr(live.unit) <= 0) continue
    const u = live.unit
    const tac = u.tactical && typeof u.tactical === 'object' ? u.tactical : {}
    u.tactical = tac
    if (unitHasPropKey(u, 'equipment')) {
      delete tac.desantDroppedByPlaneId
      continue
    }
    if (tac.desantWaterLanding) {
      tac.desantOnlyBattleMoveTurnsLeft = 1
      delete tac.desantWaterLanding
      le(ph, `Десант: отряд ${id} — после высадки на водную/болотную местность только «Боевое положение»`)
    }
    delete tac.desantDroppedByPlaneId
  }
}

function tickDesantParatrooperStates(cells, le, turnIndex) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      const tac = u.tactical
      if (!tac || typeof tac !== 'object') continue

      if (tac.desantEquipScheduled) {
        delete tac.desantEquipScheduled
        tac.desantEquipping = true
        tac.desantEquippingTurnsLeft = 1
        tac.desantHalfCombat = true
        le(-1, `Десант · снаряжение: отряд ${u.instanceId} — приказы недоступны, половинные З/IO`, {
          unitInstanceId: Number(u.instanceId),
          turn: turnIndex,
        })
      }

      if (tac.desantEquippingTurnsLeft != null) {
        let left = Number(tac.desantEquippingTurnsLeft)
        if (!Number.isFinite(left)) left = 0
        left -= 1
        if (left <= 0) {
          delete tac.desantEquipping
          delete tac.desantEquippingTurnsLeft
          delete tac.desantHalfCombat
          delete tac.desantDroppedByPlaneId
          if (tac.desantWaterLanding) {
            tac.desantOnlyBattleMoveTurnsLeft = 1
            delete tac.desantWaterLanding
            le(-1, `Десант: отряд ${u.instanceId} — после снаряжения только «Боевое положение»`, {
              unitInstanceId: Number(u.instanceId),
              turn: turnIndex,
            })
          }
        } else {
          tac.desantEquippingTurnsLeft = left
        }
      }

      if (tac.desantOnlyBattleMoveTurnsLeft != null) {
        let left = Number(tac.desantOnlyBattleMoveTurnsLeft)
        if (!Number.isFinite(left)) left = 0
        left -= 1
        if (left <= 0) delete tac.desantOnlyBattleMoveTurnsLeft
        else tac.desantOnlyBattleMoveTurnsLeft = left
      }
    }
  }
}

function desantHalfCombatActive(unit) {
  const t = unit?.tactical
  return !!(t?.desantHalfCombat || t?.desantEquipping)
}

function applyDesantHalfStat(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.ceil(n / 2)
}

function isDesantOnlyBattleMoveUnit(unit) {
  const left = Number(unit?.tactical?.desantOnlyBattleMoveTurnsLeft)
  return Number.isFinite(left) && left > 0
}

function processOngoingDesantMissions(cells, newDesantUnitIds, le, ph, deps) {
  const { findUnitOnField, getStr: getStrFn, beginAirCooldown } = deps

  for (const c of cells) {
    for (const u of c.units || []) {
      if (!isBattleAirUnit(u)) continue
      const sortie = u.tactical?.airSortie
      if (!sortie || sortie.phase !== 'desant') continue
      const uid = Number(u.instanceId)
      if (newDesantUnitIds.has(uid)) continue

      const step = Number(sortie.desantStep)
      if (step === 2) {
        const targetCellId = Number(sortie.dropTargetCellId)
        const pathIds = Array.isArray(sortie.outboundPathIds) ? sortie.outboundPathIds : []
        const live = findUnitOnField(cells, uid)
        if (!live || getStrFn(live.unit) <= 0) continue

        le(
          ph,
          `Десант · ход 2/3 — десантирование: юнит ${uid} → кл. ${targetCellId}`,
          {
            airMissionLine: {
              orderKey: 'desant',
              unitInstanceId: uid,
              fromCellId: Number(sortie.departureCellId),
              toCellId: targetCellId,
              pathCellIds: pathIds,
              desantStep: 2,
              desantStepMax: DESANT_MISSION_STEPS,
            },
          },
        )

        const landed = executeDesantDrop({
          cells,
          plane: live.unit,
          targetCellId,
          le,
          ph,
          deps,
        })
        sortie.landedParatrooperInstanceIds = landed
        sortie.desantStep = 3
        continue
      }

      if (step === 3) {
        const livePlane = findUnitOnField(cells, uid)
        const planeUnit = livePlane?.unit || u
        const dep = Number(sortie.departureCellId)
        const path = Array.isArray(sortie.outboundPathIds) ? sortie.outboundPathIds : []
        const fromId = Number(sortie.dropTargetCellId) || Number(c.id)
        const landed = Array.isArray(sortie.landedParatrooperInstanceIds) ? sortie.landedParatrooperInstanceIds : []

        le(
          ph,
          `Десант · ход 3/3 — возвращение на базу: юнит ${uid}`,
          {
            airMissionLine: {
              orderKey: 'desant',
              unitInstanceId: uid,
              fromCellId: fromId,
              toCellId: dep,
              pathCellIds: [],
              desantStep: 3,
              desantStepMax: DESANT_MISSION_STEPS,
              airReturnDirect: true,
            },
          },
        )

        applyDesantPostReturnEffects(cells, landed, le, ph, {
          ...deps,
          unitHasPropKey,
        })

        beginAirCooldown(planeUnit, dep, path, fromId, false, le, ph)
        delete sortie.desantStep
        delete sortie.dropTargetCellId
        delete sortie.outboundPathIds
        delete sortie.landedParatrooperInstanceIds
      }
    }
  }
}

module.exports = {
  DESANT_MISSION_STEPS,
  classifyDesantLandingTerrain,
  isDesantWaterLandingTerrain,
  runDesantLandingTest,
  capCarriedDesantToTransportStrength,
  startDesantMissionStep1,
  executeDesantDrop,
  applyDesantPostReturnEffects,
  tickDesantParatrooperStates,
  desantHalfCombatActive,
  applyDesantHalfStat,
  isDesantOnlyBattleMoveUnit,
  processOngoingDesantMissions,
}

'use strict'

const MAX_UNITS_PER_CELL = 3
const MAX_WAVES = 16
const MAX_UNITS = 40
const MAX_HEXES = 40

const CUBE_NEIGHBOR_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
]

function asIntCopies(raw, max) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0) continue
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

function asUniqueIntList(raw, max) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

function asCargoSlots(raw, length) {
  const src = Array.isArray(raw) ? raw : []
  const out = []
  for (let i = 0; i < length; i++) out.push(asIntCopies(src[i], 4))
  return out
}

function factionForTeam(team) {
  return Number(team) % 2 === 1 ? 'ussr' : 'germany'
}

function waveSideFaction(wave) {
  const raw = factionForTeam(wave && wave.team)
  if (raw === 'ussr') return 'rkka'
  if (raw === 'germany') return 'wehrmacht'
  return 'none'
}

function hasPendingReinforcementsForFaction(room, faction) {
  const spec = room && room.battleReinforcements
  if (!spec || spec.enabled !== true || !Array.isArray(spec.waves) || !spec.waves.length) return false
  const side = faction === 'rkka' || faction === 'wehrmacht' ? faction : null
  if (!side) return false
  const arrived =
    spec.arrivedIds && typeof spec.arrivedIds.has === 'function'
      ? spec.arrivedIds
      : new Set(Array.isArray(spec.arrivedIds) ? spec.arrivedIds : [])
  const turn = Number(room.battleTurnIndex)
  const now = Number.isFinite(turn) && turn > 0 ? turn : 0
  for (const wave of spec.waves) {
    if (!wave || arrived.has(wave.id)) continue
    if (!Array.isArray(wave.unitIds) || wave.unitIds.length === 0) continue
    if (Number(wave.arriveTurn) <= now) continue
    if (waveSideFaction(wave) === side) return true
  }
  return false
}

function clampArriveTurn(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(99, n)
}

function parseReinforcements(raw) {
  if (!raw || typeof raw !== 'object') return { enabled: false, waves: [] }
  const waves = []
  const rawWaves = Array.isArray(raw.waves) ? raw.waves : []
  for (const item of rawWaves) {
    if (!item || typeof item !== 'object') continue
    const team = Math.floor(Number(item.team))
    const arriveTurn = Math.floor(Number(item.arriveTurn))
    const id = String(item.id || '').trim() || `rf-${waves.length + 1}`
    if (!Number.isFinite(team) || team < 1) continue
    const cellIds = asUniqueIntList(item.cellIds, MAX_HEXES)
    const unitCap = cellIds.length > 0 ? Math.min(MAX_UNITS, cellIds.length * MAX_UNITS_PER_CELL) : MAX_UNITS
    const unitIds = asIntCopies(item.unitIds, unitCap)
    waves.push({
      id,
      team,
      arriveTurn: clampArriveTurn(arriveTurn),
      unitIds,
      unitCargo: asCargoSlots(item.unitCargo, unitIds.length),
      cellIds,
    })
    if (waves.length >= MAX_WAVES) break
  }
  return {
    enabled: raw.enabled === true,
    waves,
  }
}

function loadReinforcementsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const parsed = parseReinforcements(payload.reinforcements)
  if (!parsed.enabled) return null
  const waves = parsed.waves.filter((w) => Array.isArray(w.unitIds) && w.unitIds.length > 0)
  if (!waves.length) return null
  return { enabled: true, waves }
}

function currentBattleTurn(room) {
  const n = Number(room && room.battleTurnIndex)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function nextInstanceId(cells) {
  let max = 0
  for (const c of cells || []) {
    for (const u of c.units || []) {
      const n = Number(u.instanceId)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return max + 1
}

function cellById(cells) {
  const map = new Map()
  for (const c of cells || []) map.set(Number(c.id), c)
  return map
}

function neighborsOf(cell, byCube) {
  if (!cell || !cell.coor) return []
  const q = cell.coor.x
  const r = cell.coor.z
  const out = []
  for (const [dq, dr] of CUBE_NEIGHBOR_DIRS) {
    const n = byCube.get(`${q + dq},${r + dr}`)
    if (n) out.push(n)
  }
  return out
}

function cubeIndex(cells) {
  const map = new Map()
  for (const c of cells || []) {
    if (!c || !c.coor) continue
    map.set(`${c.coor.x},${c.coor.z}`, c)
  }
  return map
}

function cellHasRoom(cell) {
  if (!cell) return false
  if (!Array.isArray(cell.units)) cell.units = []
  return cell.units.length < MAX_UNITS_PER_CELL
}

function deployZoneIdsForTeam(room, team) {
  const zones =
    (room.battleDeployPhase && room.battleDeployPhase.zones) ||
    (room.battleReinforcements && room.battleReinforcements.deployZones) ||
    null
  const raw = zones && zones[String(team)]
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}

function allSpawnableCellIds(cells) {
  const empty = []
  const roomy = []
  for (const c of cells || []) {
    const id = Number(c && c.id)
    if (!Number.isFinite(id) || id <= 0) continue
    if (!Array.isArray(c.units) || c.units.length === 0) empty.push(id)
    else if (c.units.length < MAX_UNITS_PER_CELL) roomy.push(id)
  }
  return empty.concat(roomy)
}

function waveUnitCap(wave) {
  const hexes = Array.isArray(wave && wave.cellIds) ? wave.cellIds.length : 0
  if (hexes <= 0) return MAX_UNITS
  return Math.min(MAX_UNITS, hexes * MAX_UNITS_PER_CELL)
}

function preferredCellIds(room, wave) {
  const fromWave = Array.isArray(wave.cellIds) ? wave.cellIds.map((id) => Number(id)).filter((n) => n > 0) : []
  return fromWave
}

function pickSpawnCell(preferred, byId, byCube, allowNeighbors) {
  for (const id of preferred) {
    const cell = byId.get(Number(id))
    if (cellHasRoom(cell)) return cell
  }
  if (!allowNeighbors) return null
  for (const id of preferred) {
    const cell = byId.get(Number(id))
    if (!cell) continue
    for (const n of neighborsOf(cell, byCube)) {
      if (cellHasRoom(n)) return n
    }
  }
  return null
}

function spawnWave(room, wave) {
  const empty = { placed: 0, cellIds: [], instanceIds: [] }
  const cells = room.battleCells
  if (!Array.isArray(cells) || !wave.unitIds.length) return empty
  const byId = cellById(cells)
  const byCube = cubeIndex(cells)
  const preferred = preferredCellIds(room, wave)
  if (!preferred.length) return empty
  const toPlace = (wave.unitIds || []).slice(0, waveUnitCap(wave))
  const cargoSlots = asCargoSlots(wave.unitCargo, toPlace.length)
  let placed = 0
  let instanceId = nextInstanceId(cells)
  const team = Number(wave.team)
  const faction = factionForTeam(team)
  const spawnedCellIds = []
  const spawnedInstanceIds = []
  const seenCells = new Set()
  const { orderEditorMetaFromCargoIds } = require('./battleMapEditorMeta')
  for (let i = 0; i < toPlace.length; i++) {
    const catalogId = toPlace[i]
    const cell = pickSpawnCell(preferred, byId, byCube, false)
    if (!cell) break
    if (!Array.isArray(cell.units)) cell.units = []
    const unit = {
      id: catalogId,
      instanceId,
      team,
      faction,
      reinforcementWaveId: wave.id,
    }
    const cargoMeta = orderEditorMetaFromCargoIds(cargoSlots[i])
    if (cargoMeta) unit.orderEditorMeta = cargoMeta
    cell.units.push(unit)
    const cid = Number(cell.id)
    if (Number.isFinite(cid) && cid > 0 && !seenCells.has(cid)) {
      seenCells.add(cid)
      spawnedCellIds.push(cid)
    }
    spawnedInstanceIds.push(instanceId)
    instanceId += 1
    placed += 1
  }
  return { placed, cellIds: spawnedCellIds, instanceIds: spawnedInstanceIds }
}

function applyReinforcementsForCurrentTurn(room) {
  const spec = room && room.battleReinforcements
  if (!spec || !spec.enabled || !Array.isArray(spec.waves) || !spec.waves.length) return []
  if (room.battleDeployPhase && room.battleDeployPhase.active) return []
  if (!spec.arrivedIds || typeof spec.arrivedIds.has !== 'function') {
    spec.arrivedIds = new Set(Array.isArray(spec.arrivedIds) ? spec.arrivedIds : [])
  }
  const turn = currentBattleTurn(room)
  const lines = []
  for (const wave of spec.waves) {
    if (!wave || spec.arrivedIds.has(wave.id)) continue
    if (Number(wave.arriveTurn) !== turn) continue
    if (!Array.isArray(wave.unitIds) || !wave.unitIds.length) {
      spec.arrivedIds.add(wave.id)
      continue
    }
    spec.arrivedIds.add(wave.id)
    const zoneIds = preferredCellIds(room, wave)
    if (!zoneIds.length) {
      lines.push({
        text: `Подкрепление: команда ${wave.team} не прибыло на ходе ${turn} — в редакторе карты не отмечены гексы появления`,
        meta: {
          reinforcementLine: {
            team: wave.team,
            turn,
            cellIds: [],
            instanceIds: [],
          },
        },
      })
      continue
    }
    const spawned = spawnWave(room, wave)
    room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
    room.battleReinforcementsNeedEnrich = true
    const hexLabel = (spawned.cellIds || []).slice(0, 12).join(', ')
    lines.push({
      text: `Подкрепление: команда ${wave.team} — ${spawned.placed} отр. на ходе ${turn}${
        hexLabel ? ` (кл. ${hexLabel})` : ''
      }`,
      meta: {
        reinforcementLine: {
          team: wave.team,
          turn,
          cellIds: spawned.cellIds,
          instanceIds: spawned.instanceIds,
        },
      },
    })
  }
  return lines
}

function commitReinforcementsForTurn(room) {
  const lines = applyReinforcementsForCurrentTurn(room)
  if (!lines.length) return false
  if (!Array.isArray(room.battleLog)) room.battleLog = []
  const turnIdx = Number(room.battleTurnIndex) || 0
  for (const row of lines) {
    const text = typeof row === 'string' ? row : row.text
    const meta = typeof row === 'string' ? undefined : row.meta
    room.battleLog.push({
      phase: -1,
      turn: turnIdx,
      text,
      t: Date.now(),
      ...(meta ? { meta } : {}),
    })
  }
  if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
  return true
}

function initBattleReinforcements(room, spec) {
  if (!room || !spec) return
  room.battleReinforcements = {
    enabled: true,
    waves: spec.waves.map((w) => ({
      id: w.id,
      team: w.team,
      arriveTurn: w.arriveTurn,
      unitIds: [...(w.unitIds || [])],
      unitCargo: asCargoSlots(w.unitCargo, (w.unitIds || []).length),
      cellIds: [...(w.cellIds || [])],
    })),
    arrivedIds: new Set(),
  }
}

module.exports = {
  parseReinforcements,
  loadReinforcementsFromPayload,
  initBattleReinforcements,
  applyReinforcementsForCurrentTurn,
  commitReinforcementsForTurn,
  hasPendingReinforcementsForFaction,
}

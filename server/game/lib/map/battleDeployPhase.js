'use strict'

const MAX_UNITS_PER_CELL = 3

const FORT_BUILD_KEY = {
  fort_dot: 'dot',
  fort_wire: 'wire',
  fort_anti_tank: 'antiTankBuild',
  fort_trench: 'trench',
  fort_storage: 'storage',
  fort_mine: 'mine',
}

function asIntCopies(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0) continue
    out.push(n)
    if (out.length >= 400) break
  }
  return out
}

function asUniqueIntList(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function asStringCopies(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const s = String(item ?? '').trim()
    if (!s) continue
    out.push(s)
    if (out.length >= 400) break
  }
  return out
}

function parseDeployment(raw) {
  if (!raw || typeof raw !== 'object') return { zones: {}, pools: {} }
  const zones = {}
  const zonesRaw = raw.zones
  if (zonesRaw && typeof zonesRaw === 'object') {
    for (const [k, v] of Object.entries(zonesRaw)) {
      const team = Math.floor(Number(k))
      if (!Number.isFinite(team) || team < 1) continue
      zones[String(team)] = asUniqueIntList(v)
    }
  }
  const pools = {}
  const poolsRaw = raw.pools
  if (poolsRaw && typeof poolsRaw === 'object') {
    for (const [k, v] of Object.entries(poolsRaw)) {
      const team = Math.floor(Number(k))
      if (!Number.isFinite(team) || team < 1) continue
      const row = v && typeof v === 'object' ? v : {}
      pools[String(team)] = {
        unitIds: asIntCopies(row.unitIds),
        structureIds: asStringCopies(row.structureIds),
      }
    }
  }
  return { zones, pools }
}

function deploymentHasZones(deployment) {
  if (!deployment || !deployment.zones) return false
  for (const ids of Object.values(deployment.zones)) {
    if (Array.isArray(ids) && ids.length > 0) return true
  }
  return false
}

function loadDeploymentFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const parsed = parseDeployment(payload.deployment)
  return deploymentHasZones(parsed) ? parsed : null
}

function ensureBuilds(b) {
  const base = {
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
  if (!b || typeof b !== 'object') return { ...base }
  return { ...base, ...b }
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

function isEdgeCell(cell, cells) {
  const set = new Set((cells || []).map((c) => `${c.coor.x},${c.coor.z}`))
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ]
  const q = cell.coor.x
  const r = cell.coor.z
  for (const [dq, dr] of dirs) {
    if (!set.has(`${q + dq},${r + dr}`)) return true
  }
  return false
}

function factionForTeam(team) {
  return Number(team) % 2 === 1 ? 'ussr' : 'germany'
}

function stripPreviewOccupantsFromDeployZones(room) {
  const ph = room.battleDeployPhase
  if (!ph || !ph.zones) return
  const zoneIds = new Set()
  for (const ids of Object.values(ph.zones)) {
    if (!Array.isArray(ids)) continue
    for (const id of ids) zoneIds.add(Number(id))
  }
  if (!zoneIds.size) return
  for (const cell of room.battleCells || []) {
    if (!zoneIds.has(Number(cell.id))) continue
    if (Array.isArray(cell.units) && cell.units.length) cell.units = []
  }
}

function initBattleDeployPhase(room, deployment) {
  const remaining = {}
  const ready = {}
  for (const m of room.members || []) {
    ready[m.key] = false
    const team = Number(m.team)
    const pool =
      (deployment.pools && deployment.pools[String(team)]) || { unitIds: [], structureIds: [] }
    remaining[m.key] = {
      unitIds: [...(pool.unitIds || [])],
      structureIds: [...(pool.structureIds || [])],
    }
  }
  room.battleDeployPhase = {
    active: true,
    zones: deployment.zones || {},
    remaining,
    ready,
    placed: [],
  }
  stripPreviewOccupantsFromDeployZones(room)
}

function publicBattleDeploy(room, selfKey) {
  const ph = room.battleDeployPhase
  if (!ph || !ph.active) return { active: false }
  const mem = (room.members || []).find((m) => selfKey && m.key === selfKey) || null
  const team = mem ? Number(mem.team) : 0
  const zoneCellIds = (ph.zones && ph.zones[String(team)]) || []
  const rem =
    selfKey && ph.remaining && ph.remaining[selfKey]
      ? ph.remaining[selfKey]
      : { unitIds: [], structureIds: [] }
  const yourPlaced = (ph.placed || [])
    .filter((p) => selfKey && p.key === selfKey)
    .map((p) => ({
      kind: p.kind,
      cellId: Number(p.cellId),
      instanceId: p.instanceId != null ? Number(p.instanceId) : undefined,
      structureId: p.structureId != null ? String(p.structureId) : undefined,
    }))
  return {
    active: true,
    youReady: Boolean(selfKey && ph.ready && ph.ready[selfKey]),
    zoneCellIds,
    remaining: {
      unitIds: [...(rem.unitIds || [])],
      structureIds: [...(rem.structureIds || [])],
    },
    membersReady: (room.members || []).map((m) => ({
      key: m.key,
      ready: Boolean(ph.ready && ph.ready[m.key]),
      isYou: Boolean(selfKey && m.key === selfKey),
    })),
    yourPlaced,
  }
}

function takeOne(arr, value) {
  const idx = arr.indexOf(value)
  if (idx < 0) return false
  arr.splice(idx, 1)
  return true
}

function findCell(cells, cellId) {
  const id = Number(cellId)
  return (cells || []).find((c) => Number(c.id) === id) || null
}

function assertCanAct(room, mem) {
  const ph = room.battleDeployPhase
  if (!ph || !ph.active) return 'Фаза расстановки уже завершена'
  if (!mem) return 'Вы не в этой комнате'
  if (ph.ready && ph.ready[mem.key]) return 'Снимите готовность, чтобы менять расстановку'
  return null
}

function cellInTeamZone(ph, team, cellId) {
  const ids = (ph.zones && ph.zones[String(team)]) || []
  return ids.some((id) => Number(id) === Number(cellId))
}

function finishIfAllReady(room) {
  const ph = room.battleDeployPhase
  if (!ph || !ph.active) return false
  const members = room.members || []
  if (!members.length) return false
  const allReady = members.every((m) => ph.ready && ph.ready[m.key])
  if (!allReady) return false
  ph.active = false
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  const { withBattleEnv } = require('../scenario/battleEnvironment')
  withBattleEnv(room, () => {
    const { syncBattleReconByFaction } = require('../recon/battleReconResolve')
    syncBattleReconByFaction(room, room.battleCells)
  })
  return true
}

function placeDeployUnit(room, mem, catalogUnitId, cellId) {
  const blocked = assertCanAct(room, mem)
  if (blocked) return { error: blocked }
  const ph = room.battleDeployPhase
  const team = Number(mem.team)
  if (!Number.isFinite(team) || team < 1) return { error: 'Нет команды' }
  if (!cellInTeamZone(ph, team, cellId)) return { error: 'Гекс вне зоны расстановки' }
  const rem = ph.remaining[mem.key]
  if (!rem) return { error: 'Нет пула расстановки' }
  const uid = Math.floor(Number(catalogUnitId))
  if (!takeOne(rem.unitIds, uid)) return { error: 'Этого юнита нет в пуле' }
  const cell = findCell(room.battleCells, cellId)
  if (!cell) {
    rem.unitIds.push(uid)
    return { error: 'Клетка не найдена' }
  }
  if (!Array.isArray(cell.units)) cell.units = []
  if (cell.units.length >= MAX_UNITS_PER_CELL) {
    rem.unitIds.push(uid)
    return { error: `Не больше ${MAX_UNITS_PER_CELL} юнитов на гекс` }
  }
  const instanceId = nextInstanceId(room.battleCells)
  const unit = {
    id: uid,
    instanceId,
    team,
    faction: factionForTeam(team),
    deployPlacedBy: mem.key,
  }
  cell.units.push(unit)
  ph.placed.push({ key: mem.key, kind: 'unit', cellId: Number(cell.id), instanceId })
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  return { ok: true, unit }
}

function removeDeployUnit(room, mem, instanceId) {
  const blocked = assertCanAct(room, mem)
  if (blocked) return { error: blocked }
  const ph = room.battleDeployPhase
  const iid = Number(instanceId)
  const rec = (ph.placed || []).find(
    (p) => p.kind === 'unit' && p.key === mem.key && Number(p.instanceId) === iid,
  )
  if (!rec) return { error: 'Можно убрать только своего юнита расстановки' }
  const cell = findCell(room.battleCells, rec.cellId)
  if (!cell || !Array.isArray(cell.units)) return { error: 'Юнит не найден' }
  const idx = cell.units.findIndex((u) => Number(u.instanceId) === iid)
  if (idx < 0) return { error: 'Юнит не найден' }
  const unit = cell.units[idx]
  const catalogId = Math.floor(Number(unit.id))
  cell.units.splice(idx, 1)
  ph.placed = ph.placed.filter((p) => p !== rec)
  if (Number.isFinite(catalogId) && catalogId > 0) {
    ph.remaining[mem.key].unitIds.push(catalogId)
  }
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  return { ok: true }
}

function applyFortification(cell, structureId, team) {
  const builds = ensureBuilds(cell.builds)
  const key = FORT_BUILD_KEY[structureId]
  if (!key) return { error: 'Неизвестное сооружение' }
  if (key === 'dot') {
    if (Number(builds.dot) > 0) return { error: 'На гексе уже есть ДОТ' }
    cell.builds = { ...builds, dot: 1, dotDef: 4, dotAmmo: 15 }
    return { ok: true }
  }
  if (key === 'storage') {
    if (Number(builds.storage) > 0) return { error: 'На гексе уже есть склад' }
    cell.builds = {
      ...builds,
      storage: 1,
      storageAmmo: 40,
      storageSmoke: 2,
      storageExplosives: 2,
      storageMines: 4,
    }
    return { ok: true }
  }
  if (key === 'mine') {
    if (Number(builds.mine) > 0) return { error: 'На гексе уже есть мина' }
    cell.builds = { ...builds, mine: 1, mineKind: 'infantry', mineTeam: team }
    return { ok: true }
  }
  if (key === 'wire') {
    cell.builds = { ...builds, wire: 1, wireEdges: Number(builds.wireEdges) | 1 }
    return { ok: true }
  }
  if (key === 'trench') {
    cell.builds = { ...builds, trench: 1, trenchEdges: Number(builds.trenchEdges) | 1 }
    return { ok: true }
  }
  if (key === 'antiTankBuild') {
    cell.builds = { ...builds, antiTankBuild: 1, antiTankEdges: Number(builds.antiTankEdges) | 1 }
    return { ok: true }
  }
  return { error: 'Сооружение нельзя поставить' }
}

function restoreFortification(cell, structureId, prevBuilds, prevMapBuilding) {
  if (structureId.startsWith('b:')) {
    if (prevMapBuilding) cell.mapBuilding = prevMapBuilding
    else delete cell.mapBuilding
    return
  }
  cell.builds = prevBuilds
}

function placeDeployStructure(room, mem, structureId, cellId, buildingInfo) {
  const blocked = assertCanAct(room, mem)
  if (blocked) return { error: blocked }
  const ph = room.battleDeployPhase
  const team = Number(mem.team)
  if (!Number.isFinite(team) || team < 1) return { error: 'Нет команды' }
  if (!cellInTeamZone(ph, team, cellId)) return { error: 'Гекс вне зоны расстановки' }
  const rem = ph.remaining[mem.key]
  if (!rem) return { error: 'Нет пула расстановки' }
  const sid = String(structureId || '').trim()
  if (!takeOne(rem.structureIds, sid)) return { error: 'Этого сооружения нет в пуле' }
  const cell = findCell(room.battleCells, cellId)
  if (!cell) {
    rem.structureIds.push(sid)
    return { error: 'Клетка не найдена' }
  }
  const prevBuilds = cell.builds ? JSON.parse(JSON.stringify(cell.builds)) : null
  const prevMapBuilding = cell.mapBuilding
    ? JSON.parse(JSON.stringify(cell.mapBuilding))
    : null
  if (sid.startsWith('b:')) {
    if (!buildingInfo || !buildingInfo.name) {
      rem.structureIds.push(sid)
      return { error: 'Сооружение не найдено в каталоге' }
    }
    cell.mapBuilding = {
      name: String(buildingInfo.name || ''),
      imagePath: String(buildingInfo.imagePath || ''),
    }
  } else {
    const applied = applyFortification(cell, sid, team)
    if (applied.error) {
      rem.structureIds.push(sid)
      return applied
    }
  }
  ph.placed.push({
    key: mem.key,
    kind: 'structure',
    cellId: Number(cell.id),
    structureId: sid,
    prevBuilds,
    prevMapBuilding,
  })
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  return { ok: true }
}

function removeDeployStructure(room, mem, cellId, structureId) {
  const blocked = assertCanAct(room, mem)
  if (blocked) return { error: blocked }
  const ph = room.battleDeployPhase
  const sid = String(structureId || '').trim()
  const cid = Number(cellId)
  const rec = (ph.placed || []).find(
    (p) =>
      p.kind === 'structure' &&
      p.key === mem.key &&
      Number(p.cellId) === cid &&
      String(p.structureId) === sid,
  )
  if (!rec) return { error: 'Можно убрать только своё сооружение расстановки' }
  const cell = findCell(room.battleCells, cid)
  if (!cell) return { error: 'Клетка не найдена' }
  restoreFortification(cell, sid, rec.prevBuilds, rec.prevMapBuilding)
  ph.placed = ph.placed.filter((p) => p !== rec)
  ph.remaining[mem.key].structureIds.push(sid)
  room.battleFieldRevision = (room.battleFieldRevision || 0) + 1
  return { ok: true }
}

function setDeployReady(room, mem, ready) {
  const ph = room.battleDeployPhase
  if (!ph || !ph.active) return { error: 'Фаза расстановки уже завершена' }
  if (!mem) return { error: 'Вы не в этой комнате' }
  ph.ready[mem.key] = Boolean(ready)
  const finished = finishIfAllReady(room)
  return { ok: true, finished }
}

module.exports = {
  loadDeploymentFromPayload,
  initBattleDeployPhase,
  publicBattleDeploy,
  placeDeployUnit,
  removeDeployUnit,
  placeDeployStructure,
  removeDeployStructure,
  setDeployReady,
  isEdgeCell,
  nextInstanceId,
}

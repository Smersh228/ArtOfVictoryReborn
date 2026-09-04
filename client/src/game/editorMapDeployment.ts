export type EditorDeployPool = {
  unitIds: number[]
  structureIds: string[]
}

export type EditorDeploymentState = {
  zones: Record<string, number[]>
  pools: Record<string, EditorDeployPool>
}

export const EMPTY_EDITOR_DEPLOYMENT: EditorDeploymentState = { zones: {}, pools: {} }

export type DeployZoneStyle = { fill: string; stroke: string }

const TEAM_ZONE_STYLE: Record<number, { idle: DeployZoneStyle; active: DeployZoneStyle }> = {
  1: {
    idle: { fill: 'rgba(196, 48, 43, 0.22)', stroke: 'rgba(196, 48, 43, 0.72)' },
    active: { fill: 'rgba(196, 48, 43, 0.52)', stroke: 'rgba(160, 28, 28, 0.98)' },
  },
  2: {
    idle: { fill: 'rgba(70, 90, 110, 0.22)', stroke: 'rgba(55, 70, 90, 0.72)' },
    active: { fill: 'rgba(70, 90, 110, 0.54)', stroke: 'rgba(40, 55, 75, 0.98)' },
  },
  3: {
    idle: { fill: 'rgba(210, 120, 40, 0.22)', stroke: 'rgba(180, 95, 25, 0.72)' },
    active: { fill: 'rgba(210, 120, 40, 0.54)', stroke: 'rgba(160, 80, 16, 0.98)' },
  },
  4: {
    idle: { fill: 'rgba(90, 110, 70, 0.22)', stroke: 'rgba(70, 90, 55, 0.72)' },
    active: { fill: 'rgba(90, 110, 70, 0.54)', stroke: 'rgba(55, 75, 40, 0.98)' },
  },
  5: {
    idle: { fill: 'rgba(160, 60, 90, 0.22)', stroke: 'rgba(130, 40, 70, 0.72)' },
    active: { fill: 'rgba(160, 60, 90, 0.54)', stroke: 'rgba(120, 30, 60, 0.98)' },
  },
  6: {
    idle: { fill: 'rgba(80, 80, 120, 0.22)', stroke: 'rgba(60, 60, 100, 0.72)' },
    active: { fill: 'rgba(80, 80, 120, 0.54)', stroke: 'rgba(50, 50, 90, 0.98)' },
  },
}

const FALLBACK_STYLE = TEAM_ZONE_STYLE[1]

export function deployZoneStyle(team: number, active: boolean): DeployZoneStyle {
  const pair = TEAM_ZONE_STYLE[team] ?? FALLBACK_STYLE
  return active ? pair.active : pair.idle
}

export function catalogBuildingStructureId(dbId: number): string {
  return `b:${dbId}`
}

function emptyPool(): EditorDeployPool {
  return { unitIds: [], structureIds: [] }
}

export const MAX_POOL_COPIES = 40

function asUniqueIntList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function asIntCopies(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0) continue
    out.push(n)
    if (out.length >= 400) break
  }
  return out
}

function asStringCopies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const s = String(item ?? '').trim()
    if (!s) continue
    out.push(s)
    if (out.length >= 400) break
  }
  return out
}

export function poolCopyCount(ids: readonly number[] | readonly string[], id: number | string): number {
  let n = 0
  for (const x of ids) if (x === id) n++
  return n
}

export function parseEditorDeployment(raw: unknown): EditorDeploymentState {
  if (!raw || typeof raw !== 'object') return { zones: {}, pools: {} }
  const o = raw as Record<string, unknown>
  const zones: Record<string, number[]> = {}
  const zonesRaw = o.zones
  if (zonesRaw && typeof zonesRaw === 'object') {
    for (const [k, v] of Object.entries(zonesRaw as Record<string, unknown>)) {
      const team = Math.floor(Number(k))
      if (!Number.isFinite(team) || team < 1) continue
      zones[String(team)] = asUniqueIntList(v)
    }
  }
  const pools: Record<string, EditorDeployPool> = {}
  const poolsRaw = o.pools
  if (poolsRaw && typeof poolsRaw === 'object') {
    for (const [k, v] of Object.entries(poolsRaw as Record<string, unknown>)) {
      const team = Math.floor(Number(k))
      if (!Number.isFinite(team) || team < 1) continue
      const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
      pools[String(team)] = {
        unitIds: asIntCopies(row.unitIds),
        structureIds: asStringCopies(row.structureIds),
      }
    }
  }
  return { zones, pools }
}

export function teamDeployPool(state: EditorDeploymentState, team: number): EditorDeployPool {
  return state.pools[String(team)] ?? emptyPool()
}

export function teamDeployZoneCount(state: EditorDeploymentState, team: number): number {
  return state.zones[String(team)]?.length ?? 0
}

export function toggleDeployZoneCell(
  state: EditorDeploymentState,
  team: number,
  cellId: number,
): EditorDeploymentState {
  const teamKey = String(team)
  const nextZones: Record<string, number[]> = {}
  for (const [k, ids] of Object.entries(state.zones)) {
    nextZones[k] = ids.filter((id) => id !== cellId)
  }
  const wasOnTeam = (state.zones[teamKey] ?? []).includes(cellId)
  if (!wasOnTeam) {
    nextZones[teamKey] = [...(nextZones[teamKey] ?? []), cellId]
  }
  return { ...state, zones: nextZones }
}

export function ensureDeployZoneCell(
  state: EditorDeploymentState,
  team: number,
  cellId: number,
): EditorDeploymentState {
  const teamKey = String(team)
  const already = (state.zones[teamKey] ?? []).includes(cellId)
  if (already) return state
  const nextZones: Record<string, number[]> = {}
  for (const [k, ids] of Object.entries(state.zones)) {
    nextZones[k] = ids.filter((id) => id !== cellId)
  }
  nextZones[teamKey] = [...(nextZones[teamKey] ?? []), cellId]
  return { ...state, zones: nextZones }
}

export function clearDeployZoneForTeam(state: EditorDeploymentState, team: number): EditorDeploymentState {
  const nextZones = { ...state.zones }
  delete nextZones[String(team)]
  return { ...state, zones: nextZones }
}

export function addPoolUnit(state: EditorDeploymentState, team: number, unitId: number): EditorDeploymentState {
  const key = String(team)
  const prev = teamDeployPool(state, team)
  if (poolCopyCount(prev.unitIds, unitId) >= MAX_POOL_COPIES) return state
  return { ...state, pools: { ...state.pools, [key]: { ...prev, unitIds: [...prev.unitIds, unitId] } } }
}

export function removePoolUnit(state: EditorDeploymentState, team: number, unitId: number): EditorDeploymentState {
  const key = String(team)
  const prev = teamDeployPool(state, team)
  const idx = prev.unitIds.lastIndexOf(unitId)
  if (idx < 0) return state
  const unitIds = prev.unitIds.slice()
  unitIds.splice(idx, 1)
  return { ...state, pools: { ...state.pools, [key]: { ...prev, unitIds } } }
}

export function addPoolStructure(
  state: EditorDeploymentState,
  team: number,
  structureId: string,
): EditorDeploymentState {
  const key = String(team)
  const prev = teamDeployPool(state, team)
  if (poolCopyCount(prev.structureIds, structureId) >= MAX_POOL_COPIES) return state
  return {
    ...state,
    pools: { ...state.pools, [key]: { ...prev, structureIds: [...prev.structureIds, structureId] } },
  }
}

export function removePoolStructure(
  state: EditorDeploymentState,
  team: number,
  structureId: string,
): EditorDeploymentState {
  const key = String(team)
  const prev = teamDeployPool(state, team)
  const idx = prev.structureIds.lastIndexOf(structureId)
  if (idx < 0) return state
  const structureIds = prev.structureIds.slice()
  structureIds.splice(idx, 1)
  return { ...state, pools: { ...state.pools, [key]: { ...prev, structureIds } } }
}

export function collectDeployZoneMarks(
  state: EditorDeploymentState,
  teamLimit: number,
): { cellId: number; team: number }[] {
  const out: { cellId: number; team: number }[] = []
  const cap = teamLimit === 4 || teamLimit === 6 ? teamLimit : 2
  for (let team = 1; team <= cap; team++) {
    for (const cellId of state.zones[String(team)] ?? []) {
      out.push({ cellId, team })
    }
  }
  return out
}

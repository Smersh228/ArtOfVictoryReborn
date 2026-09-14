import { padCargoSlots } from './editorMapTransportCargo'
import { normalizeUnitTeam, teamLimitCap } from './editorMapTeam'

export const MAX_REINFORCEMENT_WAVES = 16
export const MAX_REINFORCEMENT_UNITS = 40
export const MAX_REINFORCEMENT_HEXES = 40
export const REINFORCEMENT_UNITS_PER_HEX = 3

export function reinforcementWaveUnitCap(wave: { cellIds?: readonly number[] } | null | undefined): number {
  const hexes = Array.isArray(wave?.cellIds) ? wave.cellIds.length : 0
  if (hexes <= 0) return MAX_REINFORCEMENT_UNITS
  return Math.min(MAX_REINFORCEMENT_UNITS, hexes * REINFORCEMENT_UNITS_PER_HEX)
}

function clampWaveUnitsToHexCapacity(wave: ReinforcementWave): ReinforcementWave {
  const cargo = padCargoSlots(wave.unitCargo, wave.unitIds.length)
  const cap = reinforcementWaveUnitCap(wave)
  if (wave.unitIds.length <= cap) return { ...wave, unitCargo: cargo }
  return { ...wave, unitIds: wave.unitIds.slice(0, cap), unitCargo: cargo.slice(0, cap) }
}

export type ReinforcementWave = {
  id: string
  team: number
  arriveTurn: number
  unitIds: number[]
  /** Груз каждого отряда волны (параллельно unitIds): пехота/артиллерия в грузовике, 2+2 в поезде. */
  unitCargo: number[][]
  cellIds: number[]
}

export type MapReinforcementsState = {
  enabled: boolean
  waves: ReinforcementWave[]
}

export const DEFAULT_MAP_REINFORCEMENTS: MapReinforcementsState = {
  enabled: false,
  waves: [],
}

function asIntCopies(raw: unknown, max: number): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0) continue
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

function asUniqueIntList(raw: unknown, max: number): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

export function newReinforcementWaveId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `rf-${Date.now().toString(36)}-${rand}`
}

export function clampArriveTurn(raw: unknown): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(99, n)
}

export function createReinforcementWave(team: number, arriveTurn = 0): ReinforcementWave {
  return {
    id: newReinforcementWaveId(),
    team: Math.max(1, Math.floor(Number(team) || 1)),
    arriveTurn: clampArriveTurn(arriveTurn),
    unitIds: [],
    unitCargo: [],
    cellIds: [],
  }
}

export function clampReinforcementsToTeamLimit(
  state: MapReinforcementsState,
  teamLimit: unknown,
): MapReinforcementsState {
  const cap = teamLimitCap(teamLimit)
  let changed = false
  const waves = (state.waves || []).map((w) => {
    const team = normalizeUnitTeam(w.team, cap)
    if (team === w.team) return w
    changed = true
    return { ...w, team }
  })
  return changed ? { ...state, waves } : state
}

export function parseReinforcementsFromPayload(raw: unknown, teamLimit: unknown): MapReinforcementsState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const cap = teamLimitCap(teamLimit)
  const waves: ReinforcementWave[] = []
  const rawWaves = Array.isArray(o.waves) ? o.waves : []
  for (const item of rawWaves) {
    if (!item || typeof item !== 'object') continue
    const w = item as Record<string, unknown>
    const id = String(w.id || '').trim() || newReinforcementWaveId()
    const arriveTurnRaw = Math.floor(Number(w.arriveTurn))
    const unitIds = asIntCopies(w.unitIds, MAX_REINFORCEMENT_UNITS)
    waves.push(
      clampWaveUnitsToHexCapacity({
        id,
        team: normalizeUnitTeam(w.team, cap),
        arriveTurn: clampArriveTurn(arriveTurnRaw),
        unitIds,
        unitCargo: padCargoSlots(w.unitCargo, unitIds.length),
        cellIds: asUniqueIntList(w.cellIds, MAX_REINFORCEMENT_HEXES),
      }),
    )
    if (waves.length >= MAX_REINFORCEMENT_WAVES) break
  }
  return {
    enabled: o.enabled === true,
    waves,
  }
}

export function reinforcementsToPayload(state: MapReinforcementsState, teamLimit: unknown) {
  const next = clampReinforcementsToTeamLimit(state, teamLimit)
  return {
    enabled: Boolean(next.enabled),
    waves: next.waves.map((w) => {
      const clamped = clampWaveUnitsToHexCapacity({
        ...w,
        unitIds: asIntCopies(w.unitIds, MAX_REINFORCEMENT_UNITS),
        cellIds: asUniqueIntList(w.cellIds, MAX_REINFORCEMENT_HEXES),
      })
      return {
        id: clamped.id,
        team: clamped.team,
        arriveTurn: clamped.arriveTurn,
        unitIds: clamped.unitIds,
        unitCargo: clamped.unitCargo,
        cellIds: clamped.cellIds,
      }
    }),
  }
}

export function poolCopyCount(ids: readonly number[], id: number): number {
  let n = 0
  for (const x of ids) if (x === id) n++
  return n
}

export function addReinforcementUnit(
  state: MapReinforcementsState,
  waveId: string,
  unitId: number,
): MapReinforcementsState {
  const uid = Math.floor(Number(unitId))
  if (!Number.isFinite(uid) || uid <= 0) return state
  return {
    ...state,
    waves: state.waves.map((w) => {
      if (w.id !== waveId) return w
      if (w.unitIds.length >= reinforcementWaveUnitCap(w)) return w
      const unitCargo = padCargoSlots(w.unitCargo, w.unitIds.length)
      return { ...w, unitIds: [...w.unitIds, uid], unitCargo: [...unitCargo, []] }
    }),
  }
}

export function removeReinforcementUnit(
  state: MapReinforcementsState,
  waveId: string,
  unitId: number,
): MapReinforcementsState {
  const uid = Math.floor(Number(unitId))
  return {
    ...state,
    waves: state.waves.map((w) => {
      if (w.id !== waveId) return w
      const idx = w.unitIds.lastIndexOf(uid)
      if (idx < 0) return w
      const next = w.unitIds.slice()
      next.splice(idx, 1)
      const unitCargo = padCargoSlots(w.unitCargo, w.unitIds.length)
      unitCargo.splice(idx, 1)
      return { ...w, unitIds: next, unitCargo }
    }),
  }
}

export function setReinforcementUnitCargo(
  state: MapReinforcementsState,
  waveId: string,
  slotIndex: number,
  cargoIds: readonly number[],
): MapReinforcementsState {
  const idx = Math.floor(Number(slotIndex))
  if (!Number.isFinite(idx) || idx < 0) return state
  return {
    ...state,
    waves: state.waves.map((w) => {
      if (w.id !== waveId) return w
      if (idx >= w.unitIds.length) return w
      const unitCargo = padCargoSlots(w.unitCargo, w.unitIds.length)
      unitCargo[idx] = Array.from(cargoIds).filter((n) => Number.isFinite(n) && n > 0)
      return { ...w, unitCargo }
    }),
  }
}

export function toggleReinforcementHex(
  state: MapReinforcementsState,
  waveId: string,
  cellId: number,
): MapReinforcementsState {
  const cid = Math.floor(Number(cellId))
  if (!Number.isFinite(cid) || cid <= 0) return state
  return {
    ...state,
    waves: state.waves.map((w) => {
      if (w.id !== waveId) return w
      const has = w.cellIds.includes(cid)
      if (has) {
        return clampWaveUnitsToHexCapacity({ ...w, cellIds: w.cellIds.filter((id) => id !== cid) })
      }
      if (w.cellIds.length >= MAX_REINFORCEMENT_HEXES) return w
      return clampWaveUnitsToHexCapacity({ ...w, cellIds: [...w.cellIds, cid] })
    }),
  }
}

export function collectReinforcementMarks(
  state: MapReinforcementsState,
): { cellId: number; team: number }[] {
  if (!state.enabled) return []
  const out: { cellId: number; team: number }[] = []
  for (const wave of state.waves) {
    for (const cellId of wave.cellIds) out.push({ cellId, team: wave.team })
  }
  return out
}

import { apiBaseUrl } from './editorCatalog'

function mapsApiBase(): string {
  return apiBaseUrl()
}

function mapsUrl(path: string): string {
  const base = mapsApiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

function parseError(res: Response, text: string): string {
  const raw = (text || '').trim()
  try {
    const j = JSON.parse(raw) as { error?: string }
    if (j?.error) return j.error
  } catch {
  
  }
  if (raw.length > 220) return `${raw.slice(0, 217)}…`
  return raw || res.statusText
}

export const TEAM_LIMITS = [2, 4, 6] as const
export type TeamLimit = (typeof TEAM_LIMITS)[number]

export function normalizeTeamLimit(raw: unknown): TeamLimit {
  const n = Number(raw)
  return n === 4 || n === 6 ? n : 2
}

export type SavedMapListItem = {
  id: number
  name: string
  updatedAt?: string
  moderationStatus?: 'pending' | 'approved' | 'rejected'
  ownerUsername?: string | null
  canModerate?: boolean
  teamLimit?: number
}


export type MapWeatherSpec = {
  enabled?: boolean
  chance?: number | string
  duration?: number | string
}

export type MapEnvironment = {
  night?: boolean
  nightFromFirst?: boolean
  strongWind?: boolean | MapWeatherSpec
  fog?: boolean | MapWeatherSpec
  rain?: boolean | MapWeatherSpec
}

export type EditorMapPayloadLobby = {
  cells?: unknown[]
  conditions?: {
    allyTasks?: string
    axisTasks?: string
    maxTurns?: string
    environment?: MapEnvironment
    [key: string]: unknown
  }
  scenario?: {
    missionBrief?: string
    historyText?: string
    photos?: string[]
    teamLimit?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

function weatherLabel(name: string, raw: boolean | MapWeatherSpec | undefined): string | null {
  if (raw === true) return name
  if (raw && typeof raw === 'object' && raw.enabled) {
    const chance = Number(raw.chance)
    const duration = Number(raw.duration)
    const c = Number.isFinite(chance) ? Math.trunc(chance) : 30
    const d = Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 3
    return `${name} (${c}%, ${d} ход.)`
  }
  return null
}

export function mapEnvironmentLabels(environment?: MapEnvironment | null): string[] {
  if (!environment) return []
  const out: string[] = []
  if (environment.night) {
    out.push(environment.nightFromFirst === false ? 'Ночь/день со второго хода' : 'Ночь/день с первого хода')
  }
  const fog = weatherLabel('Туман', environment.fog)
  const rain = weatherLabel('Дождь', environment.rain)
  if (fog) out.push(fog)
  if (rain) out.push(rain)
  return out
}

export type SavedMapDetail = {
  id: number
  name: string
  payload: EditorMapPayloadLobby
  updatedAt?: string
}

export async function fetchSavedMapById(id: number): Promise<{ map: SavedMapDetail }> {
  const res = await fetch(mapsUrl(`/api/maps/${id}`), { credentials: 'include' })
  const text = await res.text()
  if (!res.ok) throw new Error(parseError(res, text))
  return JSON.parse(text) as { map: SavedMapDetail }
}

export async function fetchSavedMaps(opts?: { editorOnly?: boolean }): Promise<{ maps: SavedMapListItem[] }> {
  const q = opts?.editorOnly ? '?editor=1' : ''
  const res = await fetch(mapsUrl(`/api/maps${q}`), { credentials: 'include' })
  const text = await res.text()
  if (!res.ok) throw new Error(parseError(res, text))
  return JSON.parse(text) as { maps: SavedMapListItem[] }
}

export async function moderateSavedMap(
  mapId: number,
  action: 'approve' | 'reject',
): Promise<{ ok: true; id: number; moderationStatus: 'approved' | 'rejected' }> {
  const res = await fetch(mapsUrl(`/api/maps/${mapId}/moderate`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseError(res, text))
  return JSON.parse(text) as { ok: true; id: number; moderationStatus: 'approved' | 'rejected' }
}

export async function deleteSavedMap(mapId: number): Promise<{ ok: true }> {
  const res = await fetch(mapsUrl(`/api/maps/${mapId}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseError(res, text))
  return JSON.parse(text) as { ok: true }
}

export async function saveEditorMapToDb(body: {
  name: string
  payload: unknown
}): Promise<{ map: { id: number; name: string } }> {
  const res = await fetch(mapsUrl('/api/maps'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseError(res, text))
  return JSON.parse(text) as { map: { id: number; name: string } }
}

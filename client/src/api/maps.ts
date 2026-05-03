import { API_ORIGIN } from './editorCatalog'

function mapsApiBase(): string {
  const v = import.meta.env.VITE_API_ORIGIN as string | undefined
  if (v != null && String(v).trim() !== '') return String(v).replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  return API_ORIGIN.replace(/\/$/, '')
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

export type SavedMapListItem = {
  id: number
  name: string
  updatedAt?: string
  moderationStatus?: 'pending' | 'approved' | 'rejected'
  ownerUsername?: string | null
  canModerate?: boolean
}


export type EditorMapPayloadLobby = {
  cells?: unknown[]
  conditions?: {
    allyTasks?: string
    axisTasks?: string
    maxTurns?: string
    [key: string]: unknown
  }
  scenario?: {
    missionBrief?: string
    historyText?: string
    photos?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
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

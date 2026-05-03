export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000'


function editorApiBase(): string {
  const v = import.meta.env.VITE_API_ORIGIN as string | undefined
  if (v != null && String(v).trim() !== '') return String(v).replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  return String(API_ORIGIN).replace(/\/$/, '')
}


export function resolveEditorImageUrl(path: string | null | undefined): string | undefined {
  if (path == null || !String(path).trim()) return undefined
  const p = String(path).trim()
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  if (p.startsWith('/uploads/')) {
    const b = editorApiBase()
    return b ? `${b}${p}` : p
  }
  return p
}

export async function uploadEditorImage(file: File): Promise<{ path: string }> {
  const fd = new FormData()
  fd.append('image', file)
  const res = await fetch(`${editorApiBase()}/api/editor/upload`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = text || res.statusText
    try {
      const j = JSON.parse(text) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
     
    }
    throw new Error(msg)
  }
  return JSON.parse(text) as { path: string }
}

export type EditorCatalogResponse = {
  units: Array<{ id: number; name: string; type: string; faction: string; imagePath: string }>
  hexes: Array<{ id: string; type: string; name: string; imagePath: string }>
  buildings: Array<{ id: string; dbId: number; name: string; imagePath: string }>
  rules: Array<{ id: number; name: string; description: string; imagePath?: string; stats?: string[] }>
  unitsEditor: Array<Record<string, unknown>>
  hexesEditor: Array<Record<string, unknown>>
  buildingsEditor: Array<Record<string, unknown>>
  rulesEditor: Array<Record<string, unknown>>
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${editorApiBase()}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || res.statusText)
  }
  const ct = res.headers.get('content-type')
  if (ct && ct.includes('application/json')) return res.json()
  return null
}

export function fetchEditorCatalog(): Promise<EditorCatalogResponse> {
  return apiFetch('/api/editor/client/catalog')
}

export type EditorOrderRow = {
  id_orders: number
  name?: string | null
  code?: string | null
  order_key?: string | null
}

export async function fetchEditorOrders(): Promise<EditorOrderRow[]> {
  const res = await fetch(`${editorApiBase()}/api/editor/orders`, { credentials: 'include' })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || res.statusText)
  }
  return res.json() as Promise<EditorOrderRow[]>
}

export type EditorPropertyRow = {
  id_property: number
  name?: string | null
  prop_key?: string | null
}

export async function fetchEditorProperties(): Promise<EditorPropertyRow[]> {
  const res = await fetch(`${editorApiBase()}/api/editor/properties`, { credentials: 'include' })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || res.statusText)
  }
  return res.json() as Promise<EditorPropertyRow[]>
}

export function saveEditorUnit(body: Record<string, unknown>) {
  return apiFetch('/api/editor/units', { method: 'POST', body: JSON.stringify(body) })
}

export function saveEditorHex(body: Record<string, unknown>) {
  return apiFetch('/api/editor/hexes', { method: 'POST', body: JSON.stringify(body) })
}

export function saveEditorBuilding(body: Record<string, unknown>) {
  return apiFetch('/api/editor/buildings', { method: 'POST', body: JSON.stringify(body) })
}

export function saveEditorRule(body: Record<string, unknown>) {
  return apiFetch('/api/editor/rules', { method: 'POST', body: JSON.stringify(body) })
}

export function deleteEditorUnit(id: number) {
  return apiFetch(`/api/editor/units/${id}`, { method: 'DELETE' })
}

export function deleteEditorHex(id: number) {
  return apiFetch(`/api/editor/hexes/${id}`, { method: 'DELETE' })
}

export function deleteEditorRule(id: number) {
  return apiFetch(`/api/editor/rules/${id}`, { method: 'DELETE' })
}

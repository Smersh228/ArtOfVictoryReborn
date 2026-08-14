import { apiBaseUrl } from './editorCatalog'

export type RegisteredUserRow = {
  id: number
  username: string
  email: string
  createdAt?: string
  onAllowlist: boolean
  isAdmin: boolean
}

export type MaintenanceAllowlistEntry = {
  username: string
  addedAt?: string
}

export type MaintenanceState = {
  enabled: boolean
  allowlist: MaintenanceAllowlistEntry[]
  message: string
}

function adminUrl(path: string): string {
  const base = apiBaseUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}/api/admin/maintenance${p}` : `/api/admin/maintenance${p}`
}

function publicMaintenanceUrl(): string {
  const base = apiBaseUrl()
  return base ? `${base}/api/auth/maintenance-status` : '/api/auth/maintenance-status'
}

export async function fetchMaintenancePublicStatus(): Promise<{
  enabled: boolean
  message: string
}> {
  try {
    const res = await fetch(publicMaintenanceUrl(), { credentials: 'include' })
    const data = (await res.json()) as { enabled?: boolean; message?: string }
    return {
      enabled: data.enabled === true,
      message: String(data.message || 'Идут технические работы. Зайдите позже.'),
    }
  } catch {
    return { enabled: false, message: 'Идут технические работы. Зайдите позже.' }
  }
}

export async function fetchMaintenanceRegisteredUsers(): Promise<RegisteredUserRow[]> {
  const res = await fetch(adminUrl('/users'), { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || res.statusText))
  }
  if (!Array.isArray(data.users)) return []
  return data.users.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    username: String(row.username ?? ''),
    email: String(row.email ?? ''),
    createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
    onAllowlist: row.onAllowlist === true,
    isAdmin: row.isAdmin === true,
  }))
}

export async function fetchMaintenanceAdminState(): Promise<MaintenanceState> {
  const res = await fetch(adminUrl(''), { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || res.statusText))
  }
  return {
    enabled: data.enabled === true,
    allowlist: Array.isArray(data.allowlist) ? data.allowlist : [],
    message: String(data.message || 'Идут технические работы. Зайдите позже.'),
  }
}

export async function setMaintenanceEnabled(enabled: boolean): Promise<MaintenanceState> {
  const res = await fetch(adminUrl(''), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || res.statusText))
  }
  return {
    enabled: data.enabled === true,
    allowlist: Array.isArray(data.allowlist) ? data.allowlist : [],
    message: String(data.message || 'Идут технические работы. Зайдите позже.'),
  }
}

export async function addMaintenanceAllowlistUser(username: string): Promise<MaintenanceState> {
  const res = await fetch(adminUrl('/allowlist'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || res.statusText))
  }
  return {
    enabled: data.enabled === true,
    allowlist: Array.isArray(data.allowlist) ? data.allowlist : [],
    message: String(data.message || 'Идут технические работы. Зайдите позже.'),
  }
}

export async function removeMaintenanceAllowlistUser(username: string): Promise<MaintenanceState> {
  const enc = encodeURIComponent(username.trim())
  const res = await fetch(adminUrl(`/allowlist/${enc}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || res.statusText))
  }
  return {
    enabled: data.enabled === true,
    allowlist: Array.isArray(data.allowlist) ? data.allowlist : [],
    message: String(data.message || 'Идут технические работы. Зайдите позже.'),
  }
}

export function isMaintenanceApiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes('технические работы') || err.message.includes('503')
}

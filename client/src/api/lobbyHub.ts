import { apiBaseUrl } from './editorCatalog'

function lobbyHubUrl(path: string): string {
  const base = apiBaseUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}/api/lobby${p}` : `/api/lobby${p}`
}

export type LobbyChatMessage = {
  id: number
  userId: number
  username: string
  text: string
  ts: number
  system?: boolean
  highlight?: boolean
  roleKey?: LobbyRoleKey
}

export type LobbyHubState = {
  online: number
  inBattle: number
  messages: LobbyChatMessage[]
  muted: boolean
  roleKey: LobbyRoleKey
  onlineReal?: number
  onlineBoost?: number
}

export type LobbyPlayerKills = Record<string, number>

export type LobbyRoleKey = 'admin' | 'player' | 'moderator' | 'veteran' | 'veteran_moderator'

export type LobbyPlayerProfile = {
  id: number
  username: string
  createdAt: string | null
  online: boolean
  highlight: boolean
  role: string
  roleKey: LobbyRoleKey
  wins: number
  losses: number
  kills: LobbyPlayerKills
  avatarPath: string | null
  muted: boolean
  mutedUntil: number | null
  banned: boolean
  bannedUntil: number | null
}

export const ASSIGNABLE_ROLES: { key: Exclude<LobbyRoleKey, 'admin'>; label: string }[] = [
  { key: 'player', label: 'Игрок' },
  { key: 'moderator', label: 'Модератор' },
  { key: 'veteran', label: 'Ветеран' },
  { key: 'veteran_moderator', label: 'Ветеран-модератор' },
]

const ROLE_MARKS: Partial<Record<LobbyRoleKey, string>> = {
  admin: '♕',
  moderator: '⚖',
  veteran: '✭',
  veteran_moderator: '♗',
}

export function resolveLobbyRoleKey(roleKey?: string | null, highlight?: boolean): LobbyRoleKey {
  if (highlight || roleKey === 'admin') return 'admin'
  if (roleKey === 'moderator' || roleKey === 'veteran' || roleKey === 'veteran_moderator') return roleKey
  return 'player'
}

export function decorateLobbyNick(username: string, roleKey?: string | null, highlight?: boolean): string {
  const name = String(username || '')
  const mark = ROLE_MARKS[resolveLobbyRoleKey(roleKey, highlight)]
  return mark ? `${mark} ${name} ${mark}` : name
}

export function lobbyNickClass(roleKey?: string | null, highlight?: boolean): string {
  return `nick_${resolveLobbyRoleKey(roleKey, highlight)}`
}

export function canMutePlayers(roleKey?: string | null, highlight?: boolean): boolean {
  const k = resolveLobbyRoleKey(roleKey, highlight)
  return k === 'admin' || k === 'moderator' || k === 'veteran_moderator'
}

export function canBanPlayers(roleKey?: string | null, highlight?: boolean): boolean {
  return resolveLobbyRoleKey(roleKey, highlight) === 'admin'
}

export type LobbyModerationAction = 'mute' | 'unmute' | 'ban' | 'unban'

export const MUTE_DURATION_OPTIONS: { value: string; label: string; adminOnly?: boolean }[] = [
  { value: '10m', label: 'Мут на 10 мин' },
  { value: '1h', label: 'Мут на 1 час' },
  { value: '6h', label: 'Мут на 6 часов' },
  { value: '1d', label: 'Мут на 1 день' },
  { value: '7d', label: 'Мут на 7 дней' },
  { value: 'forever', label: 'Мут навсегда', adminOnly: true },
]

export const BAN_DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: '1d', label: 'Бан на 1 день' },
  { value: '7d', label: 'Бан на 7 дней' },
  { value: '30d', label: 'Бан на 30 дней' },
  { value: 'forever', label: 'Бан навсегда' },
]

export const UNIT_KILL_LABELS: { key: string; label: string }[] = [
  { key: 'infantry', label: 'Пехота' },
  { key: 'artillery', label: 'Артиллерия' },
  { key: 'tech', label: 'Техника' },
  { key: 'armor', label: 'Бронетехника' },
  { key: 'lighttank', label: 'Лёгкие танки' },
  { key: 'mediumtank', label: 'Средние танки' },
  { key: 'heavytank', label: 'Тяжёлые танки' },
  { key: 'lightair', label: 'Малая авиация' },
  { key: 'heavyair', label: 'Большая авиация' },
  { key: 'other', label: 'Сооружение' },
]

export function resolveLobbyAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const p = String(path).trim()
  if (!p) return undefined
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const base = apiBaseUrl()
  return base ? `${base}${p}` : p
}

export class LobbyHubError extends Error {
  state: LobbyHubState | null
  constructor(message: string, state: LobbyHubState | null = null) {
    super(message)
    this.state = state
  }
}

function parseState(data: Partial<LobbyHubState>): LobbyHubState {
  const onlineBoostRaw = Number(data.onlineBoost)
  const onlineRealRaw = Number(data.onlineReal)
  return {
    online: Number.isFinite(Number(data.online)) ? Number(data.online) : 0,
    inBattle: Number.isFinite(Number(data.inBattle)) ? Number(data.inBattle) : 0,
    messages: Array.isArray(data.messages) ? data.messages : [],
    muted: data.muted === true,
    roleKey: resolveLobbyRoleKey(data.roleKey),
    onlineBoost: Number.isFinite(onlineBoostRaw) ? Math.max(0, Math.floor(onlineBoostRaw)) : undefined,
    onlineReal: Number.isFinite(onlineRealRaw) ? Math.max(0, Math.floor(onlineRealRaw)) : undefined,
  }
}

async function readHub(res: Response): Promise<LobbyHubState> {
  const data = (await res.json()) as Partial<LobbyHubState> & { error?: string }
  const state = parseState(data)
  if (!res.ok) {
    throw new LobbyHubError(data.error || res.statusText || 'Ошибка лобби', state)
  }
  return state
}

export async function fetchLobbyState(): Promise<LobbyHubState> {
  const res = await fetch(lobbyHubUrl('/state'), { credentials: 'include' })
  return readHub(res)
}

export async function sendLobbyHeartbeat(): Promise<LobbyHubState> {
  const res = await fetch(lobbyHubUrl('/heartbeat'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  return readHub(res)
}

export function leaveLobbyPresence(): void {
  void fetch(lobbyHubUrl('/leave'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    keepalive: true,
  }).catch(() => undefined)
}

export async function sendLobbyChat(text: string): Promise<LobbyHubState> {
  const res = await fetch(lobbyHubUrl('/chat'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return readHub(res)
}

function parseProfile(raw: Partial<LobbyPlayerProfile> | undefined): LobbyPlayerProfile | null {
  if (!raw || raw.id == null) return null
  return {
    id: Number(raw.id),
    username: String(raw.username || ''),
    createdAt: raw.createdAt ?? null,
    online: raw.online === true,
    highlight: raw.highlight === true,
    role: String(raw.role || 'Игрок'),
    roleKey: resolveLobbyRoleKey(raw.roleKey, raw.highlight),
    wins: Number(raw.wins) || 0,
    losses: Number(raw.losses) || 0,
    kills: raw.kills && typeof raw.kills === 'object' ? raw.kills : {},
    avatarPath: raw.avatarPath ? String(raw.avatarPath) : null,
    muted: raw.muted === true,
    mutedUntil: raw.mutedUntil == null ? null : Number(raw.mutedUntil),
    banned: raw.banned === true,
    bannedUntil: raw.bannedUntil == null ? null : Number(raw.bannedUntil),
  }
}

export async function fetchLobbyProfile(userId: number): Promise<LobbyPlayerProfile> {
  const res = await fetch(lobbyHubUrl(`/profile/${userId}`), { credentials: 'include' })
  const data = (await res.json()) as { profile?: LobbyPlayerProfile; error?: string }
  const profile = parseProfile(data.profile)
  if (!res.ok || !profile) {
    throw new Error(data.error || 'Игрок не найден')
  }
  return profile
}

export async function moderateLobbyPlayer(
  userId: number,
  action: LobbyModerationAction,
  duration?: string,
): Promise<LobbyPlayerProfile> {
  const res = await fetch(lobbyHubUrl('/moderate'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, action, duration }),
  })
  const data = (await res.json()) as { profile?: LobbyPlayerProfile; error?: string }
  const profile = parseProfile(data.profile)
  if (!res.ok || !profile) {
    throw new Error(data.error || 'Не удалось выполнить действие')
  }
  return profile
}

export async function setLobbyPlayerRole(userId: number, role: Exclude<LobbyRoleKey, 'admin'>): Promise<LobbyPlayerProfile> {
  const res = await fetch(lobbyHubUrl('/role'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role }),
  })
  const data = (await res.json()) as { profile?: LobbyPlayerProfile; error?: string }
  const profile = parseProfile(data.profile)
  if (!res.ok || !profile) {
    throw new Error(data.error || 'Не удалось изменить роль')
  }
  return profile
}

export async function uploadLobbyAvatar(file: File): Promise<LobbyPlayerProfile> {
  const fd = new FormData()
  fd.append('image', file)
  const res = await fetch(lobbyHubUrl('/avatar'), {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const data = (await res.json()) as { profile?: LobbyPlayerProfile; error?: string }
  const profile = parseProfile(data.profile)
  if (!res.ok || !profile) {
    throw new Error(data.error || 'Не удалось загрузить аватар')
  }
  return profile
}

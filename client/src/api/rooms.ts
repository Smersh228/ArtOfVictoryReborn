import { apiBaseUrl } from './editorCatalog'
import type { SavedMapDetail } from './maps'

const CLIENT_ID_KEY = 'aot_network_client_id'


function roomsApiBase(): string {
  return apiBaseUrl()
}

function roomsUrl(path: string): string {
  const base = roomsApiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

export function getOrCreateClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id || id.length < 8) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return `guest-${Date.now()}`
  }
}

export type RoomPublic = {
  id: number
  name: string
  map: string
  mapId?: number | null
  maxPlayers: number
  players: number

  battleStartedAt?: number | null
}

export type LobbyFaction = 'none' | 'rkka' | 'wehrmacht'

export type RoomMember = {
  key: string
  label: string
  isYou: boolean
  isHost?: boolean
  faction: LobbyFaction
  team?: number | null
  ready: boolean
}

export type BattleOrderPayload = {
  unitInstanceId: number
  orderKey: string
  targetUnitInstanceId?: number
  targetCellId?: number
  /** Корректировка огня (только артиллерия, приказ «Огонь», 1 раз за ход на сторону) */
  useFireAdjustment?: boolean
  /** Реактивный огонь (таблица fireReactive вместо обычной интенсивности) */
  useReactiveFire?: boolean
  /** Прямая траектория полёта (точка вылета → назначение), id клеток по линии на гексе */
  flightPathCellIds?: number[]
  /** Бомбардировка: сосед цели — сторона захода ковровой бомбардировки */
  bombardmentDirectionCellId?: number
  /** Бомбардировка: гексы под удар (линия вперёд от цели) */
  bombardmentAreaCellIds?: number[]
  /** Патруль: радиус зоны патрулирования (шаги от центра, ≤ дальность видимости) */
  patrolRangeSteps?: number
  reconRangeSteps?: number
  transferAmmo?: number
  defendFacingCellId?: number
  defendMaxRangeSteps?: number
  /** Приказ «Окопаться»: сторона гекса 0–5 */
  trenchEdgeDir?: number
  /** Приказ «Снятие проволоки»: грань на своём гексе 0–5 */
  wireEdgeDir?: number
  /** Приказ «Минирование»: пехотная или танковая мина */
  mineKind?: 'infantry' | 'tank'
  /** Стрельба в движении: гекс, с которого производится выстрел */
  fireFromCellId?: number
}

export type BattleHqRevealedOrder = BattleOrderPayload & {
  unitName?: string
  cellId?: number
  orderLabel?: string
}

export type BattleHqRewriteState = {
  pending: boolean
  seq?: number
  youCanRewrite?: boolean
  rewriteMax?: number
  revealedOrders?: BattleHqRevealedOrder[]
  yourDraftOrders?: BattleOrderPayload[]
  hqUnitInstanceId?: number
  hqRoll?: number
}

export type BattleDeployPlaced = {
  kind: 'unit' | 'structure'
  cellId: number
  instanceId?: number
  structureId?: string
}

export type BattleDeployState = {
  active: boolean
  youReady?: boolean
  zoneCellIds?: number[]
  remaining?: {
    unitIds: number[]
    structureIds: string[]
  }
  membersReady?: { key: string; ready: boolean; isYou: boolean }[]
  yourPlaced?: BattleDeployPlaced[]
}

export type LobbyRoomChatChannel = 'all' | 'team'

export type LobbyRoomChatMessage = {
  id: number
  userId: number
  username: string
  text: string
  ts: number
  channel?: LobbyRoomChatChannel
  teamKey?: 'rkka' | 'wehrmacht' | null
}

export type RoomDetailResponse = {
  room: RoomPublic
  members: RoomMember[]
  youAreHost?: boolean
  lobbyChat?: LobbyRoomChatMessage[]
  battleEnvironment?: {
    nightEnabled?: boolean
    nightFromFirst?: boolean
    isNight?: boolean
    fogActive?: boolean
    rainActive?: boolean
    strongWindActive?: boolean
    visionPenalty?: number
    accuracyShift?: number
    intensityPenalty?: number
    labels?: string[]
  }
  battleStartedAt?: number | null

  battleSurrenderSeq?: number
  battleSurrenderBy?: string | null
  battleScenarioEndSeq?: number
  battleScenarioWinnerFaction?: 'rkka' | 'wehrmacht' | null
  battleScenarioReason?: 'objective' | 'timeout' | null
  battleTurnIndex?: number
  battleFieldRevision?: number
  battleTurnAckCount?: number
  battleTurnAckNeed?: number
  battleHqRewrite?: BattleHqRewriteState | null
  battleDeploy?: BattleDeployState | null
  battleCells?: unknown[]
  battleReconByFaction?: { rkka?: number[]; wehrmacht?: number[] }
  battleLog?: {
    phase?: number
    text?: string
    t?: number
    turn?: number
    meta?: {
      movePath?: number[]
      unitInstanceId?: number
      moveOrderKey?: string
      fireLine?: {
        attackerId: number
        targetId: number
        fromCellId: number
        targetCellId: number
        hits?: number
        damages?: number
        rollResults?: number[]
        warDef?: boolean
        isSuppression?: boolean
        baseDiceCount?: number
        diceCount?: number
        ammoCost?: number
        groupedFire?: boolean
        groupedAreaFire?: boolean
        shooterIds?: number[]
        areaTargets?: {
          targetId: number
          damages: number
          warDef?: boolean
          hits?: number
          misses?: number
          rollResults?: number[]
        }[]
      }
      attackLine?: {
        attackerId: number
        targetId: number
        fromCellId: number
        targetCellId: number
        hits?: number
        damages?: number
        rollResults?: number[]
      }
      mineLine?: {
        unitInstanceId: number
        cellId: number
        mineKind?: 'infantry' | 'tank'
        intensity?: number
        accuracy?: number
        hits?: number
        damages?: number
        rollResults?: number[]
        diceCount?: number
        reason?: string
      }
      logisticsLine?: {
        orderKey: 'getSup' | 'loadingSup' | 'loading' | 'tow' | 'unloading' | 'railLoading' | 'railUnloading'
        fromInstanceId?: number
        toInstanceId?: number
        amount?: number
        toCellId?: number
      }
      unitName?: string
      destroyedCellId?: number
      destroyed?: boolean
    }
  }[]
}

function roomHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'X-Client-Id': getOrCreateClientId(),
    ...extra,
  }
}

function parseRoomsError(res: Response, text: string): string {
  const raw = (text || '').trim()
  if (raw.startsWith('<!DOCTYPE') || raw.includes('<html')) {
    if (raw.includes('Cannot GET') && raw.includes('/api/rooms')) {
      return 'Не найден маршрут комнаты на сервере. Остановите и снова запустите API в папке server (npm start), затем обновите страницу.'
    }
    return `Сервер вернул страницу ошибки (${res.status}), а не данные комнаты. Проверьте, что backend запущен на порту 5000.`
  }
  try {
    const j = JSON.parse(raw) as { error?: string }
    if (j?.error) return j.error
  } catch {
  
  }
  if (raw.length > 220) return `${raw.slice(0, 217)}…`
  return raw || res.statusText
}

function parseRoomsJson<T>(text: string): T {
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) {
    throw new Error('Сервер вернул не JSON. Перезапустите backend (папка server) и убедитесь, что открыт маршрут GET /api/rooms/:id.')
  }
  return JSON.parse(t) as T
}

function asIntIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

function normalizeBattleDeploy(raw: RoomDetailResponse['battleDeploy']): BattleDeployState {
  if (!raw || !raw.active) return { active: false }
  return {
    active: true,
    youReady: Boolean(raw.youReady),
    zoneCellIds: asIntIdList(raw.zoneCellIds),
    remaining: {
      unitIds: asIntIdList(raw.remaining?.unitIds),
      structureIds: Array.isArray(raw.remaining?.structureIds)
        ? raw.remaining.structureIds.map((s) => String(s || '').trim()).filter(Boolean)
        : [],
    },
    membersReady: Array.isArray(raw.membersReady)
      ? raw.membersReady.map((m) => ({
          key: String(m?.key || ''),
          ready: Boolean(m?.ready),
          isYou: Boolean(m?.isYou),
        }))
      : [],
    yourPlaced: Array.isArray(raw.yourPlaced)
      ? raw.yourPlaced.map((p) => ({
          kind: p?.kind === 'structure' ? 'structure' : 'unit',
          cellId: Number(p?.cellId),
          instanceId: p?.instanceId != null ? Number(p.instanceId) : undefined,
          structureId: p?.structureId != null ? String(p.structureId) : undefined,
        }))
      : [],
  }
}

function normalizeRoomDetail(raw: RoomDetailResponse): RoomDetailResponse {
  return {
    ...raw,
    youAreHost: Boolean(raw.youAreHost),
    battleStartedAt: raw.battleStartedAt ?? null,
    battleSurrenderSeq: raw.battleSurrenderSeq ?? 0,
    battleSurrenderBy: raw.battleSurrenderBy ?? null,
    battleScenarioEndSeq: raw.battleScenarioEndSeq ?? 0,
    battleScenarioWinnerFaction: raw.battleScenarioWinnerFaction ?? null,
    battleScenarioReason: raw.battleScenarioReason ?? null,
    battleTurnIndex: raw.battleTurnIndex ?? 0,
    battleFieldRevision: raw.battleFieldRevision ?? 0,
    battleTurnAckCount: raw.battleTurnAckCount ?? 0,
    battleTurnAckNeed: raw.battleTurnAckNeed ?? 0,
    battleHqRewrite: raw.battleHqRewrite ?? null,
    battleDeploy: normalizeBattleDeploy(raw.battleDeploy),
    members: raw.members ?? [],
    lobbyChat: Array.isArray(raw.lobbyChat) ? raw.lobbyChat : [],
  }
}

export async function fetchRoomDetail(
  roomId: number,
  opts?: { battleTabVisible?: boolean },
): Promise<RoomDetailResponse> {
  const h = roomHeaders() as Record<string, string>
  if (typeof opts?.battleTabVisible === 'boolean') {
    h['X-Battle-Tab-Visible'] = opts.battleTabVisible ? '1' : '0'
  }
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}`), {
    credentials: 'include',
    headers: h,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}


export async function fetchRoomLobbyMap(roomId: number): Promise<{ map: SavedMapDetail | null }> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/lobby-map`), {
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  const j = parseRoomsJson(text) as { map: SavedMapDetail | null }
  return { map: j.map ?? null }
}

export async function fetchRoomsList(): Promise<{ rooms: RoomPublic[] }> {
  const res = await fetch(roomsUrl('/api/rooms'), {
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return parseRoomsJson(text)
}

export async function createRoom(body: {
  name: string
  maxPlayers: number
  map: string
  mapId?: number
}): Promise<{ room: RoomPublic }> {
  const res = await fetch(roomsUrl('/api/rooms'), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return parseRoomsJson(text)
}

export async function joinRoom(roomId: number): Promise<{ room: RoomPublic }> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/join`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return parseRoomsJson(text)
}

export async function spectateRoom(roomId: number): Promise<{ room: RoomPublic; spectator?: boolean }> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/spectate`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return parseRoomsJson(text)
}

export async function leaveRoom(roomId: number): Promise<void> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/leave`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
}

export async function updateLobbyMe(
  roomId: number,
  body: { toggleFaction?: boolean; toggleReady?: boolean; faction?: LobbyFaction; ready?: boolean },
): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/me`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}

export async function postRoomChat(
  roomId: number,
  text: string,
  channel: LobbyRoomChatChannel = 'all',
): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/chat`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text, channel }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, raw))
  return normalizeRoomDetail(parseRoomsJson(raw))
}

export async function startRoomBattle(roomId: number): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/start-battle`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}

export async function postBattleSurrender(roomId: number): Promise<void> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/surrender`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
}

export async function postBattleOrders(roomId: number, turn: number, orders: BattleOrderPayload[]): Promise<void> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/orders`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ turn, orders }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
}

export type BattleTurnReadyResponse = {
  ok: boolean
  battleTurnIndex?: number
  battleFieldRevision?: number
  waitingForOthers?: boolean
  battleHqRewrite?: BattleHqRewriteState | null
}

export async function postBattleTurnReady(roomId: number, turn: number): Promise<BattleTurnReadyResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/turn-ready`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ turn }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  try {
    return JSON.parse(text) as BattleTurnReadyResponse
  } catch {
    return { ok: true }
  }
}

export async function postBattleHqRewrite(
  roomId: number,
  turn: number,
  body: { skip?: boolean; orders?: BattleOrderPayload[] },
): Promise<BattleTurnReadyResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/hq-rewrite`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ turn, skip: body.skip, orders: body.orders }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  try {
    return JSON.parse(text) as BattleTurnReadyResponse
  } catch {
    return { ok: true }
  }
}

export async function postBattleDeployPlace(
  roomId: number,
  body:
    | { kind: 'unit'; catalogUnitId: number; cellId: number }
    | { kind: 'structure'; structureId: string; cellId: number },
): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/deploy-place`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}

export async function postBattleDeployRemove(
  roomId: number,
  body:
    | { kind: 'unit'; instanceId: number }
    | { kind: 'structure'; cellId: number; structureId: string },
): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/deploy-remove`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}

export async function postBattleDeployReady(
  roomId: number,
  ready: boolean,
): Promise<RoomDetailResponse> {
  const res = await fetch(roomsUrl(`/api/rooms/${roomId}/battle/deploy-ready`), {
    method: 'POST',
    credentials: 'include',
    headers: roomHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ready }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(parseRoomsError(res, text))
  return normalizeRoomDetail(parseRoomsJson(text))
}

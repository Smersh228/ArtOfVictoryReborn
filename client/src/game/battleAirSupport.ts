import type { Cell } from '../../../server/src/game/gameLogic/cells/cell'

import type { BattleOrderPayload, LobbyFaction } from '../api/rooms'
import { computeHexFlightPathCellIds } from './battleFlightPath'
import { hexDistCells, maxAirMissionHexStepsForUnit } from './battleFirePreview'
import { findUnitCellByInstanceId } from './battleMovePreview'
import { battleOrderLabelForKey } from './battleOrderIcons'
import { visibleCellIdsInRange } from './hexVisibility'
import { applyVisionPenalty } from './battleEnvironment'

/** Юниты малой/большой авиации на карте редактора не показываются на гексах боя — только в панели «Авиаподдержка». */
export function isBattleAirUnitType(type: unknown): boolean {
  const t = String(type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

/**
 * Приказы авиации, для которых на карте выбирается клетка назначения (прямая от точки вылета).
 * Совпадает с обработкой на сервере.
 */
export const AIR_ORDER_KEYS_NEED_HEX_TARGET = new Set<string>([
  'intelligenceAir',
  'airSupply',
  'attackAir',
  'bombardment',
  'desant',
  'patrol',
])

export function airOrderNeedsHexTarget(orderKey: string | null | undefined): boolean {
  const k = String(orderKey ?? '').trim()
  return k !== '' && AIR_ORDER_KEYS_NEED_HEX_TARGET.has(k)
}

/** Авиаприказ с траекторией на карте (в т.ч. сопровождение, перехват). */
export function airOrderHasFlightPreview(orderKey: string | null | undefined): boolean {
  const k = String(orderKey ?? '').trim()
  return k === 'accompaniment' || k === 'interception' || airOrderNeedsHexTarget(k)
}

/** Рисовать пунктирную траекторию на карте (перехват — только иконка на вылете). */
export function airOrderShowsFlightPathPreview(orderKey: string | null | undefined): boolean {
  return airOrderHasFlightPreview(orderKey) && String(orderKey ?? '').trim() !== 'interception'
}

function airOrderSupportsMissionHexPreview(orderKey: string): boolean {
  return airOrderNeedsHexTarget(orderKey) || orderKey === 'interception'
}

/** Гекс вылета цели перехвата (вражеский аэродром), не перехватчика и не точка встречи. */
export function readAirInterceptionTargetDepartureCellId(
  cells: Cell[],
  targetUnitInstanceId: number | null | undefined,
): number | null {
  if (targetUnitInstanceId == null || !Number.isFinite(Number(targetUnitInstanceId))) return null
  const live = findUnitCellByInstanceId(cells, Number(targetUnitInstanceId))
  const targetUnit = live?.unit as Record<string, unknown> | undefined
  if (!targetUnit) return null
  const sortie = (targetUnit.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  const dep = Number(sortie?.departureCellId)
  if (Number.isFinite(dep)) return dep
  const path = readFlightPathCellIdsFromUnit(targetUnit)
  if (path.length > 0 && Number.isFinite(path[0])) return path[0]
  return live.cell?.id != null && Number.isFinite(Number(live.cell.id)) ? Number(live.cell.id) : null
}

/** Клетка, на которой рисуется иконка авиаприказа на карте (превью при hover). */
export function readAirMissionPreviewDecalCellId(
  orderKey: string,
  pathCells: Cell[],
  missionTargetCellId: number,
  unit?: Record<string, unknown> | null,
  cells?: Cell[],
  interceptionTargetInstanceId?: number | null,
): number {
  if (String(orderKey).trim() === 'interception') {
    const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
      | Record<string, unknown>
      | undefined
    const tidRaw =
      interceptionTargetInstanceId != null && Number.isFinite(Number(interceptionTargetInstanceId))
        ? Number(interceptionTargetInstanceId)
        : Number(sortie?.interceptionTargetId)
    if (cells && Number.isFinite(tidRaw)) {
      const targetDep = readAirInterceptionTargetDepartureCellId(cells, tidRaw)
      if (targetDep != null) return targetDep
    }
    return missionTargetCellId
  }
  return missionTargetCellId
}

/** Дальность видимости юнита (как на сервере в `battleUnitVision.js`). */
export function readBattleVisionRange(unit: Record<string, unknown>): number {
  const tac = unit.tactical as Record<string, unknown> | undefined
  if (tac?.fireSuppression === true) return applyVisionPenalty(1)
  if (tac?.meleeOpponentInstanceId != null && Number.isFinite(Number(tac.meleeOpponentInstanceId))) {
    return applyVisionPenalty(1)
  }
  for (const k of ['visibleRange', 'vis', 'visible']) {
    const v = unit[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return applyVisionPenalty(v)
    if (v != null && String(v).trim() !== '') {
      const n = Number(String(v).split(/[/,]/)[0].trim())
      if (Number.isFinite(n) && n > 0) return applyVisionPenalty(n)
    }
  }
  return applyVisionPenalty(6)
}

function parseReconRangeCsv(raw: unknown): number[] {
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw)
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n));
}

export function readReconRingStepsFromUnit(
  unit: Record<string, unknown> | null | undefined,
  orderKey: string,
): number {
  const k = String(orderKey || '').trim();
  let raw: unknown;
  if (k === 'intelligenceAir') raw = unit?.intelligenceAirRange ?? unit?.intelligence_air_range;
  else if (k === 'razvedka') raw = unit?.razvedkaRange ?? unit?.razvedka_range;
  else if (k === 'svzy') raw = unit?.svzyRange ?? unit?.svzy_range;
  else raw = unit?.intelligenceAirRange ?? unit?.intelligence_air_range;
  const nums = parseReconRangeCsv(raw);
  return nums.length ? nums.length : 3;
}

/** Наземная разведка/перехват: зона dist ≤ выбранного радиуса (колонки таблицы = макс. R). */
export function computeGroundReconRadiusCellIds(centerCell: Cell, radiusSteps: number, cells: Cell[]): number[] {
  const R = Math.max(1, Math.floor(Number(radiusSteps) || 1))
  const out: number[] = []
  for (const c of cells) {
    if (hexDistCells(centerCell, c) <= R) out.push(c.id)
  }
  return out
}

/** Клетки зоны разведки: 1-е «кольцо» — точка приказа, далее до (N−1) гексов вокруг (N = число колонок). */
export function computeReconZoneCellIds(centerCell: Cell, maxRingSteps: number, cells: Cell[]): number[] {
  const rings = Math.max(1, Math.floor(maxRingSteps));
  const maxHexDist = Math.max(0, rings - 1);
  const out = [centerCell.id];
  if (maxHexDist < 1) return out;
  for (const c of cells) {
    if (c.id === centerCell.id) continue;
    const d = hexDistCells(centerCell, c);
    if (d >= 1 && d <= maxHexDist) out.push(c.id);
  }
  return out;
}

export function readIntelligenceAirCenterCellIdFromUnit(unit: Record<string, unknown> | null | undefined): number | null {
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  if (!tac || typeof tac !== 'object') return null;
  const sortie = tac.airSortie as Record<string, unknown> | undefined;
  const sortiePhase = String(sortie?.phase ?? '').trim();
  const missionKey = String(tac.airMissionOrderKey ?? sortie?.activeOrderKey ?? '').trim();
  if (sortiePhase === 'cooldown' || missionKey === 'airReturn') return null;

  const intelId = Number(tac.intelligenceAirTargetCellId);
  if (Number.isFinite(intelId)) return intelId;

  if (sortiePhase === 'patrol' && missionKey === 'intelligenceAir') {
    const patrolTgt = Number(tac.airMissionTargetCellId);
    if (Number.isFinite(patrolTgt)) return patrolTgt;
  }

  const stored = Number(sortie?.reconCenterCellId);
  return Number.isFinite(stored) ? stored : null;
}

/** Клетки, видимые с точки патрулирования в заданном (или макс.) радиусе видимости. */
export function computePatrolVisibilityCellIds(
  patrolCell: Cell,
  unit: Record<string, unknown>,
  cells: Cell[],
  rangeOverride?: number,
): number[] {
  const maxR = readBattleVisionRange(unit)
  const range =
    rangeOverride != null && Number.isFinite(rangeOverride)
      ? Math.max(1, Math.min(maxR, Math.floor(rangeOverride)))
      : maxR
  return Array.from(visibleCellIdsInRange(patrolCell, range, cells))
}

function hexDistCellsLocal(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  )
}

/** Клетки, на которых курсором задаётся радиус патруля (1…maxRange от центра). */
export function computePatrolRangePickCellIds(
  centerCell: Cell,
  maxRange: number,
  cells: Cell[],
): number[] {
  const cap = Math.max(1, maxRange)
  const out: number[] = []
  for (const c of cells) {
    if (c.id === centerCell.id) continue
    const d = hexDistCellsLocal(centerCell, c)
    if (d >= 1 && d <= cap) out.push(c.id)
  }
  return out
}

function splitCsvSegments(raw: unknown): string[] {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean)
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Макс. гексов за один заход бомбардировки — число ячеек в таблице реактивной дальности (`fireReactive.range`). */
export function readBombardmentMaxHexesPerPass(unit: Record<string, unknown>): number {
  const reactive = unit.fireReactive as Record<string, unknown> | undefined
  const reactiveSegs = splitCsvSegments(reactive?.range)
  if (reactiveSegs.length > 0) return reactiveSegs.length

  const fp = unit.fireParsed as { range?: number[] } | undefined
  if (fp?.range?.length) return fp.range.length

  const fire = unit.fire as Record<string, unknown> | undefined
  const stdSegs = splitCsvSegments(fire?.range)
  if (stdSegs.length > 0) return stdSegs.length

  return 1
}

const AXIAL_NEIGHBOR_DIRS = [
  { dq: 1, dr: 0 },
  { dq: -1, dr: 0 },
  { dq: 0, dr: 1 },
  { dq: 0, dr: -1 },
  { dq: 1, dr: -1 },
  { dq: -1, dr: 1 },
] as const

function findCellAtAxial(cells: Cell[], q: number, r: number): Cell | undefined {
  return cells.find((c) => c.coor.x === q && c.coor.z === r)
}

function neighborCellsOf(cells: Cell[], center: Cell): Cell[] {
  const out: Cell[] = []
  for (const { dq, dr } of AXIAL_NEIGHBOR_DIRS) {
    const n = findCellAtAxial(cells, center.coor.x + dq, center.coor.z + dr)
    if (n) out.push(n)
  }
  return out
}

/** Соседние гексы цели — выбор направления ковровой бомбардировки «вперёд» (без гекса захода по траектории). */
export function computeBombardmentDirectionPickCellIds(
  targetCell: Cell,
  cells: Cell[],
  excludeCellId: number | null = null,
): number[] {
  return neighborCellsOf(cells, targetCell)
    .filter((c) => excludeCellId == null || c.id !== excludeCellId)
    .map((c) => c.id)
}

function stepHexAlongLine(prev: Cell, cur: Cell, cells: Cell[]): Cell | undefined {
  const dq = cur.coor.x - prev.coor.x
  const dr = cur.coor.z - prev.coor.z
  const dy = cur.coor.y - prev.coor.y
  return cells.find(
    (c) => c.coor.x === cur.coor.x + dq && c.coor.z === cur.coor.z + dr && c.coor.y === cur.coor.y + dy,
  )
}

function isNeighborCell(a: Cell, b: Cell): boolean {
  const dx = Math.abs(a.coor.x - b.coor.x)
  const dy = Math.abs(a.coor.y - b.coor.y)
  const dz = Math.abs(a.coor.z - b.coor.z)
  return Math.max(dx, dy, dz) === 1
}

/**
 * Ковровая бомбардировка: линия из maxHexes гексов от цели «вперёд» по выбранному направлению.
 * directionToCell — сосед цели, куда указывает полоса бомбардировки.
 */
export function computeBombardmentAreaCellIds(
  targetCell: Cell,
  unit: Record<string, unknown>,
  cells: Cell[],
  directionToCell: Cell | null = null,
): number[] {
  const maxHexes = Math.max(1, readBombardmentMaxHexesPerPass(unit))
  if (!directionToCell || directionToCell.id === targetCell.id || !isNeighborCell(targetCell, directionToCell)) {
    return [targetCell.id]
  }

  const ids: number[] = [targetCell.id]
  let prev = targetCell
  let cur = directionToCell
  ids.push(directionToCell.id)

  while (ids.length < maxHexes) {
    const next = stepHexAlongLine(prev, cur, cells)
    if (!next) break
    ids.push(next.id)
    prev = cur
    cur = next
  }
  return ids
}

/** Гекс захода по траектории полёта — предпоследний на пути к цели бомбардировки. */
export function readBombardmentApproachCellId(flightPathCellIds: number[] | null | undefined): number | null {
  if (!flightPathCellIds || flightPathCellIds.length < 2) return null
  const id = Number(flightPathCellIds[flightPathCellIds.length - 2])
  return Number.isFinite(id) ? id : null
}

/**
 * Данные выполненного/принятого авиаприказа с целевым гексом, сохранённые в `unit.tactical` на сервере.
 */
export function readAirMissionHexPreviewFromUnit(
  unit: Record<string, unknown> | null | undefined,
  cells: Cell[],
): { pathCells: Cell[]; targetCellId: number; orderKey: string } | null {
  const tac = unit?.tactical as Record<string, unknown> | undefined
  if (!tac || typeof tac !== 'object') return null

  let orderKey = String(tac.airMissionOrderKey ?? '').trim()
  let targetRaw: unknown = tac.airMissionTargetCellId
  let pathRaw: unknown = tac.airMissionFlightPath

  const sortie = tac.airSortie as Record<string, unknown> | undefined
  const sortiePhase = String(sortie?.phase ?? '').trim()

  // Возвращение / перезарядка — не показываем выполненную миссию (в т.ч. разведку).
  if (orderKey === 'airReturn' || sortiePhase === 'cooldown') return null

  if (!airOrderSupportsMissionHexPreview(orderKey) && sortiePhase === 'patrol') {
    const intelPath = tac.intelligenceAirFlightPath
    const intelTgt = tac.intelligenceAirTargetCellId
    if (Array.isArray(intelPath) && intelPath.length && intelTgt != null) {
      orderKey = 'intelligenceAir'
      targetRaw = intelTgt
      pathRaw = intelPath
    }
  }

  if (!airOrderSupportsMissionHexPreview(orderKey)) return null

  const targetCellId = Number(targetRaw)
  if (!Number.isFinite(targetCellId)) return null

  const pathIds = Array.isArray(pathRaw) ? pathRaw : null
  if (!pathIds?.length) return null

  const pathCells: Cell[] = []
  for (const cid of pathIds) {
    const c = cells.find((x) => x.id === Number(cid))
    if (!c) return null
    pathCells.push(c)
  }
  return {
    pathCells: orderKey === 'interception' ? [] : pathCells,
    targetCellId: readAirMissionPreviewDecalCellId(
      orderKey,
      pathCells,
      targetCellId,
      unit,
      cells,
      orderKey === 'interception' ? Number(sortie?.interceptionTargetId) : undefined,
    ),
    orderKey,
  }
}

/** Приказы с траекторией полёта, которые можно сопровождать. */
export const AIR_MISSION_ORDER_KEYS_ESCORTABLE = new Set<string>([
  'intelligenceAir',
  'airSupply',
  'attackAir',
  'bombardment',
  'desant',
  'interception',
  'patrol',
])

export type AccompanimentEscortCandidate = {
  unitInstanceId: number
  unitName: string
  orderKey: string
  orderLabel: string
  targetCellId: number
  flightPathCellIds: number[]
}

function sameBattleFaction(a: unknown, b: unknown): boolean {
  const fa = String(a ?? '').trim().toLowerCase()
  const fb = String(b ?? '').trim().toLowerCase()
  return fa !== '' && fa === fb
}

/** Дружественная авиация с уже назначенным авиаприказом (кандидаты для сопровождения). */
export function listAccompanimentEscortCandidates(
  escorterInstanceId: number,
  escorterFaction: unknown,
  pendingOrders: BattleOrderPayload[],
  cells: Cell[],
): AccompanimentEscortCandidate[] {
  const escorterLive = findUnitCellByInstanceId(cells, escorterInstanceId)
  if (!escorterLive) return []

  const out: AccompanimentEscortCandidate[] = []
  const seen = new Set<number>()

  for (const po of pendingOrders) {
    const uid = Number(po.unitInstanceId)
    if (!Number.isFinite(uid) || uid === escorterInstanceId || seen.has(uid)) continue
    const ok = String(po.orderKey ?? '').trim()
    if (!AIR_MISSION_ORDER_KEYS_ESCORTABLE.has(ok)) continue
    if (po.targetCellId == null || !Array.isArray(po.flightPathCellIds) || po.flightPathCellIds.length < 2) {
      continue
    }

    const live = findUnitCellByInstanceId(cells, uid)
    if (!live || !isBattleAirUnitType(live.unit.type)) continue
    if (!sameBattleFaction(live.unit.faction, escorterFaction)) continue

    const targetCellId = Number(po.targetCellId)
    if (!Number.isFinite(targetCellId)) continue
    const targetCell = cells.find((c) => c.id === targetCellId)
    if (!targetCell) continue

    const maxD = maxAirMissionHexStepsForUnit(escorterLive.unit as Record<string, unknown>)
    const dist = hexDistCells(escorterLive.cell, targetCell)
    if (dist < 1 || dist > maxD) continue

    const pathIds = computeHexFlightPathCellIds(cells, escorterLive.cell, targetCell)
    if (!pathIds?.length) continue

    seen.add(uid)
    const name = String(live.unit.name ?? '').trim() || `Юнит ${uid}`
    out.push({
      unitInstanceId: uid,
      unitName: name,
      orderKey: ok,
      orderLabel: battleOrderLabelForKey(ok),
      targetCellId,
      flightPathCellIds: pathIds,
    })
  }

  out.sort((a, b) => a.unitName.localeCompare(b.unitName, 'ru'))
  return out
}

export function buildAccompanimentOrderPayload(
  escorterInstanceId: number,
  candidate: AccompanimentEscortCandidate,
  cells: Cell[],
): BattleOrderPayload | null {
  const live = findUnitCellByInstanceId(cells, escorterInstanceId)
  if (!live) return null
  const target = cells.find((c) => c.id === candidate.targetCellId)
  if (!target) return null
  const pathIds = computeHexFlightPathCellIds(cells, live.cell, target)
  if (!pathIds?.length) return null
  return {
    unitInstanceId: escorterInstanceId,
    orderKey: 'accompaniment',
    targetUnitInstanceId: candidate.unitInstanceId,
    targetCellId: candidate.targetCellId,
    flightPathCellIds: pathIds,
  }
}

/** Юниты, которые рисуются на гексе в режиме боя (без авиации и без гарнизона ДОТ). */
export function battleUnitsVisibleOnMap(
  cell: Cell,
  mode: 'editor' | 'battle',
  extraHiddenInstanceIds?: ReadonlySet<number> | null,
): NonNullable<Cell['units']> {
  const raw = cell.units
  if (!raw?.length) return [] as unknown as NonNullable<Cell['units']>
  if (mode !== 'battle') return raw
  return raw.filter((u) => {
    const rec = u as { type?: unknown; instanceId?: unknown; tactical?: { inDot?: boolean } }
    if (isBattleAirUnitType(rec.type)) return false
    if (rec.tactical?.inDot === true) return false
    const iid = Number(rec.instanceId)
    if (extraHiddenInstanceIds && Number.isFinite(iid) && extraHiddenInstanceIds.has(iid)) return false
    return true
  }) as NonNullable<Cell['units']>
}

export type BattleAirSupportUnitRow = {
  instanceId: number
  name: string
  type: string
  faction: string
  imagePath: string
  cellId: number
}

export function collectAirSupportUnitsFromCells(cells: Cell[]): BattleAirSupportUnitRow[] {
  const out: BattleAirSupportUnitRow[] = []
  for (const cell of cells) {
    for (const u of cell.units || []) {
      const raw = u as Record<string, unknown>
      if (!isBattleAirUnitType(raw.type)) continue
      const instanceId = Number(raw.instanceId)
      if (!Number.isFinite(instanceId)) continue
      out.push({
        instanceId,
        name: typeof raw.name === 'string' ? raw.name : '',
        type: String(raw.type ?? ''),
        faction: typeof raw.faction === 'string' ? raw.faction : '',
        imagePath: typeof raw.imagePath === 'string' ? raw.imagePath : '',
        cellId: cell.id,
      })
    }
  }
  out.sort((a, b) => a.instanceId - b.instanceId)
  return out
}

import { getCarriedUnitsFromTruck } from './battleLogisticsUi';

export function unitHasDesantOrder(unit: Record<string, unknown> | null | undefined): boolean {
  if (!unit) return false;
  const orders = unit.orders;
  if (!Array.isArray(orders)) return false;
  for (const o of orders) {
    if (o && typeof o === 'object' && String((o as { order_key?: string }).order_key || '').trim() === 'desant') {
      return true;
    }
  }
  return false;
}

export function formatBattleAirDesantLine(unit: Record<string, unknown>): string | null {
  if (!unitHasDesantOrder(unit)) return null;
  const carried = getCarriedUnitsFromTruck(unit);
  if (!carried.length) return 'Нет';
  return carried
    .map((c) => String(c.name ?? '—'))
    .join('; ');
}

/** Готовность авиации к работе с приказами (панель «Авиаподдержка»). */
export type AirSupportReadinessStatus =
  | 'airborne'
  | 'onMission'
  | 'landing'
  | 'refueling'
  | 'loadingAmmo'
  | 'ready'

export const AIR_SUPPORT_READINESS_LABELS: Record<AirSupportReadinessStatus, string> = {
  airborne: 'Вылетел',
  onMission: 'На задании',
  landing: 'Посадка',
  refueling: 'Заправка топливом',
  loadingAmmo: 'Загрузка боеприпасов',
  ready: 'Готовность к вылету',
}

/** Индекс прогресса по маршруту (−1 = ещё на аэродроме после приказа). */
export function readAirEffectivePathIndex(
  unit: Record<string, unknown> | null | undefined,
  path?: number[],
): number {
  const route = path ?? readFlightPathCellIdsFromUnit(unit)
  const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  if (!sortie || typeof sortie !== 'object') return -1
  const phase = String(sortie.phase ?? '').trim()
  if (phase === 'patrol') return Math.max(0, route.length - 1)
  if (phase === 'inbound') {
    const idx = Number(sortie.pathIndex)
    return Number.isFinite(idx) ? idx : -1
  }
  return -1
}

export function hasAirUnitReachedFlightPathEnd(unit: Record<string, unknown> | null | undefined): boolean {
  const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  if (!sortie || String(sortie.phase ?? '') !== 'inbound') return false
  const stage = String(sortie.inboundStage ?? '').trim()
  if (stage === 'ordered' || stage === 'airborne') return false
  const path = readFlightPathCellIdsFromUnit(unit)
  if (!path.length) return false
  return readAirEffectivePathIndex(unit, path) >= path.length - 1
}

/** Самолёт в небе у края карты (подлёт), ещё не на задании. */
export function isAirUnitInboundInSky(unit: Record<string, unknown> | null | undefined): boolean {
  const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  if (!sortie || String(sortie.phase ?? '') !== 'inbound') return false
  const stage = String(sortie.inboundStage ?? '').trim()
  if (stage === 'airborne') return true
  if (stage === 'ordered') return false
  const path = readFlightPathCellIdsFromUnit(unit)
  if (!path.length) return false
  const pathIndex = readAirEffectivePathIndex(unit, path)
  if (pathIndex < 0) return false
  return pathIndex < path.length - 1
}

/** «В небе» на ходу orderTurn+1: учитывает inboundStage и номер текущего хода. */
export function isAirUnitInboundInSkyForTurn(
  unit: Record<string, unknown> | null | undefined,
  battleTurnIndex?: number,
): boolean {
  if (isAirUnitInboundInSky(unit)) return true
  const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  if (!sortie || String(sortie.phase ?? '') !== 'inbound') return false
  if (String(sortie.inboundStage ?? '').trim() !== 'ordered') return false
  const orderTurn = Number(sortie.inboundOrderTurn)
  const turn = Number(battleTurnIndex)
  return Number.isFinite(orderTurn) && Number.isFinite(turn) && turn === orderTurn + 1
}

export function readAirSupportReadinessFromUnit(
  unit: Record<string, unknown> | null | undefined,
  battleTurnIndex?: number,
): AirSupportReadinessStatus {
  const tac = unit?.tactical as { airSortie?: Record<string, unknown>; airCombat?: unknown } | undefined
  if (tac?.airCombat) return 'onMission'
  const s = tac?.airSortie
  if (!s || typeof s !== 'object') return 'ready'
  const phase = String(s.phase ?? '').trim()
  if (phase === 'inbound') {
    const stage = String(s.inboundStage ?? '').trim()
    if (stage === 'ordered') {
      if (isAirUnitInboundInSkyForTurn(unit, battleTurnIndex)) return 'airborne'
      return 'ready'
    }
    return isAirUnitInboundInSky(unit) ? 'airborne' : 'onMission'
  }
  if (phase === 'patrol') return 'onMission'
  if (phase === 'desant') return 'onMission'
  if (phase === 'cooldown') {
    const left = Number(s.cooldownTurnsLeft)
    if (!Number.isFinite(left) || left <= 0) return 'ready'
    const max = Number(s.cooldownTurnsMax)
    const firedWeapons = s.firedWeapons === true
    const stageCount = firedWeapons ? 3 : 2
    const effectiveMax =
      Number.isFinite(max) && max > 0 ? (firedWeapons ? max : Math.min(max, stageCount)) : stageCount
    if (left >= effectiveMax) return 'landing'
    if (left >= effectiveMax - 1) return 'refueling'
    if (firedWeapons) return 'loadingAmmo'
    return 'ready'
  }
  return 'ready'
}

/** Самолёт завершил миссию и возвращается / на перезарядке — не показывать зону разведки. */
export function isUnitOnAirReturnOrCooldown(unit: Record<string, unknown> | null | undefined): boolean {
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  if (!tac || typeof tac !== 'object') return false;
  const sortie = tac.airSortie as Record<string, unknown> | undefined;
  const phase = String(sortie?.phase ?? '').trim();
  if (phase === 'cooldown') return true;
  return String(tac.airMissionOrderKey ?? '').trim() === 'airReturn';
}

/** Самолёт на активной миссии «Патрулирование» (не возврат / не КД). */
export function isUnitOnAirPatrol(unit: Record<string, unknown> | null | undefined): boolean {
  if (isUnitOnAirReturnOrCooldown(unit)) return false;
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  if (!tac || typeof tac !== 'object') return false;
  const sortie = tac.airSortie as Record<string, unknown> | undefined;
  if (!sortie || String(sortie.phase ?? '') !== 'patrol') return false;
  return String(sortie.activeOrderKey ?? tac.airMissionOrderKey ?? '').trim() === 'patrol';
}

export function readPatrolRangeStepsFromUnit(unit: Record<string, unknown> | null | undefined): number | null {
  const sortie = unit?.tactical as { airSortie?: Record<string, unknown> } | undefined;
  const s = sortie?.airSortie;
  const fromSortie = Number(s?.patrolRangeSteps);
  if (Number.isFinite(fromSortie) && fromSortie > 0) return Math.floor(fromSortie);
  return null;
}

export function readPatrolCenterCellIdFromUnit(unit: Record<string, unknown> | null | undefined): number | null {
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  if (!tac) return null;
  const sortie = tac.airSortie as Record<string, unknown> | undefined;
  const id = Number(tac.airMissionTargetCellId ?? sortie?.patrolCenterCellId);
  return Number.isFinite(id) ? id : null;
}

/** Самолёт на активной миссии «Авиационная разведка» (патруль, не возврат). */
export function isUnitOnIntelligenceAirPatrol(unit: Record<string, unknown> | null | undefined): boolean {
  if (isUnitOnAirReturnOrCooldown(unit)) return false;
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  if (!tac || typeof tac !== 'object') return false;
  const sortie = tac.airSortie as Record<string, unknown> | undefined;
  if (!sortie || String(sortie.phase ?? '') !== 'patrol') return false;
  const key = String(sortie.activeOrderKey ?? tac.airMissionOrderKey ?? '').trim();
  return key === 'intelligenceAir';
}

export function isAirUnitOnRecallableMission(unit: Record<string, unknown> | null | undefined): boolean {
  const sortie = unit?.tactical as { airSortie?: Record<string, unknown> } | undefined
  const s = sortie?.airSortie
  if (!s || String(s.phase ?? '') !== 'patrol') return false
  const k = String(s.activeOrderKey ?? '').trim()
  return k === 'patrol' || k === 'intelligenceAir'
}

export function buildAirSupportReadinessMap(
  cells: Cell[],
  battleTurnIndex?: number,
): Partial<Record<number, AirSupportReadinessStatus>> {
  const out: Partial<Record<number, AirSupportReadinessStatus>> = {}
  for (const id of collectAirSupportInstanceIdsFromCells(cells)) {
    const live = findUnitCellByInstanceId(cells, id)
    out[id] = readAirSupportReadinessFromUnit(
      live?.unit as Record<string, unknown> | undefined,
      battleTurnIndex,
    )
  }
  return out
}

export function collectAirSupportInstanceIdsFromCells(cells: Cell[]): number[] {
  const ids = new Set<number>()
  for (const cell of cells) {
    for (const u of cell.units || []) {
      const raw = u as Record<string, unknown>
      if (!isBattleAirUnitType(raw.type)) continue
      const instanceId = Number(raw.instanceId)
      if (Number.isFinite(instanceId)) ids.add(instanceId)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

/** Для боя: своя авиация; зритель (`none`) видит весь состав авиации на карте. */
export function airSupportUnitsForViewer(
  units: BattleAirSupportUnitRow[],
  viewerFaction: LobbyFaction,
): BattleAirSupportUnitRow[] {
  if (viewerFaction === 'none') return units
  return units.filter((u) => airUnitBelongsToViewerFaction(u.faction, viewerFaction))
}

function airUnitBelongsToViewerFaction(unitFaction: string, viewerFaction: Exclude<LobbyFaction, 'none'>): boolean {
  const raw = String(unitFaction || '').trim().toLowerCase()
  const unitSoviet = raw === 'ussr' || raw === 'rkka'
  const unitAxis = raw === 'germany' || raw === 'wehrmacht'
  if (viewerFaction === 'rkka') return unitSoviet
  if (viewerFaction === 'wehrmacht') return unitAxis
  return false
}

/** Гекс, где цель ведёт бой / «находится» для перехвата (центр патруля, цель миссии или аэродром). */
export function readAirEngagementCellId(
  unit: Record<string, unknown> | null | undefined,
  physicalCellId: number,
): number {
  const tac = unit?.tactical as Record<string, unknown> | undefined
  if (!tac || typeof tac !== 'object') return physicalCellId
  const sortie = tac.airSortie as Record<string, unknown> | undefined
  const phase = String(sortie?.phase ?? '').trim()
  if (phase === 'inbound') {
    return readAirFlightPositionCellId(unit, physicalCellId)
  }

  const activeKey = String(sortie?.activeOrderKey ?? tac.airMissionOrderKey ?? '').trim()

  if (phase === 'patrol' && (activeKey === 'patrol' || activeKey === 'intelligenceAir')) {
    const centerId = readPatrolCenterCellIdFromUnit(unit)
    if (centerId != null) return centerId
  }

  if (phase === 'desant') {
    const tgt = Number(tac.airMissionTargetCellId)
    if (Number.isFinite(tgt)) return tgt
  }

  const missionKey = String(tac.airMissionOrderKey ?? '').trim()
  if (missionKey && missionKey !== 'airReturn' && phase !== 'cooldown') {
    const tgt = Number(tac.airMissionTargetCellId)
    if (Number.isFinite(tgt)) return tgt
  }

  return physicalCellId
}

function readEffectivePathIndexFromUnit(unit: Record<string, unknown>, path: number[]): number {
  const tac = unit.tactical as Record<string, unknown> | undefined
  const sortie = tac?.airSortie as Record<string, unknown> | undefined
  if (!sortie || typeof sortie !== 'object') return -1
  const phase = String(sortie.phase ?? '').trim()
  if (phase === 'patrol') return Math.max(0, path.length - 1)
  if (phase === 'inbound') {
    const idx = Number(sortie.pathIndex)
    return Number.isFinite(idx) ? idx : -1
  }
  return -1
}

/** Гекс текущей позиции самолёта на маршруте (для отображения и перехвата). */
export function readAirFlightPositionCellId(
  unit: Record<string, unknown> | null | undefined,
  physicalCellId: number,
): number {
  const path = readFlightPathCellIdsFromUnit(unit)
  const idx = unit ? readEffectivePathIndexFromUnit(unit, path) : -1
  if (idx < 0 || !path.length) {
    const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
      | Record<string, unknown>
      | undefined
    const dep = Number(sortie?.departureCellId)
    if (Number.isFinite(dep)) return dep
    return physicalCellId
  }
  return path[Math.min(idx, path.length - 1)]
}

/** Можно ли выбрать юнит как цель перехвата (уже в воздухе, не на аэродроме). */
export function isAirUnitAirborneForInterception(unit: Record<string, unknown> | null | undefined): boolean {
  const sortie = (unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  if (!sortie || typeof sortie !== 'object') return false
  const phase = String(sortie.phase ?? '').trim()
  if (phase === 'cooldown') return false
  if (phase === 'inbound') {
    const stage = String(sortie.inboundStage ?? '').trim()
    if (stage === 'ordered') return false
    const path = readFlightPathCellIdsFromUnit(unit)
    return readEffectivePathIndexFromUnit(unit!, path) >= 0 || stage === 'airborne'
  }
  if (phase === 'patrol') return true
  if (phase === 'desant') {
    const step = Number(sortie.desantStep)
    return Number.isFinite(step) && step >= 2
  }
  return false
}

export function readFlightPathCellIdsFromUnit(unit: Record<string, unknown> | null | undefined): number[] {
  const tac = unit?.tactical as Record<string, unknown> | undefined
  const sortie = tac?.airSortie as Record<string, unknown> | undefined
  if (sortie && Array.isArray(sortie.pathCellIds) && sortie.pathCellIds.length) {
    return (sortie.pathCellIds as unknown[]).map(Number).filter(Number.isFinite)
  }
  if (tac && Array.isArray(tac.airMissionFlightPath) && tac.airMissionFlightPath.length) {
    return (tac.airMissionFlightPath as unknown[]).map(Number).filter(Number.isFinite)
  }
  return []
}

export type AirUnitInFlight = {
  instanceId: number
  unit: Record<string, unknown>
  physicalCell: Cell
  flightCell: Cell
  pathIndex: number
  pathLength: number
}

/** Авиация на траектории. В фазе вылета (inbound) спрайт на карте не рисуется — только линия маршрута. */
export function collectAirUnitsInFlight(_cells: Cell[], _battleTurnIndex?: number): AirUnitInFlight[] {
  return []
}

export type AirInterceptionTarget = {
  instanceId: number
  unit: Record<string, unknown>
  physicalCell: Cell
  engagementCell: Cell
}

function isAirInterceptionTargetVisible(
  physicalCellId: number,
  engagementCellId: number,
  fog: Set<number> | null,
  viewerFaction: LobbyFaction,
): boolean {
  if (viewerFaction === 'none') return true
  if (!fog) return true
  return fog.has(physicalCellId) || fog.has(engagementCellId)
}

/** Вражеская авиация, доступная для выбора цели перехвата на карте. */
export function collectEnemyAirInterceptionTargets(
  cells: Cell[],
  viewerFaction: LobbyFaction,
  fogRevealedCellIds: Set<number> | number[] | null,
): AirInterceptionTarget[] {
  const fog =
    fogRevealedCellIds instanceof Set
      ? fogRevealedCellIds
      : Array.isArray(fogRevealedCellIds)
        ? new Set(fogRevealedCellIds.map((x) => Number(x)).filter(Number.isFinite))
        : null
  const out: AirInterceptionTarget[] = []
  const seen = new Set<number>()

  for (const cell of cells) {
    for (const raw of cell.units || []) {
      const unit = raw as Record<string, unknown>
      if (!isBattleAirUnitType(unit.type)) continue
      const instanceId = Number(unit.instanceId)
      if (!Number.isFinite(instanceId) || seen.has(instanceId)) continue
      if (viewerFaction !== 'none' && airUnitBelongsToViewerFaction(String(unit.faction ?? ''), viewerFaction)) {
        continue
      }
      const live = findUnitCellByInstanceId(cells, instanceId)
      if (!live) continue
      if (!isAirUnitAirborneForInterception(unit)) continue
      const engagementCellId = readAirEngagementCellId(unit, live.cell.id)
      const engagementCell = cells.find((c) => c.id === engagementCellId) ?? live.cell
      if (
        !isAirInterceptionTargetVisible(live.cell.id, engagementCell.id, fog, viewerFaction)
      ) {
        continue
      }
      seen.add(instanceId)
      out.push({
        instanceId,
        unit,
        physicalCell: live.cell,
        engagementCell,
      })
    }
  }

  out.sort((a, b) => a.instanceId - b.instanceId)
  return out
}

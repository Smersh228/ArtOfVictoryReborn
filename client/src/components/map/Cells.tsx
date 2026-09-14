import React, { useRef, useEffect, useState, useMemo } from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import type { LobbyFaction } from '../../api/rooms'
import type { AirInterceptionTarget, AirUnitInFlight } from '../../game/battleAirSupport'
import cursorPointer from '../../img/cursors/cursorPointer.cur'
import {
  cellHasEditorPlacement,
  traceHexPath,
} from './cellsDrawBase'
import {
  clientToCanvas as toCanvasPoint,
  findCellAtPosition as findCellAtCanvasPosition,
  findUnitAtPosition as findUnitAtCanvasPosition,
  findAirInterceptionTargetAtPosition,
  getCellCenter as getHexCellCenter,
  getCellCorners as getHexCellCorners,
} from './cellsInteraction'
import { drawPathOverlay } from './cellsDrawOverlays'
import { drawUnitsOnCell, drawAirInterceptionTargetsOnCell, drawAirUnitsInFlightOnCell } from './cellsDrawUnits'
import { drawCellsCanvas } from './cellsDraw'
import { cellIdListSize, cellIdSetHas, type CellIdList } from './cellIdSet'
import CellContextMenus from './CellContextMenus'
import type { EditorMapCatalogUnitPick } from './EditorMapUnitOrderMenu'
import { useCellsAssets } from './useCellsAssets'
import type { BattlePendingOrderHover } from '../../game/battlePendingOrderHover'
import { hasDotOnCell } from '../../game/cellDot'

export interface BattlePendingShootPreview {
  targetInstanceId?: number
  targetCellId?: number
  orderKey: 'fire' | 'fireHard' | 'attack' | 'hardMove'
}

export interface BattlePendingLogisticsPreview {
  kind: 'tow' | 'loading' | 'getSup' | 'unloading' | 'loadingSup'
  targetInstanceId?: number
  targetCellId?: number
  truckInstanceId?: number
}

export interface BattleReportReplayHighlight {
  glowInstanceIds: number[]
  targetDecal?: {
    orderKey: 'fire' | 'fireHard' | 'attack' | 'hardMove' | 'tow' | 'loading' | 'getSup'
    
    targetInstanceIds: number[]
  }
  unloadCellDecalId?: number
  /** Склад: иконка загрузки припасов при наведении на строку отчёта. */
  loadingSupCellDecalId?: number
  lossCellId?: number
  /** Гексы появления подкреплений при наведении на строку отчёта. */
  spawnCellIds?: number[]
  /** Область разведки при наведении на строку отчёта. */
  reconZoneCellIds?: number[]
  reconCenterCellId?: number
  reconOrderKey?: string
  /** Точка вылета при наведении на «появился в небе» в отчёте. */
  airDepartureCellId?: number
  /** Текущая позиция на маршруте (край карты) при hover отчёта. */
  airFlightCellId?: number
  /** Гекс воздушного боя и иконка приказа при наведении на строку отчёта. */
  airCombatCellId?: number
  airCombatOrderKey?: string
  /** Гекс выстрела ПВО (сектор артиллерии по авиации) при наведении на строку отчёта. */
  artilleryAirSectorCellId?: number
  /** Гекс ДОТ, из которого вели огонь, при наведении на строку отчёта. */
  dotGlowCellIds?: number[]
  /** Иконка приказа на гексе ДОТ при hover отчёта. */
  dotOrderKey?: string
}


export interface BattleDefendHoverState {
  unitInstanceId: number
  facingCellId: number
  sectorCellIds: number[]
  defendKind?: 'defend' | 'ambush'
  facingDecal?: 'defend' | 'ambush' | 'deploy' | 'changeSector'
  showDeployDecalOnUnit?: boolean
  showClottingDecalOnUnit?: boolean
  unitStandingCellId?: number
  showSectorWithoutUnitHover?: boolean
  commitPreviewSectorCellIds?: number[]
}

interface CellsProps {
  cells: Cell[]
  width: number 
  height: number
  cellSize: number
  mode: 'editor' | 'battle'
  lobbyPreview?: boolean
  hideEditorCellHexMenu?: boolean
  viewerBattleFaction?: LobbyFaction
  viewerBattleTeam?: number | null
  battleHoverCursor?: string
  wrapClassName?: string
  onCellClick?: (cell: Cell, unitId?: number, click?: { canvasX: number; canvasY: number; clientX?: number; clientY?: number }) => void  
  onUnitClick?: (unit: any, cell: Cell, event: React.MouseEvent) => void
  /** Приказы с целью-гексом (ДОТ, ход, сектор): клик идёт в клетку, даже если сверху юнит. */
  ignoreUnitClicks?: boolean
  /** Скрыть спрайты (гарнизон ДОТ / приказ «Занять ДОТ»). */
  hiddenBattleInstanceIds?: number[] | null
  onUnitHover?: (unit: any, cell: Cell, event: React.MouseEvent) => void
  onUnitLeave?: () => void
  /** Не вызывать hover-подсказки (телефон: осмотр зажатием). */
  suppressPointerHoverTips?: boolean
  /** Телефон: удержание пальца — характеристики юнита / клетки. */
  onLongPress?: (info: { cell: Cell | null; unit: any | null; clientX: number; clientY: number }) => void
  onUnitDelete?: (unitInstanceId: number, cell: Cell) => void

  onCellHover?: (cell: Cell | null, event: React.MouseEvent<HTMLCanvasElement>) => void
  onCellLeave?: () => void
  hoverPath?: Cell[] | null
  /** Рисовать траекторию как авиацию (линия), без иконок походного приказа */
  hoverPathIsAirMission?: boolean
  moveReachableCellIds?: CellIdList
  defendFacingPickCellIds?: CellIdList
  battleDefendHover?: BattleDefendHoverState | null
  battleFireTargetInstanceIds?: CellIdList
  battleAreaFireCellIds?: CellIdList
  battleDotSectorCellIds?: CellIdList
  enterDotGlowCellIds?: CellIdList
  /** Выбор склада: серое свечение спрайта, без заливки гекса. */
  loadingSupGlowCellIds?: CellIdList
  battlePendingShootPreview?: BattlePendingShootPreview | null
  battlePendingOrderHover?: BattlePendingOrderHover | null
  battleFogRevealedCellIds?: CellIdList
  battleReportReplayHighlight?: BattleReportReplayHighlight | null
  battleLogisticsPickInstanceIds?: CellIdList
  battleUnloadCellIds?: CellIdList
  /** Гекс вылета: красная подсветка гекса и иконка (панель). */
  battleAirDepartureHoverCellId?: number | null
  /** Гекс вылета при выборе авиаприказа: красный гекс и иконка. */
  battleAirDeparturePickCellId?: number | null
  /** Цель авиаприказа в превью — только иконка приказа на гексе. */
  battleAirMissionPreview?: { targetCellId: number; orderKey: string } | null
  /** Зона патрулирования: клетки в радиусе видимости от точки патруля. */
  battlePatrolVisibilityCellIds?: CellIdList
  /** Центр зоны патрулирования (точка патруля). */
  battlePatrolCenterCellId?: number | null
  /** Патруль: клетки для выбора радиуса зоны. */
  patrolRangePickCellIds?: CellIdList
  /** Разведка/радиоперехват: клетки, на которых можно задать радиус. */
  reconRangePickCellIds?: CellIdList
  /** Разведка/радиоперехват: зона при наведении курсора. */
  battleReconHoverAreaCellIds?: CellIdList
  /** Разведка/радиоперехват: гекс юнита (центр зоны). */
  battleReconHoverCenterCellId?: number | null
  /** Назначенный приказ: иконка на юните при наведении. */
  battleReconHoverUnitInstanceId?: number | null
  battleReconHoverOrderKey?: 'razvedka' | 'svzy' | null
  /** Область бомбардировки при наведении на цель. */
  battleBombardmentAreaCellIds?: CellIdList
  /** Бомбардировка: соседние гексы цели — выбор стороны захода. */
  bombardmentDirectionPickCellIds?: CellIdList
  /** Бомбардировка: гекс захода по траектории полёта (сторона захода). */
  bombardmentApproachCellId?: number | null
  battleLogisticsUnitDecal?: { orderKey: 'tow' | 'loading'; targetInstanceIds: number[] } | null
  battlePendingLogisticsPreview?: BattlePendingLogisticsPreview | null
  /** Цели перехвата: вражеская авиация на карте при выборе приказа «Перехват». */
  battleAirInterceptionTargets?: AirInterceptionTarget[] | null
  /** Авиация в полёте по маршруту (отображается на гексах траектории). */
  battleAirUnitsInFlight?: AirUnitInFlight[]
  /** Редактор карты: подсветка края для установки малой/большой авиации */
  editorAviationEdgeHighlight?: boolean
  editorAviationEdgeCellIds?: ReadonlySet<number>
  editorDeployZones?: { cellId: number; team: number }[] | null
  editorDeployBrushTeam?: number | null
  /** Обновление данных ячейки из контекстного меню (hexExtra и т.д.) */
  onEditorCellPatch?: (cellId: number, patch: (cell: Cell) => Cell) => void
  editorCatalogUnits?: EditorMapCatalogUnitPick[]
  editorTeamLimit?: 2 | 4 | 6
  onEditorUnitPatch?: (
    cellId: number,
    unitInstanceId: number,
    patch: (unit: Record<string, unknown>) => Record<string, unknown>,
  ) => void
  editorFacingPickCellIds?: CellIdList
  onEditorFacingCellPick?: (cell: Cell) => void
  artilleryFacingPick?: { unitInstanceId: number; unitCellId: number } | null
  onStartArtilleryFacingPick?: (unitInstanceId: number, unitCellId: number) => void
  onCancelArtilleryFacingPick?: () => void
  dotFacingPick?: { cellId: number } | null
  onStartDotFacingPick?: (cellId: number) => void
}

interface HoveredUnitState {
  cell: Cell
  unit: any
  index: number
}

interface UnitMenuState {
  x: number
  y: number
  unit: any
  cell: Cell
}

interface CellMenuState {
  x: number
  y: number
  cell: Cell
}

const Cells: React.FC<CellsProps> = ({ 
  cells, 
  width, 
  height, 
  cellSize,
  mode, 
  lobbyPreview = false,
  hideEditorCellHexMenu = false,
  viewerBattleFaction = 'none',
  viewerBattleTeam = null,
  battleHoverCursor,
  onCellClick,
  onUnitClick,
  ignoreUnitClicks = false,
  hiddenBattleInstanceIds = null,
  onUnitHover,
  onUnitLeave,
  suppressPointerHoverTips = false,
  onLongPress,
  onUnitDelete,
  onCellHover,
  onCellLeave,
  hoverPath,
  hoverPathIsAirMission = false,
  moveReachableCellIds = null,
  defendFacingPickCellIds = null,
  battleDefendHover = null,
  battleFireTargetInstanceIds = null,
  battleAreaFireCellIds = null,
  battleDotSectorCellIds = null,
  enterDotGlowCellIds = null,
  loadingSupGlowCellIds = null,
  battlePendingShootPreview = null,
  battlePendingOrderHover = null,
  battleFogRevealedCellIds = null,
  battleReportReplayHighlight = null,
  battleLogisticsPickInstanceIds = null,
  battleUnloadCellIds = null,
  battleAirDepartureHoverCellId = null,
  battleAirDeparturePickCellId = null,
  battleAirMissionPreview = null,
  battlePatrolVisibilityCellIds = null,
  battlePatrolCenterCellId = null,
  patrolRangePickCellIds = null,
  reconRangePickCellIds = null,
  battleReconHoverAreaCellIds = null,
  battleReconHoverCenterCellId = null,
  battleReconHoverUnitInstanceId = null,
  battleReconHoverOrderKey = null,
  battleBombardmentAreaCellIds = null,
  bombardmentDirectionPickCellIds = null,
  bombardmentApproachCellId = null,
  battleLogisticsUnitDecal = null,
  battlePendingLogisticsPreview = null,
  battleAirInterceptionTargets = null,
  battleAirUnitsInFlight = [],
  editorAviationEdgeHighlight = false,
  editorAviationEdgeCellIds,
  editorDeployZones = null,
  editorDeployBrushTeam = null,
  wrapClassName,
  onEditorCellPatch,
  editorCatalogUnits,
  editorTeamLimit = 2,
  onEditorUnitPatch,
  editorFacingPickCellIds = null,
  onEditorFacingCellPick,
  artilleryFacingPick = null,
  dotFacingPick = null,
  onStartDotFacingPick,
  onStartArtilleryFacingPick,
  onCancelArtilleryFacingPick,
}) => {
  const hiddenBattleInstanceIdSet = useMemo(() => {
    if (!hiddenBattleInstanceIds?.length) return null
    const s = new Set<number>()
    for (const id of hiddenBattleInstanceIds) {
      const n = Number(id)
      if (Number.isFinite(n)) s.add(n)
    }
    return s.size ? s : null
  }, [hiddenBattleInstanceIds])
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assets = useCellsAssets()
  const textureVersion = assets.textureVersion
  const resolveEditorCachedImage = assets.resolveEditorCachedImage
  const getTexture = assets.getTexture
  const moveDecalImgRef = assets.refs.moveDecalImgRef
  const defendOrderDecalImgRef = assets.refs.defendOrderDecalImgRef
  const ambushOrderDecalImgRef = assets.refs.ambushOrderDecalImgRef
  const shootOrderDecalImgRef = assets.refs.shootOrderDecalImgRef
  const logisticsUnitDecalImgRef = assets.refs.logisticsUnitDecalImgRef
  const reconOrderDecalImgRef = assets.refs.reconOrderDecalImgRef
  const orderDecalImgRef = assets.refs.orderDecalImgRef
  const unloadCellDecalImgRef = assets.refs.unloadCellDecalImgRef
  const deployOrderDecalImgRef = assets.refs.deployOrderDecalImgRef
  const changeSectorOrderDecalImgRef = assets.refs.changeSectorOrderDecalImgRef
  const clottingOrderDecalImgRef = assets.refs.clottingOrderDecalImgRef
  const fireSupIconImgRef = assets.refs.fireSupIconImgRef
  const longOrderClockImgRef = assets.refs.longOrderClockImgRef
  const airMissionOrderDecalImgRef = assets.refs.airMissionOrderDecalImgRef
  const airDepartureDecalImgRef = assets.refs.airDepartureDecalImgRef
  const fireAirGunDecalImgRef = assets.refs.fireAirGunDecalImgRef
  const wireEdgeImgRef = assets.refs.wireEdgeImgRef
  const trenchImgRef = assets.refs.trenchImgRef
  const antiTankImgRef = assets.refs.antiTankImgRef
  const dotImgRef = assets.refs.dotImgRef
  const storageImgRef = assets.refs.storageImgRef
  const pontonImgRef = assets.refs.pontonImgRef
  const pontonStageImgRef = assets.refs.pontonStageImgRef
  const smokeImgRef = assets.refs.smokeImgRef
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  const [hoveredUnit, setHoveredUnit] = useState<HoveredUnitState | null>(null)
  const [unitMenu, setUnitMenu] = useState<UnitMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<CellMenuState | null>(null)
  const lastHoverRef = useRef<{ cellId: number | null; unitId: number | null }>({ cellId: null, unitId: null })
  const holdTimerRef = useRef<number | null>(null)
  const holdStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressClickRef = useRef(false)
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverCellRef = useRef(hoverCell)
  const hoveredUnitRef = useRef(hoveredUnit)
  hoverCellRef.current = hoverCell
  hoveredUnitRef.current = hoveredUnit

  function isEnemyUnitHiddenByFog(unit: { faction?: string }, cell: Cell) {
    if (mode !== 'battle' || lobbyPreview || !battleFogRevealedCellIds || viewerBattleFaction === 'none') {
      return false
    }
    const raw = String(unit.faction ?? '').trim().toLowerCase()
    const unitIsSoviet = raw === 'ussr' || raw === 'rkka'
    const unitIsAxis = raw === 'germany' || raw === 'wehrmacht'
    if (!unitIsSoviet && !unitIsAxis) return false
    const mineIsSoviet = viewerBattleFaction === 'rkka'
    const mineIsAxis = viewerBattleFaction === 'wehrmacht'
    const isAlly = (unitIsSoviet && mineIsSoviet) || (unitIsAxis && mineIsAxis)
    if (isAlly) return false
    return !cellIdSetHas(battleFogRevealedCellIds, cell.id)
  }

  const getCellCenter = (q: number, r: number) => getHexCellCenter(q, r, cellSize, width, height)

  const getCellCorners = (centerX: number, centerY: number) => getHexCellCorners(centerX, centerY, cellSize)

  const findCellAtPosition = (mouseX: number, mouseY: number) =>
    findCellAtCanvasPosition(cells, mouseX, mouseY, cellSize, width, height)

  const findUnitAtPosition = (mouseX: number, mouseY: number) => {
    const ground = findUnitAtCanvasPosition(cells, mouseX, mouseY, {
      lobbyPreview,
      mode,
      cellSize,
      width,
      height,
      isEnemyUnitHiddenByFog,
      extraHiddenInstanceIds: hiddenBattleInstanceIdSet,
    })
    if (ground) return ground
    if (!battleAirInterceptionTargets?.length) return null
    return findAirInterceptionTargetAtPosition(mouseX, mouseY, battleAirInterceptionTargets, {
      lobbyPreview,
      mode,
      cellSize,
      width,
      height,
      findCellAt: (mx, my) => findCellAtPosition(mx, my),
    })
  }

  const LONG_PRESS_MS = 420
  const LONG_PRESS_MOVE_PX = 16

  const holdWindowCleanupRef = useRef<(() => void) | null>(null)

  const detachHoldWindow = () => {
    holdWindowCleanupRef.current?.()
    holdWindowCleanupRef.current = null
  }

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    holdStartRef.current = null
    detachHoldWindow()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onLongPressRef.current || lobbyPreview || e.button !== 0) return
    suppressClickRef.current = false
    clearHoldTimer()
    const pointerId = e.pointerId
    holdStartRef.current = { x: e.clientX, y: e.clientY, pointerId }
    const onWinMove = (ev: PointerEvent) => {
      const start = holdStartRef.current
      if (!start || ev.pointerId !== start.pointerId) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearHoldTimer()
    }
    const onWinUp = (ev: PointerEvent) => {
      const start = holdStartRef.current
      if (start && ev.pointerId !== start.pointerId) return
      clearHoldTimer()
    }
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
    window.addEventListener('pointercancel', onWinUp)
    holdWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWinMove)
      window.removeEventListener('pointerup', onWinUp)
      window.removeEventListener('pointercancel', onWinUp)
    }
    holdTimerRef.current = window.setTimeout(() => {
      const start = holdStartRef.current
      holdTimerRef.current = null
      holdStartRef.current = null
      detachHoldWindow()
      const inspect = onLongPressRef.current
      if (!start || !inspect) return
      const canvas = canvasRef.current
      const rect = canvas?.getBoundingClientRect()
      if (!rect) return
      const point = toCanvasPoint(start.x, start.y, rect, canvas)
      const unitHit = findUnitAtPosition(point.x, point.y)
      const cellHit = unitHit?.cell ?? findCellAtPosition(point.x, point.y)
      if (unitHit) {
        setHoveredUnit(unitHit)
        setHoverCell(unitHit.cell)
      } else {
        setHoveredUnit(null)
        setHoverCell(cellHit)
      }
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 700)
      inspect({
        cell: cellHit,
        unit: unitHit?.unit ?? null,
        clientX: start.x,
        clientY: start.y,
      })
      try {
        navigator.vibrate?.(12)
      } catch {
        /* ignore */
      }
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = holdStartRef.current
    if (!start || e.pointerId !== start.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearHoldTimer()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = holdStartRef.current
    if (start && e.pointerId !== start.pointerId) return
    clearHoldTimer()
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onLongPressRef.current) return
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cells.length || lobbyPreview) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const point = toCanvasPoint(e.clientX, e.clientY, rect, canvasRef.current)
    const x = point.x
    const y = point.y

    const cellAtPointer = findCellAtPosition(x, y)
    const unitUnderMouse = ignoreUnitClicks ? null : findUnitAtPosition(x, y)

    const hoverCursor = battleHoverCursor || 'pointer'
    const editorHoverCursor = `url(${cursorPointer}), pointer`

    const nextCell = unitUnderMouse ? unitUnderMouse.cell : cellAtPointer
    const nextCellId = nextCell != null ? Number(nextCell.id) : null
    const nextUnitId =
      unitUnderMouse && Number.isFinite(Number(unitUnderMouse.unit?.instanceId))
        ? Number(unitUnderMouse.unit.instanceId)
        : null
    const hoverUnchanged =
      lastHoverRef.current.cellId === nextCellId && lastHoverRef.current.unitId === nextUnitId

    if (hoverUnchanged) return
    const leftUnit = lastHoverRef.current.unitId != null && nextUnitId == null
    lastHoverRef.current = { cellId: nextCellId, unitId: nextUnitId }

    if (unitUnderMouse) {
      setHoveredUnit(unitUnderMouse)
      setHoverCell(unitUnderMouse.cell)
      if (canvasRef.current) {
        canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : hoverCursor
      }

      if (onCellHover) {
        onCellHover(unitUnderMouse.cell, e)
      }

      if (!suppressPointerHoverTips && onUnitHover) {
        onUnitHover(unitUnderMouse.unit, unitUnderMouse.cell, e)
      }
    } else {
      setHoveredUnit(null)
      if (!suppressPointerHoverTips && leftUnit && onUnitLeave) {
        onUnitLeave()
      }
      setHoverCell(cellAtPointer)

      if (onCellHover) {
        onCellHover(cellAtPointer, e)
      }
      
      if (canvasRef.current) {
        if (lobbyPreview) {
          canvasRef.current.style.cursor = 'default'
        } else if (cellAtPointer) {
          canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : hoverCursor
        } else {
          canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : 'default'
        }
      }
    }
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hadHover = lastHoverRef.current.cellId != null || lastHoverRef.current.unitId != null
    lastHoverRef.current = { cellId: null, unitId: null }
    if (!hadHover) return
    setHoverCell(null)
    setHoveredUnit(null)
    if (onCellHover) {
      onCellHover(null, e)
    }
    if (!suppressPointerHoverTips && onCellLeave) {
      onCellLeave()
    }
    if (!suppressPointerHoverTips && onUnitLeave) {
      onUnitLeave()
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = mode === 'editor' ? `url(${cursorPointer}), pointer` : 'default'
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
  if (suppressClickRef.current) {
    suppressClickRef.current = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (lobbyPreview) return
  const rect = canvasRef.current?.getBoundingClientRect()
  if (!rect) return

  const point = toCanvasPoint(e.clientX, e.clientY, rect, canvasRef.current)
  const x = point.x
  const y = point.y

  const cellAtPointer = findCellAtPosition(x, y)
  const unitUnderMouse = ignoreUnitClicks ? null : findUnitAtPosition(x, y)
  
  if (unitUnderMouse) {
    e.stopPropagation()
    if (mode === 'editor') {
      if (artilleryFacingPick || dotFacingPick) return
      setCellMenu(null)
    
      const wrapRect = wrapRef.current?.getBoundingClientRect()
      const mx = wrapRect ? e.clientX - wrapRect.left : e.clientX
      const my = wrapRect ? e.clientY - wrapRect.top + 6 : e.clientY + 6
      setUnitMenu({
        x: mx,
        y: my,
        unit: unitUnderMouse.unit,
        cell: unitUnderMouse.cell
      })
    } else {
      if (onUnitClick) {
        onUnitClick(unitUnderMouse.unit, unitUnderMouse.cell, e)
      }

      if (onCellClick) {
        const canvasPt = toCanvasPoint(e.clientX, e.clientY, rect, canvasRef.current)
        const clickedId = unitUnderMouse.unit.instanceId ?? unitUnderMouse.unit.id
        onCellClick(
          cellAtPointer ?? unitUnderMouse.cell,
          clickedId,
          { canvasX: canvasPt.x, canvasY: canvasPt.y, clientX: e.clientX, clientY: e.clientY },
        )
      }
    }
  } else {
    const cell = cellAtPointer
    const facingPick =
      mode === 'editor' &&
      cell &&
      editorFacingPickCellIds &&
      cellIdSetHas(editorFacingPickCellIds, cell.id) &&
      onEditorFacingCellPick
    if (facingPick) {
      e.stopPropagation()
      onEditorFacingCellPick(cell)
      return
    }
    if (!artilleryFacingPick && !dotFacingPick) {
      setUnitMenu(null)
    }
    const showCellIdMenu =
      mode === 'editor' &&
      cell &&
      cellHasEditorPlacement(cell) &&
      !hideEditorCellHexMenu &&
      !dotFacingPick &&
      !artilleryFacingPick
    if (showCellIdMenu) {
      e.stopPropagation()
      const wrapRect = wrapRef.current?.getBoundingClientRect()
      const mx = wrapRect ? e.clientX - wrapRect.left : e.clientX
      const my = wrapRect ? e.clientY - wrapRect.top + 6 : e.clientY + 6
      setCellMenu({ x: mx, y: my, cell })
    } else {
      setCellMenu(null)
    }
    if (onCellClick && cell) {
      e.stopPropagation()
      const canvasPt = toCanvasPoint(e.clientX, e.clientY, rect, canvasRef.current)
      onCellClick(cell, undefined, {
        canvasX: canvasPt.x,
        canvasY: canvasPt.y,
        clientX: e.clientX,
        clientY: e.clientY,
      })
    }
  }
  }

  const handleDeleteUnit = () => {
    if (unitMenu && onUnitDelete) {
      onUnitDelete(unitMenu.unit.instanceId, unitMenu.cell)
      setUnitMenu(null)
    }
  }

  const drawPath = (ctx: CanvasRenderingContext2D) => {
    drawPathOverlay(ctx, {
      hoverPath,
      hoverPathIsAirMission,
      moveDecalImg: moveDecalImgRef.current,
      cellSize,
      getCellCenter,
    })
  }

  const drawUnitsWithHover = (
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    center: { x: number; y: number },
    hoverU: HoveredUnitState | null,
    hoverC: Cell | null,
  ) => {
    drawUnitsOnCell(ctx, {
      cell,
      center,
      cellSize,
      lobbyPreview,
      mode,
      viewerBattleFaction,
      viewerBattleTeam,
      hoveredUnit: hoverU,
      hoverCell: hoverC,
      battleFireTargetInstanceIds,
      battleLogisticsPickInstanceIds,
      battlePendingLogisticsPreview,
      battleReportReplayHighlight,
      battlePendingShootPreview,
      battlePendingOrderHover,
      battleLogisticsUnitDecal,
      battleDefendHover,
      shootOrderDecalImgRef,
      logisticsUnitDecalImgRef,
      reconOrderDecalImgRef,
      orderDecalImgRef,
      battleReconHoverUnitInstanceId,
      battleReconHoverOrderKey,
      defendOrderDecalImgRef,
      ambushOrderDecalImgRef,
      fireSupIconImgRef,
      longOrderClockImgRef,
      resolveEditorCachedImage,
      isEnemyUnitHiddenByFog,
      extraHiddenInstanceIds: hiddenBattleInstanceIdSet,
    })

    drawAirUnitsInFlightOnCell(ctx, {
      cell,
      center,
      cellSize,
      lobbyPreview,
      mode,
      viewerBattleFaction,
      unitsInFlight: battleAirUnitsInFlight,
      cells,
      getCellCenter,
      resolveEditorCachedImage,
    })

    if (battleAirInterceptionTargets?.length) {
      const hoveredIdRaw = hoverU?.unit?.instanceId
      const hoveredId =
        hoveredIdRaw != null && Number.isFinite(Number(hoveredIdRaw)) ? Number(hoveredIdRaw) : null
      drawAirInterceptionTargetsOnCell(ctx, {
        cell,
        center,
        cellSize,
        lobbyPreview,
        mode,
        targets: battleAirInterceptionTargets,
        hoveredInstanceId: hoveredId,
        cells,
        getCellCenter,
        resolveEditorCachedImage,
      })
    }
  }

  const hoverOverlayOnly = !battleDefendHover && !battlePendingLogisticsPreview

  const ensureBaseCanvas = () => {
    let c = baseCanvasRef.current
    if (!c) {
      c = document.createElement('canvas')
      baseCanvasRef.current = c
    }
    if (c.width !== width) c.width = width
    if (c.height !== height) c.height = height
    return c
  }

  const paintHoverOverlay = () => {
    const canvas = canvasRef.current
    const base = baseCanvasRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(base, 0, 0)
    const hc = hoverCellRef.current
    const hu = hoveredUnitRef.current
    const fogHidesHoverDot =
      mode === 'battle' &&
      !lobbyPreview &&
      viewerBattleFaction !== 'none' &&
      battleFogRevealedCellIds != null &&
      hc != null &&
      !cellIdSetHas(battleFogRevealedCellIds, hc.id)
    const skipRing =
      !hc ||
      !!hu ||
      (hasDotOnCell(hc.builds) && !fogHidesHoverDot) ||
      cellIdListSize(moveReachableCellIds) > 0 ||
      cellIdListSize(defendFacingPickCellIds) > 0 ||
      cellIdListSize(battleAreaFireCellIds) > 0 ||
      cellIdListSize(battleUnloadCellIds) > 0 ||
      cellIdListSize(patrolRangePickCellIds) > 0 ||
      cellIdListSize(battlePatrolVisibilityCellIds) > 0 ||
      cellIdListSize(reconRangePickCellIds) > 0 ||
      cellIdListSize(battleReconHoverAreaCellIds) > 0 ||
      cellIdListSize(battleBombardmentAreaCellIds) > 0 ||
      bombardmentApproachCellId != null ||
      battleAirDeparturePickCellId != null ||
      battleAirDepartureHoverCellId != null
    if (hc && !skipRing) {
      const center = getCellCenter(hc.coor.x, hc.coor.z)
      const corners = getCellCorners(center.x, center.y)
      ctx.beginPath()
      traceHexPath(ctx, corners)
      ctx.strokeStyle = 'yellow'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    if (hu) {
      const center = getCellCenter(hu.cell.coor.x, hu.cell.coor.z)
      drawUnitsWithHover(ctx, hu.cell, center, hu, hc)
    }
  }

  const draw = (opts?: { hoverC?: Cell | null; hoverU?: HoveredUnitState | null; target?: HTMLCanvasElement | null }) => {
    const hoverC = opts && 'hoverC' in opts ? opts.hoverC ?? null : hoverCell
    const hoverU = opts && 'hoverU' in opts ? opts.hoverU ?? null : hoveredUnit
    drawCellsCanvas({
      canvas: opts?.target ?? canvasRef.current,
      width,
      height,
      cellSize,
      mode,
      lobbyPreview,
      cells,
      hoverCell: hoverC,
      hoveredUnit: hoverU,
      moveReachableCellIds,
      defendFacingPickCellIds:
        mode === 'editor' && cellIdListSize(editorFacingPickCellIds) > 0
          ? editorFacingPickCellIds
          : defendFacingPickCellIds,
      battleDefendHover,
      battleAreaFireCellIds,
      battleDotSectorCellIds,
      enterDotGlowCellIds,
      loadingSupGlowCellIds,
      battleReportReplayHighlight,
      battleUnloadCellIds,
      battleAirDepartureHoverCellId,
      battleAirDeparturePickCellId,
      battleAirMissionPreview,
      battlePatrolVisibilityCellIds,
      battlePatrolCenterCellId,
      battleAirInterceptionTargetCellIds:
        battleAirInterceptionTargets?.map((t) => t.engagementCell.id) ?? null,
      patrolRangePickCellIds,
      reconRangePickCellIds,
      battleReconHoverAreaCellIds,
      battleReconHoverCenterCellId,
      battleBombardmentAreaCellIds,
      bombardmentDirectionPickCellIds,
      bombardmentApproachCellId,
      battlePendingLogisticsPreview,
      battlePendingShootPreview,
      battlePendingOrderHover,
      orderDecals: orderDecalImgRef.current,
      getCellCenter,
      getCellCorners,
      getTexture,
      resolveEditorCachedImage,
      drawUnits: (ctx, cell, center) => drawUnitsWithHover(ctx, cell, center, hoverU, hoverC),
      drawPath,
      deployOrderDecalImg: deployOrderDecalImgRef.current,
      changeSectorOrderDecalImg: changeSectorOrderDecalImgRef.current,
      clottingOrderDecalImg: clottingOrderDecalImgRef.current,
      unloadCellDecalImg: unloadCellDecalImgRef.current,
      getSupDecalImg: logisticsUnitDecalImgRef.current.getSup ?? null,
      loadingSupDecalImg: logisticsUnitDecalImgRef.current.loadingSup ?? null,
      shootOrderDecals: shootOrderDecalImgRef.current,
      airMissionOrderDecals: airMissionOrderDecalImgRef.current,
      airDepartureDecalImg: airDepartureDecalImgRef.current,
      fireAirGunDecalImg: fireAirGunDecalImgRef.current,
      editorAviationEdgeHighlight,
      editorAviationEdgeCellIds,
      editorDeployZones,
      editorDeployBrushTeam,
      wireEdgeImg: wireEdgeImgRef.current,
      trenchImg: trenchImgRef.current,
      antiTankImg: antiTankImgRef.current,
      dotImg: dotImgRef.current,
      storageImg: storageImgRef.current,
      pontonImg: pontonImgRef.current,
      pontonStageImgs: pontonStageImgRef.current,
      smokeImg: smokeImgRef.current,
      viewerBattleFaction,
      battleFogRevealedCellIds,
      extraHiddenInstanceIds: hiddenBattleInstanceIdSet,
    })
  }

  useEffect(() => {
    const handleClickOutside = () => {
      if (artilleryFacingPick || dotFacingPick) return
      if (unitMenu) {
        setUnitMenu(null)
      }
      if (cellMenu) {
        setCellMenu(null)
      }
    }

    if (mode === 'editor' && !lobbyPreview) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [unitMenu, cellMenu, mode, lobbyPreview, artilleryFacingPick, dotFacingPick])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const cancelHold = () => clearHoldTimer()
    el.addEventListener('scroll', cancelHold, { passive: true })
    return () => {
      el.removeEventListener('scroll', cancelHold)
      clearHoldTimer()
    }
  }, [])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if (hoverOverlayOnly) {
        draw({ hoverC: null, hoverU: null, target: ensureBaseCanvas() })
        paintHoverOverlay()
      } else {
        draw()
      }
    })
    return () => {
      window.cancelAnimationFrame(id)
    }
  }, [
    cells,
    unitMenu,
    mode,
    lobbyPreview,
    viewerBattleFaction,
    viewerBattleTeam,
    hoverPath,
    hoverPathIsAirMission,
    moveReachableCellIds,
    defendFacingPickCellIds,
    battleDefendHover,
    battleFireTargetInstanceIds,
    battleAreaFireCellIds,
    battleDotSectorCellIds,
    enterDotGlowCellIds,
    loadingSupGlowCellIds,
    battlePendingShootPreview,
    battlePendingOrderHover,
    battleFogRevealedCellIds,
    battleReportReplayHighlight,
    battleLogisticsPickInstanceIds,
    battleUnloadCellIds,
    battleAirDepartureHoverCellId,
    battleAirDeparturePickCellId,
    battleAirMissionPreview,
    battlePatrolVisibilityCellIds,
    battlePatrolCenterCellId,
    battleAirInterceptionTargets,
    patrolRangePickCellIds,
    reconRangePickCellIds,
    battleReconHoverAreaCellIds,
    battleReconHoverCenterCellId,
    battleReconHoverUnitInstanceId,
    battleReconHoverOrderKey,
    battleBombardmentAreaCellIds,
    bombardmentDirectionPickCellIds,
    bombardmentApproachCellId,
    battleLogisticsUnitDecal,
    battlePendingLogisticsPreview,
    battleAirUnitsInFlight,
    editorAviationEdgeHighlight,
    editorAviationEdgeCellIds,
    editorDeployZones,
    editorDeployBrushTeam,
    editorFacingPickCellIds,
    artilleryFacingPick,
    dotFacingPick,
    width,
    height,
    cellSize,
    textureVersion,
    hiddenBattleInstanceIdSet,
    hoverOverlayOnly,
  ])

  useEffect(() => {
    if (!hoverOverlayOnly) {
      const id = window.requestAnimationFrame(() => {
        draw()
      })
      return () => window.cancelAnimationFrame(id)
    }
    const id = window.requestAnimationFrame(() => {
      paintHoverOverlay()
    })
    return () => window.cancelAnimationFrame(id)
  }, [hoverCell, hoveredUnit, hoverOverlayOnly])

  return (
    <div
      ref={wrapRef}
      className={wrapClassName}
      style={{
        position: 'relative',
        overflow: lobbyPreview ? 'hidden' : mode === 'battle' ? undefined : 'visible',
        overflowY: mode === 'battle' ? 'auto' : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
        style={suppressPointerHoverTips ? { touchAction: 'manipulation' } : undefined}
      />
      <CellContextMenus
        mode={mode}
        lobbyPreview={lobbyPreview}
        unitMenu={
          unitMenu
            ? {
                ...unitMenu,
                cell: cells.find((c) => c.id === unitMenu.cell.id) ?? unitMenu.cell,
              }
            : null
        }
        cellMenu={
          cellMenu
            ? {
                ...cellMenu,
                cell: cells.find((c) => c.id === cellMenu.cell.id) ?? cellMenu.cell,
              }
            : null
        }
        onDeleteUnit={handleDeleteUnit}
        onEditorCellPatch={onEditorCellPatch}
        editorCatalogUnits={editorCatalogUnits}
        editorTeamLimit={editorTeamLimit}
        onEditorUnitPatch={onEditorUnitPatch}
        artilleryFacingPick={artilleryFacingPick}
        onStartArtilleryFacingPick={onStartArtilleryFacingPick}
        onCancelArtilleryFacingPick={onCancelArtilleryFacingPick}
        onStartDotFacingPick={onStartDotFacingPick}
        onCloseUnitMenu={() => setUnitMenu(null)}
        onCloseCellMenu={() => setCellMenu(null)}
      />
    </div>
  )
}

export default Cells
import React, { useRef, useEffect, useState, useMemo } from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import type { LobbyFaction } from '../../api/rooms'
import type { AirInterceptionTarget, AirUnitInFlight } from '../../game/battleAirSupport'
import cursorPointer from '../../img/cursors/cursorPointer.cur'
import {
  cellHasEditorPlacement,
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
import CellContextMenus from './CellContextMenus'
import type { EditorMapCatalogUnitPick } from './EditorMapUnitOrderMenu'
import { useCellsAssets } from './useCellsAssets'

export interface BattlePendingShootPreview {
  targetInstanceId?: number
  targetCellId?: number
  orderKey: 'fire' | 'fireHard' | 'attack'
}

export interface BattlePendingLogisticsPreview {
  kind: 'tow' | 'loading' | 'getSup' | 'unloading'
  targetInstanceId?: number
  targetCellId?: number
}

export interface BattleReportReplayHighlight {
  glowInstanceIds: number[]
  targetDecal?: {
    orderKey: 'fire' | 'fireHard' | 'attack' | 'tow' | 'loading' | 'getSup'
    
    targetInstanceIds: number[]
  }
  unloadCellDecalId?: number
  lossCellId?: number
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
  onUnitDelete?: (unitInstanceId: number, cell: Cell) => void

  onCellHover?: (cell: Cell | null, event: React.MouseEvent<HTMLCanvasElement>) => void
  onCellLeave?: () => void
  hoverPath?: Cell[] | null
  /** Рисовать траекторию как авиацию (линия), без иконок походного приказа */
  hoverPathIsAirMission?: boolean
  moveReachableCellIds?: number[] | null
  defendFacingPickCellIds?: number[] | null
  battleDefendHover?: BattleDefendHoverState | null
  battleFireTargetInstanceIds?: number[] | null
  battleAreaFireCellIds?: number[] | null
  battleDotSectorCellIds?: number[] | null
  enterDotGlowCellIds?: number[] | null
  battlePendingShootPreview?: BattlePendingShootPreview | null
  battleFogRevealedCellIds?: number[] | null
  battleReportReplayHighlight?: BattleReportReplayHighlight | null
  battleLogisticsPickInstanceIds?: number[] | null
  battleUnloadCellIds?: number[] | null
  /** Гекс вылета: красная подсветка гекса и иконка (панель). */
  battleAirDepartureHoverCellId?: number | null
  /** Гекс вылета при выборе авиаприказа: красный гекс и иконка. */
  battleAirDeparturePickCellId?: number | null
  /** Цель авиаприказа в превью — только иконка приказа на гексе. */
  battleAirMissionPreview?: { targetCellId: number; orderKey: string } | null
  /** Зона патрулирования: клетки в радиусе видимости от точки патруля. */
  battlePatrolVisibilityCellIds?: number[] | null
  /** Центр зоны патрулирования (точка патруля). */
  battlePatrolCenterCellId?: number | null
  /** Патруль: клетки для выбора радиуса зоны. */
  patrolRangePickCellIds?: number[] | null
  /** Область бомбардировки при наведении на цель. */
  battleBombardmentAreaCellIds?: number[] | null
  /** Бомбардировка: соседние гексы цели — выбор стороны захода. */
  bombardmentDirectionPickCellIds?: number[] | null
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
  /** Обновление данных ячейки из контекстного меню (hexExtra и т.д.) */
  onEditorCellPatch?: (cellId: number, patch: (cell: Cell) => Cell) => void
  editorCatalogUnits?: EditorMapCatalogUnitPick[]
  editorTeamLimit?: 2 | 4 | 6
  onEditorUnitPatch?: (
    cellId: number,
    unitInstanceId: number,
    patch: (unit: Record<string, unknown>) => Record<string, unknown>,
  ) => void
  editorFacingPickCellIds?: number[] | null
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
  battlePendingShootPreview = null,
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
  battleBombardmentAreaCellIds = null,
  bombardmentDirectionPickCellIds = null,
  bombardmentApproachCellId = null,
  battleLogisticsUnitDecal = null,
  battlePendingLogisticsPreview = null,
  battleAirInterceptionTargets = null,
  battleAirUnitsInFlight = [],
  editorAviationEdgeHighlight = false,
  editorAviationEdgeCellIds,
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
  const unloadCellDecalImgRef = assets.refs.unloadCellDecalImgRef
  const deployOrderDecalImgRef = assets.refs.deployOrderDecalImgRef
  const changeSectorOrderDecalImgRef = assets.refs.changeSectorOrderDecalImgRef
  const clottingOrderDecalImgRef = assets.refs.clottingOrderDecalImgRef
  const fireSupIconImgRef = assets.refs.fireSupIconImgRef
  const airMissionOrderDecalImgRef = assets.refs.airMissionOrderDecalImgRef
  const airDepartureDecalImgRef = assets.refs.airDepartureDecalImgRef
  const fireAirGunDecalImgRef = assets.refs.fireAirGunDecalImgRef
  const wireEdgeImgRef = assets.refs.wireEdgeImgRef
  const trenchImgRef = assets.refs.trenchImgRef
  const antiTankImgRef = assets.refs.antiTankImgRef
  const dotImgRef = assets.refs.dotImgRef
  const storageImgRef = assets.refs.storageImgRef
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  const [hoveredUnit, setHoveredUnit] = useState<HoveredUnitState | null>(null)
  const [unitMenu, setUnitMenu] = useState<UnitMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<CellMenuState | null>(null)

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
    return !battleFogRevealedCellIds.includes(cell.id)
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

    if (unitUnderMouse) {
      setHoveredUnit(unitUnderMouse)
      setHoverCell(unitUnderMouse.cell)
      if (canvasRef.current) {
        canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : hoverCursor
      }

      if (onCellHover) {
        onCellHover(unitUnderMouse.cell, e)
      }

      if (onUnitHover) {
        onUnitHover(unitUnderMouse.unit, unitUnderMouse.cell, e)
      }
    } else {
      setHoveredUnit(null)
      
      if (onUnitLeave) {
        onUnitLeave()
      }
      
      const cellUnderMouse = cellAtPointer
      setHoverCell(cellUnderMouse)

      if (onCellHover) {
        onCellHover(cellUnderMouse, e)
      }
      
      if (canvasRef.current) {
        if (lobbyPreview) {
          canvasRef.current.style.cursor = 'default'
        } else if (cellUnderMouse) {
          canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : hoverCursor
        } else {
          canvasRef.current.style.cursor = mode === 'editor' ? editorHoverCursor : 'default'
        }
      }
    }
    
    draw()
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverCell(null)
    setHoveredUnit(null)
    if (onCellHover) {
      onCellHover(null, e)
    }
    if (onCellLeave) {
      onCellLeave()
    }
    if (onUnitLeave) {
      onUnitLeave()
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = mode === 'editor' ? `url(${cursorPointer}), pointer` : 'default'
    }
    draw()
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
        onCellClick(
          cellAtPointer ?? unitUnderMouse.cell,
          unitUnderMouse.unit.instanceId || unitUnderMouse.unit.id,
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
      editorFacingPickCellIds.includes(cell.id) &&
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

  const drawUnits = (ctx: CanvasRenderingContext2D, cell: Cell, center: { x: number, y: number }) => {
    drawUnitsOnCell(ctx, {
      cell,
      center,
      cellSize,
      lobbyPreview,
      mode,
      viewerBattleFaction,
      viewerBattleTeam,
      hoveredUnit,
      battleFireTargetInstanceIds,
      battleLogisticsPickInstanceIds,
      battlePendingLogisticsPreview,
      battleReportReplayHighlight,
      battlePendingShootPreview,
      battleLogisticsUnitDecal,
      battleDefendHover,
      shootOrderDecalImgRef,
      logisticsUnitDecalImgRef,
      defendOrderDecalImgRef,
      ambushOrderDecalImgRef,
      fireSupIconImgRef,
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
      const hoveredIdRaw = hoveredUnit?.unit?.instanceId
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

  const draw = () => {
    drawCellsCanvas({
      canvas: canvasRef.current,
      width,
      height,
      cellSize,
      mode,
      lobbyPreview,
      cells,
      hoverCell,
      hoveredUnit,
      moveReachableCellIds,
      defendFacingPickCellIds:
        mode === 'editor' && editorFacingPickCellIds?.length
          ? editorFacingPickCellIds
          : defendFacingPickCellIds,
      battleDefendHover,
      battleAreaFireCellIds,
      battleDotSectorCellIds,
      enterDotGlowCellIds,
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
      battleBombardmentAreaCellIds,
      bombardmentDirectionPickCellIds,
      bombardmentApproachCellId,
      battlePendingLogisticsPreview,
      battlePendingShootPreview,
      getCellCenter,
      getCellCorners,
      getTexture,
      resolveEditorCachedImage,
      drawUnits,
      drawPath,
      deployOrderDecalImg: deployOrderDecalImgRef.current,
      changeSectorOrderDecalImg: changeSectorOrderDecalImgRef.current,
      clottingOrderDecalImg: clottingOrderDecalImgRef.current,
      unloadCellDecalImg: unloadCellDecalImgRef.current,
      shootOrderDecals: shootOrderDecalImgRef.current,
      airMissionOrderDecals: airMissionOrderDecalImgRef.current,
      airDepartureDecalImg: airDepartureDecalImgRef.current,
      fireAirGunDecalImg: fireAirGunDecalImgRef.current,
      editorAviationEdgeHighlight,
      editorAviationEdgeCellIds,
      wireEdgeImg: wireEdgeImgRef.current,
      trenchImg: trenchImgRef.current,
      antiTankImg: antiTankImgRef.current,
      dotImg: dotImgRef.current,
      storageImg: storageImgRef.current,
      viewerBattleFaction,
      battleFogRevealedCellIds,
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
    draw()
  }, [
    cells,
    hoverCell,
    hoveredUnit,
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
    battlePendingShootPreview,
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
    battleBombardmentAreaCellIds,
    bombardmentDirectionPickCellIds,
    bombardmentApproachCellId,
    battleLogisticsUnitDecal,
    battlePendingLogisticsPreview,
    battleAirInterceptionTargets,
    battleAirUnitsInFlight,
    editorAviationEdgeHighlight,
    editorAviationEdgeCellIds,
    editorFacingPickCellIds,
    artilleryFacingPick,
    dotFacingPick,
    width,
    height,
    cellSize,
    textureVersion,
    hiddenBattleInstanceIdSet,
  ])

  return (
    <div
      ref={wrapRef}
      className={wrapClassName}
      style={{ position: 'relative', overflow: lobbyPreview ? 'hidden' : 'visible' }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
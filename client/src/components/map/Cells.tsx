import React, { useRef, useEffect, useState } from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import type { LobbyFaction } from '../../api/rooms'
import cursorPointer from '../../img/cursors/cursorPointer.cur'
import {
  cellHasEditorPlacement,
} from './cellsDrawBase'
import {
  clientToCanvas as toCanvasPoint,
  findCellAtPosition as findCellAtCanvasPosition,
  findUnitAtPosition as findUnitAtCanvasPosition,
  getCellCenter as getHexCellCenter,
  getCellCorners as getHexCellCorners,
} from './cellsInteraction'
import { drawPathOverlay } from './cellsDrawOverlays'
import { drawUnitsOnCell } from './cellsDrawUnits'
import { drawCellsCanvas } from './cellsDraw'
import CellContextMenus from './CellContextMenus'
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
  battleHoverCursor?: string
  wrapClassName?: string
  onCellClick?: (cell: Cell, unitId?: number) => void  
  onUnitClick?: (unit: any, cell: Cell, event: React.MouseEvent) => void
  onUnitHover?: (unit: any, cell: Cell, event: React.MouseEvent) => void
  onUnitLeave?: () => void
  onUnitDelete?: (unitInstanceId: number, cell: Cell) => void

  onCellHover?: (cell: Cell | null, event: React.MouseEvent<HTMLCanvasElement>) => void
  onCellLeave?: () => void
  hoverPath?: Cell[] | null
  moveReachableCellIds?: number[] | null
  defendFacingPickCellIds?: number[] | null
  battleDefendHover?: BattleDefendHoverState | null
  battleFireTargetInstanceIds?: number[] | null
  battleAreaFireCellIds?: number[] | null
  battlePendingShootPreview?: BattlePendingShootPreview | null
  battleFogRevealedCellIds?: number[] | null
  battleReportReplayHighlight?: BattleReportReplayHighlight | null
  battleLogisticsPickInstanceIds?: number[] | null
  battleUnloadCellIds?: number[] | null
  battleLogisticsUnitDecal?: { orderKey: 'tow' | 'loading'; targetInstanceIds: number[] } | null
  battlePendingLogisticsPreview?: BattlePendingLogisticsPreview | null
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
  battleHoverCursor,
  onCellClick,
  onUnitClick,
  onUnitHover,
  onUnitLeave,
  onUnitDelete,
  onCellHover,
  onCellLeave,
  hoverPath,
  moveReachableCellIds = null,
  defendFacingPickCellIds = null,
  battleDefendHover = null,
  battleFireTargetInstanceIds = null,
  battleAreaFireCellIds = null,
  battlePendingShootPreview = null,
  battleFogRevealedCellIds = null,
  battleReportReplayHighlight = null,
  battleLogisticsPickInstanceIds = null,
  battleUnloadCellIds = null,
  battleLogisticsUnitDecal = null,
  battlePendingLogisticsPreview = null,
  wrapClassName,
}) => {
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

  const findUnitAtPosition = (mouseX: number, mouseY: number) =>
    findUnitAtCanvasPosition(cells, mouseX, mouseY, {
      lobbyPreview,
      mode,
      cellSize,
      width,
      height,
      isEnemyUnitHiddenByFog,
    })

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cells.length || lobbyPreview) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const point = toCanvasPoint(e.clientX, e.clientY, rect, canvasRef.current)
    const x = point.x
    const y = point.y

    const unitUnderMouse = findUnitAtPosition(x, y)

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
      
      const cellUnderMouse = findCellAtPosition(x, y)
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

  const unitUnderMouse = findUnitAtPosition(x, y)
  
  if (unitUnderMouse) {
    e.stopPropagation()
    if (mode === 'editor') {
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
        onCellClick(unitUnderMouse.cell, unitUnderMouse.unit.id || unitUnderMouse.unit.instanceId)
      }
    }
  } else {
    setUnitMenu(null)
    const cell = findCellAtPosition(x, y)
    const showCellIdMenu =
      mode === 'editor' && cell && cellHasEditorPlacement(cell) && !hideEditorCellHexMenu
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
      onCellClick(cell)
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
    })
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
      defendFacingPickCellIds,
      battleDefendHover,
      battleAreaFireCellIds,
      battleReportReplayHighlight,
      battleUnloadCellIds,
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
    })
  }

  useEffect(() => {
    const handleClickOutside = () => {
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
  }, [unitMenu, cellMenu, mode, lobbyPreview])

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
    hoverPath,
    moveReachableCellIds,
    defendFacingPickCellIds,
    battleDefendHover,
    battleFireTargetInstanceIds,
    battleAreaFireCellIds,
    battlePendingShootPreview,
    battleFogRevealedCellIds,
    battleReportReplayHighlight,
    battleLogisticsPickInstanceIds,
    battleUnloadCellIds,
    battleLogisticsUnitDecal,
    battlePendingLogisticsPreview,
    width,
    height,
    cellSize,
    textureVersion,
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
        unitMenu={unitMenu}
        cellMenu={cellMenu}
        onDeleteUnit={handleDeleteUnit}
      />
    </div>
  )
}

export default Cells
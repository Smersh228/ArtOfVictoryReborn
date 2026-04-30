import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { drawImageCoverInCircle, getTerrainColor, traceHexPath } from './cellsDrawBase'

interface CachedImageState {
  ready: HTMLImageElement | null
  pending: boolean
  noUrl: boolean
}

interface DrawUnitFn {
  (ctx: CanvasRenderingContext2D, cell: Cell, center: { x: number; y: number }): void
}

interface DrawPathFn {
  (ctx: CanvasRenderingContext2D): void
}

interface ShootOrderDecals {
  fire?: HTMLImageElement
  fireHard?: HTMLImageElement
  attack?: HTMLImageElement
}

interface MapBuildingLite {
  name?: string
  imagePath?: string
}

interface CellExtras {
  img?: string
  mapBuilding?: MapBuildingLite
}

const mapBuildingColors = {
  wallStroke: '#3e2723',
  wallFill: 'saddlebrown',
  labelText: 'white',
}

function drawMapBuilding(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    mode: 'editor' | 'battle'
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
  },
) {
  const { cell, center, cellSize, mode, resolveEditorCachedImage } = params
  const cellExtras = cell as CellExtras
  const mapBuilding = cellExtras.mapBuilding
  if (!mapBuilding || (mode !== 'editor' && mode !== 'battle')) {
    return
  }

  const bState = mapBuilding.imagePath ? resolveEditorCachedImage(mapBuilding.imagePath) : { ready: null, pending: false, noUrl: true }

  if (bState.ready) {
    const bw = cellSize * 1.15
    ctx.drawImage(bState.ready, center.x - bw / 2, center.y - bw / 2, bw, bw)
    return
  }

  const showPlaceholder = !bState.pending && (bState.noUrl || !bState.ready)
  if (!showPlaceholder) {
    return
  }

  ctx.save()
  ctx.fillStyle = mapBuildingColors.wallFill
  ctx.strokeStyle = mapBuildingColors.wallStroke
  ctx.lineWidth = 1
  const bx = center.x - 16
  const by = center.y + 14
  ctx.fillRect(bx, by, 32, 16)
  ctx.strokeRect(bx, by, 32, 16)
  ctx.fillStyle = mapBuildingColors.labelText
  ctx.font = '9px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = mapBuilding.name ? mapBuilding.name.slice(0, 6) : '—'
  ctx.fillText(label, center.x, by + 8)
  ctx.restore()
}

export function drawCellsCanvas(params: {
  canvas: HTMLCanvasElement | null
  width: number
  height: number
  cellSize: number
  mode: 'editor' | 'battle'
  lobbyPreview: boolean
  cells: Cell[]
  hoverCell: Cell | null
  hoveredUnit: { cell: Cell; unit: any; index: number } | null
  moveReachableCellIds: number[] | null
  defendFacingPickCellIds: number[] | null
  battleDefendHover: any
  battleAreaFireCellIds: number[] | null
  battleReportReplayHighlight: any
  battleUnloadCellIds: number[] | null
  battlePendingLogisticsPreview: any
  battlePendingShootPreview: any
  getCellCenter: (q: number, r: number) => { x: number; y: number }
  getCellCorners: (x: number, y: number) => { x: number; y: number }[]
  getTexture: (path: string | null | undefined) => HTMLImageElement | null
  resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
  drawUnits: DrawUnitFn
  drawPath: DrawPathFn
  deployOrderDecalImg: HTMLImageElement | null
  changeSectorOrderDecalImg: HTMLImageElement | null
  clottingOrderDecalImg: HTMLImageElement | null
  unloadCellDecalImg: HTMLImageElement | null
  shootOrderDecals: ShootOrderDecals
}) {
  const {
    canvas,
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
    deployOrderDecalImg,
    changeSectorOrderDecalImg,
    clottingOrderDecalImg,
    unloadCellDecalImg,
    shootOrderDecals,
  } = params

  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)

  const defendHoverSectorIds =
    mode === 'battle' && battleDefendHover && battleDefendHover.sectorCellIds.length
      ? battleDefendHover.showSectorWithoutUnitHover === true ||
        (hoveredUnit && hoveredUnit.unit.instanceId == battleDefendHover.unitInstanceId)
        ? battleDefendHover.sectorCellIds
        : null
      : null

  const defendCommitPreviewIds =
    mode === 'battle' &&
    battleDefendHover?.commitPreviewSectorCellIds &&
    battleDefendHover.commitPreviewSectorCellIds.length
      ? battleDefendHover.commitPreviewSectorCellIds
      : null

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    const cell = cells[cellIndex]
    const center = getCellCenter(cell.coor.x, cell.coor.z)
    const corners = getCellCorners(center.x, center.y)

    if (mode === 'editor') {
      const imgPath = (cell as CellExtras).img
      const hexTex = imgPath ? getTexture(imgPath) : null
      ctx.save()
      ctx.beginPath()
      traceHexPath(ctx, corners)
      if (hexTex) {
        ctx.clip()
        drawImageCoverInCircle(ctx, hexTex, center.x, center.y, cellSize * 0.92)
      }
      ctx.restore()

      ctx.beginPath()
      traceHexPath(ctx, corners)
      if (cell.highlight) {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.25)'
        ctx.fill()
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 3
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (!lobbyPreview) {
        const idLabel = `${cell.id}`
        ctx.font = 'bold 13px "Courier New", Courier, monospace'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.lineWidth = 3
        ctx.strokeText(idLabel, center.x, center.y - 20)
        ctx.fillStyle = '#000000'
        ctx.fillText(idLabel, center.x, center.y - 20)
      }

      if (hoverCell?.id === cell.id && !hoveredUnit && !cell.highlight) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(234, 179, 0, 0.95)'
        ctx.lineWidth = 3
        ctx.stroke()
      }
    } else {
      const imgPathBattle = (cell as CellExtras).img
      const hexTexBattle = imgPathBattle ? getTexture(imgPathBattle) : null
      ctx.beginPath()
      traceHexPath(ctx, corners)
      if (hexTexBattle) {
        ctx.save()
        ctx.clip()
        drawImageCoverInCircle(ctx, hexTexBattle, center.x, center.y, cellSize * 0.92)
        ctx.restore()
        ctx.beginPath()
        traceHexPath(ctx, corners)
      } else {
        ctx.fillStyle = getTerrainColor(cell.type)
        ctx.fill()
      }

      if (cell.highlight) {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.3)'
        ctx.fill()
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 3
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'black'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      const showBattleHexHoverRing =
        hoverCell?.id === cell.id &&
        !hoveredUnit &&
        !cell.highlight &&
        !(mode === 'battle' && moveReachableCellIds && moveReachableCellIds.length > 0) &&
        !(mode === 'battle' && defendFacingPickCellIds && defendFacingPickCellIds.length > 0) &&
        !(mode === 'battle' && battleUnloadCellIds && battleUnloadCellIds.length > 0) &&
        !(mode === 'battle' && battleAreaFireCellIds && battleAreaFireCellIds.length > 0)

      if (showBattleHexHoverRing) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'yellow'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      if (moveReachableCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
      }

      if (defendFacingPickCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
      }

      if (battleUnloadCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
      }

      if (battleAreaFireCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(200, 72, 72, 0.26)'
        ctx.fill()
      }
      if (battleReportReplayHighlight?.lossCellId === cell.id) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(210, 40, 40, 0.32)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(170, 24, 24, 0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      if (defendHoverSectorIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(150, 155, 175, 0.44)'
        ctx.fill()
      }

      if (defendCommitPreviewIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(72, 160, 120, 0.42)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(40, 120, 85, 0.75)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    drawUnits(ctx, cell, center)

    if (mode === 'battle' && battleDefendHover && cell.id === battleDefendHover.facingCellId) {
      if (battleDefendHover.facingDecal === 'deploy') {
        if (deployOrderDecalImg?.naturalWidth) {
          const r = Math.max(8, cellSize * 0.14)
          ctx.save()
          drawImageCoverInCircle(ctx, deployOrderDecalImg, center.x, center.y, r)
          ctx.restore()
        }
      } else if (battleDefendHover.facingDecal === 'changeSector') {
        if (changeSectorOrderDecalImg?.naturalWidth) {
          const r = Math.max(8, cellSize * 0.14)
          ctx.save()
          drawImageCoverInCircle(ctx, changeSectorOrderDecalImg, center.x, center.y, r)
          ctx.restore()
        }
      }
    }

    if (
      mode === 'battle' &&
      battleDefendHover?.showDeployDecalOnUnit === true &&
      battleDefendHover.unitStandingCellId != null &&
      cell.id === battleDefendHover.unitStandingCellId
    ) {
      if (deployOrderDecalImg?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.14)
        ctx.save()
        drawImageCoverInCircle(ctx, deployOrderDecalImg, center.x, center.y, r)
        ctx.restore()
      }
    }

    if (
      mode === 'battle' &&
      battleDefendHover?.showClottingDecalOnUnit === true &&
      battleDefendHover.unitStandingCellId != null &&
      cell.id === battleDefendHover.unitStandingCellId
    ) {
      if (clottingOrderDecalImg?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.14)
        ctx.save()
        drawImageCoverInCircle(ctx, clottingOrderDecalImg, center.x, center.y, r)
        ctx.restore()
      }
    }

    if (
      mode === 'battle' &&
      ((battlePendingLogisticsPreview?.kind === 'unloading' &&
        battlePendingLogisticsPreview.targetCellId === cell.id) ||
        battleReportReplayHighlight?.unloadCellDecalId === cell.id)
    ) {
      if (unloadCellDecalImg?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.14)
        ctx.save()
        drawImageCoverInCircle(ctx, unloadCellDecalImg, center.x, center.y, r)
        ctx.restore()
      }
    }
    if (
      mode === 'battle' &&
      battlePendingShootPreview &&
      'targetCellId' in battlePendingShootPreview &&
      cell.id === battlePendingShootPreview.targetCellId
    ) {
      const afKey = battlePendingShootPreview.orderKey as 'fire' | 'fireHard'
      const afDecal = shootOrderDecals[afKey]
      if (afDecal?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.14)
        ctx.save()
        drawImageCoverInCircle(ctx, afDecal, center.x, center.y, r)
        ctx.restore()
      }
    }

    drawMapBuilding(ctx, { cell, center, cellSize, mode, resolveEditorCachedImage })
  }

  drawPath(ctx)
}

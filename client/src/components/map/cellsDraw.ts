import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import {
  buildCellByCubeKey,
  effectiveElevationLevel,
  elevationEdgeDrawMask,
  strokeHexEdges,
} from '../../game/cellElevation'
import {
  battleEmptyDotDropShadowFilter,
  battleHoverDropShadowFilter,
  dotDrawLayout,
  drawImageCoverInCircle,
  drawImageCoverInCircleWithTransform,
  getTerrainColor,
  hexSharesDotWithUnits,
  traceHexPath,
} from './cellsDrawBase'
import { hexTerrainImagePath } from '../../game/cellHexTexture'
import { readTileMirror, readTileRotationSteps, tileRotationRadians } from '../../game/cellTileTransform'
import { deployZoneStyle } from '../../game/editorMapDeployment'
import {
  getWireEdgesMask,
  WIRE_DRAW_BAND_RATIO,
  WIRE_SPRITE_URL,
} from '../../game/cellWireEdges'
import {
  DOT_SPRITE_URL,
  STORAGE_SPRITE_URL,
  ANTITANK_SPRITE_URL,
  TRENCH_SPRITE_URL,
  PONTON_SPRITE_URL,
  ensureCellBuilds,
  hasMineOnCell,
  isMineVisibleOnBattleMap,
} from '../../game/editorMapFortifications'
import { dotOccupancySide, hasDotOnCell, unitInDot } from '../../game/cellDot'
import { battleUnitsVisibleOnMap } from '../../game/battleAirSupport'
import type { LobbyFaction } from '../../api/rooms'
import { getTrenchEdgesMask } from '../../game/cellTrenchEdges'
import { getAntiTankEdgesMask } from '../../game/cellAntiTankEdges'
import { cellHasWarehouse, isLoadingSupHoverLink } from '../../game/battleLogisticsUi'
import { hasPontonOnCell, pontonStageIndex } from '../../game/cellPonton'
import { hasSmokeOnCell, SMOKE_SPRITE_URL } from '../../game/cellSmoke'
import {
  hasSettlementFire,
  isSettlementDestroyedHex,
  settlementFireMarkers,
  SETTLEMENT_FIRE_SPRITE_URL,
} from '../../game/cellSettlementFire'
import { isRailwayDestroyedHex } from '../../game/cellRailway'
import type { BattlePendingOrderHover } from '../../game/battlePendingOrderHover'

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
  hardMove?: HTMLImageElement
}

interface MapBuildingLite {
  name?: string
  imagePath?: string
}

interface CellExtras {
  img?: string
  mapBuilding?: MapBuildingLite
  hexExtra?: Record<string, unknown>
}

/** Контур по возвышенности: 1 — голубой, 2 — жёлтый, 3 — красный (0 и −1 — без цветного контура). */
function elevationStrokeForLevel(level: number): { stroke: string; lineWidth: number } | null {
  if (level === 3) return { stroke: '#e53935', lineWidth: 3 }
  if (level === 2) return { stroke: '#ffea00', lineWidth: 3 }
  if (level === 1) return { stroke: '#00bfff', lineWidth: 3 }
  return null
}

const mapBuildingColors = {
  wallStroke: '#3e2723',
  wallFill: 'saddlebrown',
  labelText: 'white',
}

function drawAirDepartureMarker(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  cellSize: number,
  airDepartureDecalImg: HTMLImageElement | null | undefined,
) {
  const r = Math.max(8, cellSize * 0.15)
  ctx.save()
  if (airDepartureDecalImg?.naturalWidth) {
    drawImageCoverInCircle(ctx, airDepartureDecalImg, center.x, center.y, r)
  } else {
    const pr = Math.max(6, Math.min(14, cellSize * 0.14))
    ctx.fillStyle = 'rgba(211, 32, 32, 0.98)'
    ctx.beginPath()
    ctx.arc(center.x, center.y, pr, 0, 2 * Math.PI)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 245, 245, 0.95)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}

function drawAirMissionOrderDecal(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  cellSize: number,
  orderKey: string,
  airMissionOrderDecals: Record<string, HTMLImageElement>,
) {
  const key = String(orderKey || '').trim()
  const airDecal = key ? airMissionOrderDecals[key] : undefined
  const r = Math.max(8, cellSize * 0.15)
  ctx.save()
  if (airDecal?.naturalWidth) {
    drawImageCoverInCircle(ctx, airDecal, center.x, center.y, r)
  } else {
    ctx.fillStyle = 'rgba(46, 125, 50, 0.92)'
    ctx.beginPath()
    ctx.arc(center.x, center.y, Math.max(9, cellSize * 0.13), 0, 2 * Math.PI)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200, 230, 200, 0.95)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.font = `${Math.max(11, Math.round(cellSize * 0.26))}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✈', center.x, center.y + 1)
  }
  ctx.restore()
}

function drawHexEdgeStrip(
  ctx: CanvasRenderingContext2D,
  params: {
    center: { x: number; y: number }
    corners: { x: number; y: number }[]
    edgeIndex: number
    img: HTMLImageElement
    bandRatio: number
    /** true — весь PNG (после ресайза в редакторе без угадывания полосы) */
    useFullImage?: boolean
    bandFrom?: 'top' | 'bottom'
    bandOffsetRatio?: number
    widthScale?: number
    /** Сдвиг к центру гекса, доля от высоты спрайта */
    inwardInset?: number
    align?: 'bottom' | 'center'
  },
) {
  const {
    center,
    corners,
    edgeIndex,
    img,
    bandRatio,
    useFullImage = false,
    bandFrom = 'bottom',
    bandOffsetRatio = 0,
    widthScale = 1.25,
    inwardInset = 0,
    align = 'bottom',
  } = params
  const a = corners[edgeIndex]
  const b = corners[(edgeIndex + 1) % 6]
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
  const edgeAngle = Math.atan2(b.y - a.y, b.x - a.x)

  const sw = img.naturalWidth
  const sh = img.naturalHeight
  const srcH = useFullImage ? sh : Math.max(4, Math.floor(sh * bandRatio))
  const srcY = useFullImage
    ? 0
    : bandFrom === 'top'
      ? Math.max(0, Math.min(sh - srcH, Math.floor(sh * bandOffsetRatio)))
      : sh - srcH
  const drawW = edgeLen * widthScale
  const drawH = drawW * (srcH / sw)

  let px = mx
  let py = my
  if (inwardInset > 0) {
    const inX = center.x - mx
    const inY = center.y - my
    const inLen = Math.hypot(inX, inY) || 1
    const shift = drawH * inwardInset
    px += (inX / inLen) * shift
    py += (inY / inLen) * shift
  }

  ctx.translate(px, py)
  ctx.rotate(edgeAngle)
  if (align === 'center') {
    ctx.drawImage(img, 0, srcY, sw, srcH, -drawW / 2, -drawH / 2, drawW, drawH)
    return
  }
  const localCenterY = -(center.x - mx) * Math.sin(edgeAngle) + (center.y - my) * Math.cos(edgeAngle)
  if (localCenterY >= 0) ctx.scale(1, -1)
  ctx.drawImage(img, 0, srcY, sw, srcH, -drawW / 2, -drawH, drawW, drawH)
}

function drawHexEdgeIcon(
  ctx: CanvasRenderingContext2D,
  params: {
    center: { x: number; y: number }
    corners: { x: number; y: number }[]
    edgeIndex: number
    img: HTMLImageElement
    cellSize: number
    iconScale?: number
    inwardRatio?: number
  },
) {
  const { center, corners, edgeIndex, img, cellSize, iconScale = 0.36, inwardRatio = 0.14 } = params
  const a = corners[edgeIndex]
  const b = corners[(edgeIndex + 1) % 6]
  let mx = (a.x + b.x) / 2
  let my = (a.y + b.y) / 2
  const inX = center.x - mx
  const inY = center.y - my
  const inLen = Math.hypot(inX, inY) || 1
  mx += (inX / inLen) * cellSize * inwardRatio
  my += (inY / inLen) * cellSize * inwardRatio
  const edgeAngle = Math.atan2(b.y - a.y, b.x - a.x)
  const size = cellSize * iconScale
  ctx.translate(mx, my)
  ctx.rotate(edgeAngle)
  ctx.drawImage(img, -size / 2, -size * 0.85, size, size)
}

function drawCenterFortification(
  ctx: CanvasRenderingContext2D,
  params: {
    center: { x: number; y: number }
    cellSize: number
    img: HTMLImageElement
    scale?: number
    offsetX?: number
    offsetY?: number
  },
) {
  const { center, cellSize, img, scale = 0.88, offsetX = 0, offsetY = 0 } = params
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  if (!sw || !sh) return
  const maxDim = cellSize * scale
  const aspect = sw / sh
  const drawW = aspect >= 1 ? maxDim : maxDim * aspect
  const drawH = aspect >= 1 ? maxDim / aspect : maxDim
  ctx.drawImage(img, center.x - drawW / 2 + offsetX, center.y - drawH / 2 + offsetY, drawW, drawH)
}

function drawWireEdges(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    getCellCorners: (x: number, y: number) => { x: number; y: number }[]
    wireEdgeImg?: HTMLImageElement | null
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
  },
) {
  const { cell, center, cellSize, getCellCorners, wireEdgeImg, resolveEditorCachedImage } = params
  const mask = getWireEdgesMask(cell.builds)
  if (!mask) return

  const corners = getCellCorners(center.x, center.y)

  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue

    const img =
      wireEdgeImg?.complete && wireEdgeImg?.naturalWidth
        ? wireEdgeImg
        : resolveEditorCachedImage(WIRE_SPRITE_URL).ready

    if (img?.naturalWidth) {
      ctx.save()
      drawHexEdgeStrip(ctx, {
        center,
        corners,
        edgeIndex: i,
        img,
        bandRatio: WIRE_DRAW_BAND_RATIO,
        bandFrom: 'bottom',
        inwardInset: 0,
      })
      ctx.restore()
    }
  }
}

function drawTrenchEdges(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    getCellCorners: (x: number, y: number) => { x: number; y: number }[]
    trenchImg?: HTMLImageElement | null
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
  },
) {
  const { cell, center, getCellCorners, trenchImg, resolveEditorCachedImage } = params
  const mask = getTrenchEdgesMask(cell.builds)
  if (!mask) return

  const img =
    trenchImg?.complete && trenchImg.naturalWidth > 0
      ? trenchImg
      : resolveEditorCachedImage(TRENCH_SPRITE_URL).ready
  if (!img?.naturalWidth) return

  const corners = getCellCorners(center.x, center.y)

  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue

    ctx.save()
    drawHexEdgeStrip(ctx, {
      center,
      corners,
      edgeIndex: i,
      img,
      bandRatio: 1,
      useFullImage: true,
      align: 'bottom',
      inwardInset: 0,
    })
    ctx.restore()
  }
}

function drawAntiTankEdges(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    getCellCorners: (x: number, y: number) => { x: number; y: number }[]
    antiTankImg?: HTMLImageElement | null
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
  },
) {
  const { cell, center, cellSize, getCellCorners, antiTankImg, resolveEditorCachedImage } = params
  const mask = getAntiTankEdgesMask(cell.builds)
  if (!mask) return

  const img =
    antiTankImg?.complete && antiTankImg.naturalWidth > 0
      ? antiTankImg
      : resolveEditorCachedImage(ANTITANK_SPRITE_URL).ready
  if (!img?.naturalWidth) return

  const corners = getCellCorners(center.x, center.y)
  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue
    ctx.save()
    drawHexEdgeIcon(ctx, {
      center,
      corners,
      edgeIndex: i,
      img,
      cellSize,
    })
    ctx.restore()
  }
}

function dotHoverGlowFilter(side: 'friendly' | 'enemy' | 'empty'): string {
  if (side === 'enemy') return battleHoverDropShadowFilter('enemy')
  if (side === 'friendly') return battleHoverDropShadowFilter('own')
  return battleEmptyDotDropShadowFilter()
}

function fillMinefieldHex(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[],
) {
  ctx.beginPath()
  traceHexPath(ctx, corners)
  ctx.fillStyle = 'rgba(220, 40, 40, 0.42)'
  ctx.fill()
  ctx.beginPath()
  traceHexPath(ctx, corners)
  ctx.strokeStyle = 'rgba(176, 20, 20, 0.95)'
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function paintDeployZoneOverlay(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[],
  team: number,
  active: boolean,
) {
  const style = deployZoneStyle(team, active)
  ctx.beginPath()
  traceHexPath(ctx, corners)
  ctx.fillStyle = style.fill
  ctx.fill()
  ctx.beginPath()
  traceHexPath(ctx, corners)
  ctx.strokeStyle = style.stroke
  ctx.lineWidth = active ? 3.5 : 2.25
  ctx.stroke()
}

function battleBuildingHiddenByFog(
  mode: 'editor' | 'battle',
  lobbyPreview: boolean,
  fogIds: number[] | null | undefined,
  cellId: number,
  viewerFaction: LobbyFaction | undefined,
): boolean {
  if (mode !== 'battle' || lobbyPreview) return false
  if (!fogIds || viewerFaction === 'none' || viewerFaction == null) return false
  return !fogIds.some((id) => Number(id) === Number(cellId))
}

function drawCenterBuildFortifications(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    mode?: 'editor' | 'battle'
    dotImg?: HTMLImageElement | null
    storageImg?: HTMLImageElement | null
    pontonImg?: HTMLImageElement | null
    pontonStageImgs?: (HTMLImageElement | null)[]
    smokeImg?: HTMLImageElement | null
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
    dotHoverGlow?: boolean
    dotHoverSide?: 'friendly' | 'enemy' | 'empty'
    storageGlow?: boolean
    shareWithUnits?: boolean
  },
) {
  const {
    cell,
    center,
    cellSize,
    mode,
    dotImg,
    storageImg,
    pontonImg,
    pontonStageImgs = [],
    smokeImg,
    resolveEditorCachedImage,
    dotHoverGlow,
    dotHoverSide,
    storageGlow = false,
    shareWithUnits = false,
  } = params
  const builds = ensureCellBuilds(cell.builds)

  if (builds.dot > 0) {
    const img =
      dotImg?.complete && dotImg.naturalWidth > 0
        ? dotImg
        : resolveEditorCachedImage(DOT_SPRITE_URL).ready
    if (img?.naturalWidth) {
      const layout = dotDrawLayout(cellSize, shareWithUnits)
      ctx.save()
      if (dotHoverGlow && dotHoverSide) {
        ctx.filter = dotHoverGlowFilter(dotHoverSide)
      }
      drawCenterFortification(ctx, {
        center,
        cellSize,
        img,
        scale: layout.scale,
        offsetX: layout.offsetX,
        offsetY: layout.offsetY,
      })
      ctx.restore()
    }
  }

  if (builds.storage > 0) {
    const img =
      storageImg?.complete && storageImg.naturalWidth > 0
        ? storageImg
        : resolveEditorCachedImage(STORAGE_SPRITE_URL).ready
    if (img?.naturalWidth) {
      ctx.save()
      if (storageGlow) {
        ctx.filter = battleEmptyDotDropShadowFilter()
      }
      drawCenterFortification(ctx, { center, cellSize, img, scale: 0.85 })
      ctx.restore()
    }
  }

  if (hasPontonOnCell(builds)) {
    const stage = pontonStageImgs[pontonStageIndex(builds)]
    const img =
      stage?.complete && stage.naturalWidth > 0
        ? stage
        : pontonImg?.complete && pontonImg.naturalWidth > 0
          ? pontonImg
          : resolveEditorCachedImage(PONTON_SPRITE_URL).ready
    if (img?.naturalWidth) {
      ctx.save()
      drawCenterFortification(ctx, { center, cellSize, img, scale: 0.92 })
      ctx.restore()
    }
  }

  if (hasSmokeOnCell(builds)) {
    const img =
      smokeImg?.complete && smokeImg.naturalWidth > 0
        ? smokeImg
        : resolveEditorCachedImage(SMOKE_SPRITE_URL).ready
    if (img?.naturalWidth) {
      ctx.save()
      drawCenterFortification(ctx, { center, cellSize, img, scale: 0.78 })
      ctx.restore()
    }
  }

  if (hasSettlementFire(builds)) {
    const img = resolveEditorCachedImage(SETTLEMENT_FIRE_SPRITE_URL).ready
    if (img?.naturalWidth) {
      ctx.save()
      drawCenterFortification(ctx, { center, cellSize, img, scale: 0.55 })
      ctx.restore()
      const markers = settlementFireMarkers(builds)
      if (markers > 0) {
        ctx.save()
        ctx.fillStyle = 'rgba(255, 240, 210, 0.95)'
        ctx.strokeStyle = 'rgba(120, 30, 0, 0.95)'
        ctx.lineWidth = 3
        ctx.font = `bold ${Math.max(11, Math.round(cellSize * 0.22))}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const label = String(markers)
        ctx.strokeText(label, center.x, center.y + cellSize * 0.22)
        ctx.fillText(label, center.x, center.y + cellSize * 0.22)
        ctx.restore()
      }
    }
  }

}

function drawMapBuilding(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    mode: 'editor' | 'battle'
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
    glow?: boolean
  },
) {
  const { cell, center, cellSize, mode, resolveEditorCachedImage, glow = false } = params
  const cellExtras = cell as CellExtras
  const mapBuilding = cellExtras.mapBuilding
  if (!mapBuilding || (mode !== 'editor' && mode !== 'battle')) {
    return
  }

  const bState = mapBuilding.imagePath ? resolveEditorCachedImage(mapBuilding.imagePath) : { ready: null, pending: false, noUrl: true }

  if (bState.ready) {
    const bw = cellSize * 1.15
    ctx.save()
    if (glow) ctx.filter = battleEmptyDotDropShadowFilter()
    ctx.drawImage(bState.ready, center.x - bw / 2, center.y - bw / 2, bw, bw)
    ctx.restore()
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
  battleDotSectorCellIds?: number[] | null
  enterDotGlowCellIds?: number[] | null
  loadingSupGlowCellIds?: number[] | null
  battlePatrolVisibilityCellIds?: number[] | null
  battlePatrolCenterCellId?: number | null
  battleAirInterceptionTargetCellIds?: number[] | null
  patrolRangePickCellIds?: number[] | null
  reconRangePickCellIds?: number[] | null
  battleReconHoverAreaCellIds?: number[] | null
  battleReconHoverCenterCellId?: number | null
  battleBombardmentAreaCellIds?: number[] | null
  bombardmentDirectionPickCellIds?: number[] | null
  bombardmentApproachCellId?: number | null
  battleReportReplayHighlight: any
  battleUnloadCellIds: number[] | null
  /** Гекс вылета: красная подсветка + иконка при наведении на строку панели. */
  battleAirDepartureHoverCellId?: number | null
  /** Выбор авиаприказа с целью: красный гекс вылета и иконка; без жёлтого hover-кольца. */
  battleAirDeparturePickCellId?: number | null
  /** Превью цели: только иконка приказа (без заливки гекса). */
  battleAirMissionPreview?: { targetCellId: number; orderKey: string } | null
  airMissionOrderDecals?: Record<string, HTMLImageElement>
  battlePendingLogisticsPreview: any
  battlePendingShootPreview: any
  battlePendingOrderHover?: BattlePendingOrderHover | null
  orderDecals?: Record<string, HTMLImageElement>
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
  getSupDecalImg?: HTMLImageElement | null
  loadingSupDecalImg?: HTMLImageElement | null
  shootOrderDecals: ShootOrderDecals
  airMissionOrderDecals?: Record<string, HTMLImageElement>
  airDepartureDecalImg?: HTMLImageElement | null
  fireAirGunDecalImg?: HTMLImageElement | null
  editorAviationEdgeHighlight?: boolean
  editorAviationEdgeCellIds?: ReadonlySet<number>
  editorDeployZones?: { cellId: number; team: number }[] | null
  editorDeployBrushTeam?: number | null
  wireEdgeImg?: HTMLImageElement | null
  trenchImg?: HTMLImageElement | null
  antiTankImg?: HTMLImageElement | null
  dotImg?: HTMLImageElement | null
  storageImg?: HTMLImageElement | null
  pontonImg?: HTMLImageElement | null
  pontonStageImgs?: (HTMLImageElement | null)[]
  smokeImg?: HTMLImageElement | null
  viewerBattleFaction?: LobbyFaction
  battleFogRevealedCellIds?: number[] | null
  extraHiddenInstanceIds?: ReadonlySet<number> | null
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
    battleDotSectorCellIds = null,
    enterDotGlowCellIds = null,
    loadingSupGlowCellIds = null,
    battlePatrolVisibilityCellIds = null,
    battlePatrolCenterCellId = null,
    battleAirInterceptionTargetCellIds = null,
    patrolRangePickCellIds = null,
    reconRangePickCellIds = null,
    battleReconHoverAreaCellIds = null,
    battleReconHoverCenterCellId = null,
    battleBombardmentAreaCellIds = null,
    bombardmentDirectionPickCellIds = null,
    bombardmentApproachCellId = null,
    battleReportReplayHighlight,
    battleUnloadCellIds,
    battleAirDepartureHoverCellId = null,
    battleAirDeparturePickCellId = null,
    battleAirMissionPreview = null,
    airMissionOrderDecals = {},
    battlePendingLogisticsPreview,
    battlePendingShootPreview,
    battlePendingOrderHover = null,
    orderDecals = {},
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
    getSupDecalImg = null,
    loadingSupDecalImg = null,
    shootOrderDecals,
    editorAviationEdgeHighlight = false,
    editorAviationEdgeCellIds,
    editorDeployZones = null,
    editorDeployBrushTeam = null,
    wireEdgeImg = null,
    trenchImg = null,
    antiTankImg = null,
    dotImg = null,
    storageImg = null,
    pontonImg = null,
    pontonStageImgs = [],
    smokeImg = null,
    battleFogRevealedCellIds = null,
    airDepartureDecalImg = null,
    fireAirGunDecalImg = null,
    viewerBattleFaction = 'none',
    extraHiddenInstanceIds = null,
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

  const cellsByCube = buildCellByCubeKey(cells)
  const deployTeamByCell = new Map<number, number>()
  if (editorDeployZones?.length) {
    for (const z of editorDeployZones) deployTeamByCell.set(z.cellId, z.team)
  }

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    const cell = cells[cellIndex]
    const center = getCellCenter(cell.coor.x, cell.coor.z)
    const corners = getCellCorners(center.x, center.y)

    if (mode === 'editor') {
      const imgPath = hexTerrainImagePath(cell) || (cell as CellExtras).img
      const hexTex = imgPath ? getTexture(imgPath) : null
      ctx.save()
      ctx.beginPath()
      traceHexPath(ctx, corners)
      if (hexTex) {
        ctx.clip()
        drawImageCoverInCircleWithTransform(
          ctx,
          hexTex,
          center.x,
          center.y,
          cellSize * 0.92,
          tileRotationRadians(readTileRotationSteps(cell)),
          readTileMirror(cell),
        )
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
        const elevStroke = elevationStrokeForLevel(effectiveElevationLevel(cell))
        const edgeMask = elevationEdgeDrawMask(cell, cellsByCube, getCellCenter)
        if (elevStroke) {
          strokeHexEdges(ctx, corners, edgeMask, elevStroke.stroke, elevStroke.lineWidth)
        } else {
          strokeHexEdges(ctx, corners, edgeMask, 'rgba(0, 0, 0, 0.45)', 1)
        }
      }

      if (hasMineOnCell(cell.builds)) {
        fillMinefieldHex(ctx, corners)
      }

      if (isRailwayDestroyedHex(cell)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(40, 32, 28, 0.38)'
        ctx.fill()
      }

      if (isSettlementDestroyedHex(cell) || hasSettlementFire(cell.builds)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = hasSettlementFire(cell.builds) ? 'rgba(220, 70, 20, 0.28)' : 'rgba(55, 45, 40, 0.42)'
        ctx.fill()
      }

      if (
        editorAviationEdgeHighlight &&
        editorAviationEdgeCellIds &&
        editorAviationEdgeCellIds.has(cell.id)
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(244, 67, 54, 0.26)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(198, 40, 40, 0.98)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      const deployTeam = deployTeamByCell.get(cell.id)
      if (deployTeam != null) {
        paintDeployZoneOverlay(ctx, corners, deployTeam, deployTeam === editorDeployBrushTeam)
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

      if (
        hoverCell?.id === cell.id &&
        !hoveredUnit &&
        !hasDotOnCell(cell.builds) &&
        !cell.highlight &&
        !defendFacingPickCellIds?.length
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(234, 179, 0, 0.95)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      if (defendFacingPickCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(56, 132, 220, 0.45)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(30, 90, 180, 0.9)'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      if (battleDotSectorCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(150, 155, 175, 0.40)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 100, 120, 0.62)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    } else {
      const imgPathBattle = hexTerrainImagePath(cell) || (cell as CellExtras).img
      const hexTexBattle = imgPathBattle ? getTexture(imgPathBattle) : null
      ctx.beginPath()
      traceHexPath(ctx, corners)
      if (hexTexBattle) {
        ctx.save()
        ctx.clip()
        drawImageCoverInCircleWithTransform(
          ctx,
          hexTexBattle,
          center.x,
          center.y,
          cellSize * 0.92,
          tileRotationRadians(readTileRotationSteps(cell)),
          readTileMirror(cell),
        )
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
        const elevStroke = elevationStrokeForLevel(effectiveElevationLevel(cell))
        const edgeMask = elevationEdgeDrawMask(cell, cellsByCube, getCellCenter)
        if (elevStroke) {
          strokeHexEdges(ctx, corners, edgeMask, elevStroke.stroke, elevStroke.lineWidth)
        } else {
          strokeHexEdges(ctx, corners, edgeMask, 'black', 1)
        }
      }

      if (isMineVisibleOnBattleMap(cell.builds, viewerBattleFaction)) {
        fillMinefieldHex(ctx, corners)
      }

      if (isRailwayDestroyedHex(cell)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(40, 32, 28, 0.38)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 70, 50, 0.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      if (isSettlementDestroyedHex(cell)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(55, 45, 40, 0.42)'
        ctx.fill()
      }

      if (hasSettlementFire(cell.builds)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(220, 70, 20, 0.28)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(200, 50, 10, 0.9)'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      const battleDeployTeam = deployTeamByCell.get(cell.id)
      if (battleDeployTeam != null) {
        paintDeployZoneOverlay(
          ctx,
          corners,
          battleDeployTeam,
          battleDeployTeam === editorDeployBrushTeam,
        )
      }

      const showBattleHexHoverRing =
        hoverCell?.id === cell.id &&
        !hoveredUnit &&
        !hasDotOnCell(cell.builds) &&
        !cell.highlight &&
        !(mode === 'battle' && moveReachableCellIds && moveReachableCellIds.length > 0) &&
        !(mode === 'battle' && defendFacingPickCellIds && defendFacingPickCellIds.length > 0) &&
        !(mode === 'editor' && defendFacingPickCellIds && defendFacingPickCellIds.length > 0) &&
        !(mode === 'battle' && battleUnloadCellIds && battleUnloadCellIds.length > 0) &&
        !(mode === 'battle' && battleAreaFireCellIds && battleAreaFireCellIds.length > 0) &&
        !(mode === 'battle' && patrolRangePickCellIds && patrolRangePickCellIds.length > 0) &&
        !(mode === 'battle' && battlePatrolVisibilityCellIds && battlePatrolVisibilityCellIds.length > 0) &&
        !(mode === 'battle' && reconRangePickCellIds && reconRangePickCellIds.length > 0) &&
        !(mode === 'battle' && battleReconHoverAreaCellIds && battleReconHoverAreaCellIds.length > 0) &&
        !(mode === 'battle' && battlePendingOrderHover?.areaCellIds && battlePendingOrderHover.areaCellIds.length > 0) &&
        !(
          mode === 'battle' &&
          battleReportReplayHighlight?.reconZoneCellIds &&
          battleReportReplayHighlight.reconZoneCellIds.length > 0
        ) &&
        !(mode === 'battle' && battleBombardmentAreaCellIds && battleBombardmentAreaCellIds.length > 0) &&
        !(mode === 'battle' && bombardmentDirectionPickCellIds && bombardmentDirectionPickCellIds.length > 0) &&
        !(mode === 'battle' && bombardmentApproachCellId != null && cell.id === bombardmentApproachCellId) &&
        !(
          mode === 'battle' &&
          battleReportReplayHighlight?.airDepartureCellId != null &&
          Number(cell.id) === Number(battleReportReplayHighlight.airDepartureCellId)
        ) &&
        !(
          mode === 'battle' &&
          battleAirDeparturePickCellId != null &&
          cell.id === battleAirDeparturePickCellId
        ) &&
        !(
          mode === 'battle' &&
          battleAirDepartureHoverCellId != null &&
          cell.id === battleAirDepartureHoverCellId
        ) &&
        !(mode === 'battle' && cellHasWarehouse(cell))

      if (showBattleHexHoverRing) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'yellow'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      if (moveReachableCellIds?.some((id) => Number(id) === Number(cell.id))) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
      }

      if (defendFacingPickCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle =
          mode === 'editor' ? 'rgba(56, 132, 220, 0.45)' : 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
        if (mode === 'editor') {
          ctx.beginPath()
          traceHexPath(ctx, corners)
          ctx.strokeStyle = 'rgba(30, 90, 180, 0.9)'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
      }

      if (bombardmentApproachCellId != null && cell.id === bombardmentApproachCellId) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(56, 132, 220, 0.48)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(30, 90, 180, 0.92)'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      if (bombardmentDirectionPickCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 90, 90, 0.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      const pendingAreaIdsEarly = battlePendingOrderHover?.areaCellIds
      const inPendingDaisy =
        pendingAreaIdsEarly?.some((id) => Number(id) === Number(cell.id)) ?? false

      if (battleUnloadCellIds?.includes(cell.id) && !inPendingDaisy) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fill()
      }

      if (battleAreaFireCellIds?.includes(cell.id) && !inPendingDaisy) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(200, 72, 72, 0.26)'
        ctx.fill()
      }
      if (patrolRangePickCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.45)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 90, 90, 0.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      const inReconHoverArea = battleReconHoverAreaCellIds?.some((id) => Number(id) === Number(cell.id))
      if (reconRangePickCellIds?.some((id) => Number(id) === Number(cell.id)) && !inReconHoverArea) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(128, 128, 128, 0.45)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 90, 90, 0.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      if (battlePatrolVisibilityCellIds?.includes(cell.id)) {
        const isPatrolCenter = battlePatrolCenterCellId != null && cell.id === battlePatrolCenterCellId
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = isPatrolCenter ? 'rgba(56, 160, 220, 0.3)' : 'rgba(56, 132, 220, 0.12)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.setLineDash(isPatrolCenter ? [] : [6, 5])
        ctx.strokeStyle = isPatrolCenter ? 'rgba(24, 96, 180, 0.95)' : 'rgba(56, 132, 220, 0.62)'
        ctx.lineWidth = isPatrolCenter ? 3 : 1.5
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (inReconHoverArea) {
        const isReconCenter =
          battleReconHoverCenterCellId != null && Number(cell.id) === Number(battleReconHoverCenterCellId)
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = isReconCenter ? 'rgba(52, 168, 108, 0.34)' : 'rgba(52, 168, 108, 0.18)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.setLineDash(isReconCenter ? [] : [6, 5])
        ctx.strokeStyle = isReconCenter ? 'rgba(24, 118, 68, 0.95)' : 'rgba(52, 140, 88, 0.78)'
        ctx.lineWidth = isReconCenter ? 3 : 1.5
        ctx.stroke()
        ctx.setLineDash([])
      }

      const pendingAreaIds = battlePendingOrderHover?.areaCellIds
      const inPendingOrderArea = pendingAreaIds?.some((id) => Number(id) === Number(cell.id))
      if (inPendingOrderArea) {
        const isAreaCenter =
          battlePendingOrderHover?.areaCenterCellId != null &&
          Number(cell.id) === Number(battlePendingOrderHover.areaCenterCellId)
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = isAreaCenter ? 'rgba(229, 28, 28, 0.58)' : 'rgba(229, 28, 28, 0.40)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.setLineDash([])
        ctx.strokeStyle = isAreaCenter ? 'rgba(196, 0, 0, 1)' : 'rgba(210, 8, 8, 0.96)'
        ctx.lineWidth = isAreaCenter ? 3.5 : 2.25
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (battleAirInterceptionTargetCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(220, 60, 60, 0.28)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(220, 60, 60, 0.92)'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
      const reconZoneIds = battleReportReplayHighlight?.reconZoneCellIds
      const isInReconZone = reconZoneIds?.some((id) => Number(id) === Number(cell.id))
      if (mode === 'battle' && isInReconZone) {
        const reconCenterId = battleReportReplayHighlight?.reconCenterCellId
        const isReconCenter = reconCenterId != null && Number(reconCenterId) === Number(cell.id)
        const isPatrolZone = battleReportReplayHighlight?.reconOrderKey === 'patrol'
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = isPatrolZone
          ? isReconCenter
            ? 'rgba(56, 160, 220, 0.3)'
            : 'rgba(56, 132, 220, 0.12)'
          : isReconCenter
            ? 'rgba(52, 168, 108, 0.34)'
            : 'rgba(52, 168, 108, 0.13)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.setLineDash(isReconCenter ? [] : [6, 5])
        ctx.strokeStyle = isPatrolZone
          ? isReconCenter
            ? 'rgba(24, 96, 180, 0.95)'
            : 'rgba(56, 132, 220, 0.62)'
          : isReconCenter
            ? 'rgba(24, 118, 68, 0.95)'
            : 'rgba(52, 140, 88, 0.68)'
        ctx.lineWidth = isReconCenter ? 3 : 1.5
        ctx.stroke()
        ctx.setLineDash([])
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

      if (battleDotSectorCellIds?.includes(cell.id)) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(150, 155, 175, 0.40)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(90, 100, 120, 0.62)'
        ctx.lineWidth = 1.5
        ctx.stroke()
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

      if (
        battleReportReplayHighlight?.airFlightCellId != null &&
        Number(cell.id) === Number(battleReportReplayHighlight.airFlightCellId)
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(255, 193, 7, 0.38)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.95)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      if (
        battleReportReplayHighlight?.airDepartureCellId != null &&
        Number(cell.id) === Number(battleReportReplayHighlight.airDepartureCellId)
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(220, 48, 48, 0.45)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(185, 28, 28, 1)'
        ctx.lineWidth = 4
        ctx.stroke()
      } else if (
        battleAirDeparturePickCellId != null &&
        cell.id === battleAirDeparturePickCellId
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(220, 48, 48, 0.45)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(185, 28, 28, 1)'
        ctx.lineWidth = 4
        ctx.stroke()
      } else if (
        battleAirDepartureHoverCellId != null &&
        cell.id === battleAirDepartureHoverCellId
      ) {
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.fillStyle = 'rgba(220, 48, 48, 0.38)'
        ctx.fill()
        ctx.beginPath()
        traceHexPath(ctx, corners)
        ctx.strokeStyle = 'rgba(185, 28, 28, 1)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

    }

    if (
      !battleBuildingHiddenByFog(mode, lobbyPreview, battleFogRevealedCellIds, cell.id, viewerBattleFaction)
    ) {
      const visibleUnits = battleUnitsVisibleOnMap(cell, mode, extraHiddenInstanceIds)
      const hoveringDot =
        mode === 'battle' &&
        hoverCell?.id === cell.id &&
        hasDotOnCell(cell.builds) &&
        (!hoveredUnit || unitInDot(hoveredUnit.unit as Record<string, unknown>))
      const enterDotGlow = Boolean(
        enterDotGlowCellIds?.some((id) => Number(id) === Number(cell.id)) && hasDotOnCell(cell.builds),
      )
      const glowDot = hoveringDot || enterDotGlow
      const warehousePickGlow = Boolean(
        loadingSupGlowCellIds?.some((id) => Number(id) === Number(cell.id)),
      )
      const warehouseOrderLink =
        battlePendingLogisticsPreview?.kind === 'loadingSup' &&
        Number(battlePendingLogisticsPreview.targetCellId) === Number(cell.id) &&
        isLoadingSupHoverLink(battlePendingLogisticsPreview, hoverCell, hoveredUnit)
      const hoveringWarehouse =
        mode === 'battle' &&
        hoverCell != null &&
        Number(hoverCell.id) === Number(cell.id) &&
        cellHasWarehouse(cell)
      drawCenterBuildFortifications(ctx, {
        cell,
        center,
        cellSize,
        mode,
        dotImg,
        storageImg,
        pontonImg,
        pontonStageImgs,
        smokeImg,
        resolveEditorCachedImage,
        dotHoverGlow: glowDot,
        dotHoverSide: glowDot ? dotOccupancySide(cell, cells, viewerBattleFaction) : undefined,
        storageGlow: hoveringWarehouse || warehousePickGlow || warehouseOrderLink,
        shareWithUnits: hexSharesDotWithUnits(hasDotOnCell(cell.builds), visibleUnits.length),
      })
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
      ((battlePendingLogisticsPreview?.kind === 'loadingSup' &&
        Number(battlePendingLogisticsPreview.targetCellId) === Number(cell.id) &&
        isLoadingSupHoverLink(battlePendingLogisticsPreview, hoverCell, hoveredUnit)) ||
        Number(battleReportReplayHighlight?.loadingSupCellDecalId) === Number(cell.id))
    ) {
      if (loadingSupDecalImg?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.12)
        ctx.save()
        drawImageCoverInCircle(ctx, loadingSupDecalImg, center.x, center.y, r)
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
    if (
      mode === 'battle' &&
      battlePendingOrderHover?.iconCellIds?.some((id) => Number(id) === Number(cell.id))
    ) {
      const orderKey = battlePendingOrderHover.orderKey
      const decal = orderDecals[orderKey] ?? shootOrderDecals[orderKey as 'fire' | 'fireHard']
      if (decal?.naturalWidth) {
        const r = Math.max(8, cellSize * 0.14)
        ctx.save()
        drawImageCoverInCircle(ctx, decal, center.x, center.y, r)
        ctx.restore()
      }
    }

    if (
      mode === 'battle' &&
      battleBombardmentAreaCellIds?.includes(cell.id)
    ) {
      drawAirMissionOrderDecal(ctx, center, cellSize, 'bombardment', airMissionOrderDecals)
    }

    if (
      mode === 'battle' &&
      battlePatrolCenterCellId != null &&
      cell.id === battlePatrolCenterCellId &&
      battlePatrolVisibilityCellIds?.includes(cell.id) &&
      !(
        battleAirMissionPreview &&
        battleAirMissionPreview.orderKey === 'patrol' &&
        battleAirMissionPreview.targetCellId === cell.id
      )
    ) {
      drawAirMissionOrderDecal(ctx, center, cellSize, 'patrol', airMissionOrderDecals)
    }

    if (
      mode === 'battle' &&
      battleAirMissionPreview &&
      cell.id === battleAirMissionPreview.targetCellId &&
      !(
        battleAirMissionPreview.orderKey === 'bombardment' &&
        battleBombardmentAreaCellIds?.includes(cell.id)
      )
    ) {
      drawAirMissionOrderDecal(
        ctx,
        center,
        cellSize,
        battleAirMissionPreview.orderKey,
        airMissionOrderDecals,
      )
    }

    if (
      mode === 'battle' &&
      battleReportReplayHighlight?.reconCenterCellId != null &&
      Number(battleReportReplayHighlight.reconCenterCellId) === Number(cell.id) &&
      battleReportReplayHighlight?.reconOrderKey
    ) {
      drawAirMissionOrderDecal(
        ctx,
        center,
        cellSize,
        battleReportReplayHighlight.reconOrderKey,
        airMissionOrderDecals,
      )
    }

    if (
      mode === 'battle' &&
      battleReportReplayHighlight?.airCombatCellId != null &&
      Number(battleReportReplayHighlight.airCombatCellId) === Number(cell.id) &&
      battleReportReplayHighlight?.airCombatOrderKey
    ) {
      drawAirMissionOrderDecal(
        ctx,
        center,
        cellSize,
        battleReportReplayHighlight.airCombatOrderKey,
        airMissionOrderDecals,
      )
    }

    if (
      mode === 'battle' &&
      battleReportReplayHighlight?.artilleryAirSectorCellId != null &&
      Number(battleReportReplayHighlight.artilleryAirSectorCellId) === Number(cell.id) &&
      fireAirGunDecalImg?.naturalWidth
    ) {
      const r = Math.max(8, cellSize * 0.14)
      ctx.save()
      drawImageCoverInCircle(ctx, fireAirGunDecalImg, center.x, center.y, r)
      ctx.restore()
    }

    if (
      !battleBuildingHiddenByFog(mode, lobbyPreview, battleFogRevealedCellIds, cell.id, viewerBattleFaction)
    ) {
      drawMapBuilding(ctx, {
        cell,
        center,
        cellSize,
        mode,
        resolveEditorCachedImage,
        glow:
          mode === 'battle' &&
          cellHasWarehouse(cell) &&
          (Boolean(loadingSupGlowCellIds?.some((id) => Number(id) === Number(cell.id))) ||
            (hoverCell != null && Number(hoverCell.id) === Number(cell.id)) ||
            (battlePendingLogisticsPreview?.kind === 'loadingSup' &&
              Number(battlePendingLogisticsPreview.targetCellId) === Number(cell.id) &&
              isLoadingSupHoverLink(battlePendingLogisticsPreview, hoverCell, hoveredUnit))),
      })
    }

    const reportDepartureId = battleReportReplayHighlight?.airDepartureCellId
    if (
      mode === 'battle' &&
      reportDepartureId != null &&
      Number(cell.id) === Number(reportDepartureId)
    ) {
      drawAirDepartureMarker(ctx, center, cellSize, airDepartureDecalImg)
    } else if (mode === 'battle' && battleAirDeparturePickCellId != null && cell.id === battleAirDeparturePickCellId) {
      drawAirDepartureMarker(ctx, center, cellSize, airDepartureDecalImg)
    } else if (
      mode === 'battle' &&
      battleAirDepartureHoverCellId != null &&
      cell.id === battleAirDepartureHoverCellId &&
      !(
        battleAirMissionPreview?.orderKey === 'interception' &&
        Number(battleAirMissionPreview.targetCellId) === Number(cell.id)
      )
    ) {
      drawAirDepartureMarker(ctx, center, cellSize, airDepartureDecalImg)
    }
  }

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    const cell = cells[cellIndex]
    if (
      battleBuildingHiddenByFog(mode, lobbyPreview, battleFogRevealedCellIds, cell.id, viewerBattleFaction)
    ) {
      continue
    }
    const center = getCellCenter(cell.coor.x, cell.coor.z)
    drawWireEdges(ctx, {
      cell,
      center,
      cellSize,
      getCellCorners,
      wireEdgeImg,
      resolveEditorCachedImage,
    })
    drawTrenchEdges(ctx, {
      cell,
      center,
      getCellCorners,
      trenchImg,
      resolveEditorCachedImage,
    })
    drawAntiTankEdges(ctx, {
      cell,
      center,
      cellSize,
      getCellCorners,
      antiTankImg,
      resolveEditorCachedImage,
    })
  }

  drawPath(ctx)
}

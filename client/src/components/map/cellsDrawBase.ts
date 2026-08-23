import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { cellHasEditorStructure } from '../../game/editorMapFortifications'

export function getTerrainColor(terrainType: string | undefined) {
  if (terrainType === 'forest') return '#2e7d32'
  if (terrainType === 'hill') return '#8B7355'
  if (terrainType === 'swamp') return '#9575cd'
  if (terrainType === 'river') return '#4fc3f7'
  if (terrainType === 'mountain') return '#795548'
  if (terrainType === 'road') return '#9E9E9E'
  if (terrainType === 'city') return '#ffb74d'
  return '#D3D3D3'
}

const unitPositions = [
  { x: 0, y: -15 },
  { x: -15, y: 8 },
  { x: 15, y: 8 },
]

const lobbyPreviewUnitPositions = [
  { x: 0, y: -9 },
  { x: -9, y: 5 },
  { x: 9, y: 5 },
]

export function battleUnitOffsets(cellSize: number) {
  const s = cellSize / 34
  return [
    { x: 0, y: -15 * s },
    { x: -15 * s, y: 8 * s },
    { x: 15 * s, y: 8 * s },
  ]
}

export function unitPositionsForDraw(
  lobbyPreview: boolean,
  mode: 'editor' | 'battle',
  cellSize: number,
) {
  if (lobbyPreview) return lobbyPreviewUnitPositions
  if (mode === 'battle') return battleUnitOffsets(cellSize)
  return unitPositions
}

/** Смещение иконки авиации от центра гекса вдоль маршрута (рядом с гексом, не внутри). */
export function airFlightIconPixelOffset(params: {
  flightCell: Cell
  pathCellIds: number[]
  pathIndex: number
  cells: Cell[]
  cellSize: number
  getCellCenter: (q: number, r: number) => { x: number; y: number }
}): { x: number; y: number } {
  const { flightCell, pathCellIds, pathIndex, cells, cellSize, getCellCenter } = params
  const magnitude = cellSize * 0.38
  const curCenter = getCellCenter(flightCell.coor.x, flightCell.coor.z)

  const cellById = (id: number) => cells.find((c) => Number(c.id) === Number(id))

  const nextId = pathIndex + 1 < pathCellIds.length ? pathCellIds[pathIndex + 1] : null
  const prevId = pathIndex > 0 ? pathCellIds[pathIndex - 1] : null

  let dx = 0
  let dy = 0

  if (nextId != null) {
    const next = cellById(nextId)
    if (next) {
      const nextCenter = getCellCenter(next.coor.x, next.coor.z)
      dx = nextCenter.x - curCenter.x
      dy = nextCenter.y - curCenter.y
    }
  } else if (prevId != null) {
    const prev = cellById(prevId)
    if (prev) {
      const prevCenter = getCellCenter(prev.coor.x, prev.coor.z)
      dx = curCenter.x - prevCenter.x
      dy = curCenter.y - prevCenter.y
    }
  }

  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: 0, y: 0 }
  return { x: (dx / len) * magnitude, y: (dy / len) * magnitude }
}

export function airUnitInFlightDrawSize(cellSize: number): number {
  return Math.max(22, Math.round(cellSize * 0.5))
}

/** Иконка вражеской цели при выборе приказа «Перехват» — компактно в центре гекса. */
export function airInterceptionTargetDrawSize(cellSize: number): number {
  return Math.max(12, Math.round(cellSize * 0.2))
}

export function unitDrawSize(
  unitCount: number,
  lobbyPreview: boolean,
  mode: 'editor' | 'battle',
  cellSize: number,
): number {
  if (lobbyPreview) {
    if (unitCount === 1) return 24
    if (unitCount === 2) return 20
    return 18
  }

  if (mode === 'battle') {
    let baseSize = cellSize * 0.62
    if (unitCount === 1) {
      baseSize = cellSize * 0.84
    } else if (unitCount === 2) {
      baseSize = cellSize * 0.72
    }
    const limitedSize = Math.min(baseSize, cellSize * 0.92)
    const roundedSize = Math.round(limitedSize)
    return Math.max(28, roundedSize)
  }

  if (unitCount === 1) return 40
  if (unitCount === 2) return 35
  return 30
}

export function battleHoverDropShadowFilter(kind: 'ally' | 'enemy' | 'neutral') {
  if (kind === 'ally') {
    return [
      'drop-shadow(0 0 2px rgba(255,255,245,0.95))',
      'drop-shadow(0 0 6px rgba(255,235,120,0.85))',
      'drop-shadow(0 0 14px rgba(255,210,70,0.65))',
      'drop-shadow(0 0 22px rgba(255,190,40,0.45))',
    ].join(' ')
  }
  if (kind === 'enemy') {
    return [
      'drop-shadow(0 0 2px rgba(255,235,235,0.95))',
      'drop-shadow(0 0 6px rgba(255,130,130,0.82))',
      'drop-shadow(0 0 14px rgba(255,80,80,0.58))',
      'drop-shadow(0 0 22px rgba(255,50,50,0.4))',
    ].join(' ')
  }
  return [
    'drop-shadow(0 0 2px rgba(220,240,255,0.9))',
    'drop-shadow(0 0 8px rgba(150,200,255,0.65))',
    'drop-shadow(0 0 16px rgba(100,170,255,0.5))',
  ].join(' ')
}

export function battleEmptyDotDropShadowFilter() {
  return [
    'drop-shadow(0 0 2px rgba(245,245,245,0.95))',
    'drop-shadow(0 0 6px rgba(180,180,180,0.85))',
    'drop-shadow(0 0 14px rgba(140,140,140,0.62))',
    'drop-shadow(0 0 22px rgba(110,110,110,0.42))',
  ].join(' ')
}

export function battleFireTargetDropShadowFilter() {
  return [
    'drop-shadow(0 0 2px rgba(255,230,230,0.98))',
    'drop-shadow(0 0 5px rgba(255,110,110,0.9))',
    'drop-shadow(0 0 12px rgba(255,70,70,0.75))',
    'drop-shadow(0 0 20px rgba(255,45,45,0.52))',
  ].join(' ')
}

export function battleLogisticsGoldDropShadowFilter() {
  return [
    'drop-shadow(0 0 2px rgba(255,248,200,0.98))',
    'drop-shadow(0 0 5px rgba(255,200,60,0.92))',
    'drop-shadow(0 0 12px rgba(230,180,30,0.78))',
    'drop-shadow(0 0 20px rgba(200,150,20,0.5))',
  ].join(' ')
}

export function traceHexPath(ctx: CanvasRenderingContext2D, corners: { x: number; y: number }[]) {
  ctx.moveTo(corners[0].x, corners[0].y)
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(corners[i].x, corners[i].y)
  }
  ctx.closePath()
}

export function drawImageCoverInCircle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
) {
  drawImageCoverInCircleWithTransform(ctx, img, cx, cy, r, 0, false)
}

export function drawImageCoverInCircleWithTransform(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
  rotationRad: number,
  mirror: boolean,
) {
  const imageWidth = img.naturalWidth || img.width
  const imageHeight = img.naturalHeight || img.height
  if (!imageWidth || !imageHeight) return
  const scale = Math.max((2 * r) / imageWidth, (2 * r) / imageHeight)
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  ctx.save()
  ctx.translate(cx, cy)
  if (rotationRad) ctx.rotate(rotationRad)
  if (mirror) ctx.scale(-1, 1)
  ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}

export function drawImageCoverInSquare(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  half: number,
) {
  const imageWidth = img.naturalWidth || img.width
  const imageHeight = img.naturalHeight || img.height
  if (!imageWidth || !imageHeight) return
  const side = half * 2
  const scale = Math.max(side / imageWidth, side / imageHeight)
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  ctx.drawImage(img, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight)
}

export const cellHasEditorPlacement = (cell: Cell): boolean => {
  if (cell.units?.length) return true

  const extraCell = cell as Cell & { img?: string; mapBuilding?: unknown }
  if (extraCell.img && extraCell.img.trim() !== '') return true
  if (extraCell.mapBuilding != null) return true
  if (cellHasEditorStructure(cell)) return true

  if (cell.type && cell.type !== 'plain') return true
  return false
}

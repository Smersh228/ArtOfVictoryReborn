import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'

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
  const imageWidth = img.naturalWidth || img.width
  const imageHeight = img.naturalHeight || img.height
  if (!imageWidth || !imageHeight) return
  const scale = Math.max((2 * r) / imageWidth, (2 * r) / imageHeight)
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  ctx.drawImage(img, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight)
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

  if (cell.type && cell.type !== 'plain') return true
  return false
}

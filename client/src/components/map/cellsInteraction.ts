import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { unitDrawSize, unitPositionsForDraw } from './cellsDrawBase'

export function getCellCenter(
  q: number,
  r: number,
  cellSize: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = cellSize * 1.5 * q + width / 2
  const y = cellSize * (1.732 * r + 0.866 * q) + height / 2
  return { x, y }
}

export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  canvas: HTMLCanvasElement | null,
): { x: number; y: number } {
  if (!canvas || rect.width <= 0 || rect.height <= 0) {
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  }
}

export function getCellCorners(centerX: number, centerY: number, cellSize: number) {
  const corners = []
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 * Math.PI) / 180
    corners.push({
      x: centerX + cellSize * Math.cos(angle),
      y: centerY + cellSize * Math.sin(angle),
    })
  }
  return corners
}

function isPointInCell(x: number, y: number, centerX: number, centerY: number, cellSize: number) {
  const dx = x - centerX
  const dy = y - centerY
  return Math.sqrt(dx * dx + dy * dy) < cellSize
}

export function findCellAtPosition(
  cells: Cell[],
  mouseX: number,
  mouseY: number,
  cellSize: number,
  width: number,
  height: number,
): Cell | null {
  for (const cell of cells) {
    const center = getCellCenter(cell.coor.x, cell.coor.z, cellSize, width, height)
    if (isPointInCell(mouseX, mouseY, center.x, center.y, cellSize)) {
      return cell
    }
  }
  return null
}

export function findUnitAtPosition(
  cells: Cell[],
  mouseX: number,
  mouseY: number,
  params: {
    lobbyPreview: boolean
    mode: 'editor' | 'battle'
    cellSize: number
    width: number
    height: number
    isEnemyUnitHiddenByFog: (unit: { faction?: string }, cell: Cell) => boolean
  },
): { cell: Cell; unit: any; index: number } | null {
  const { lobbyPreview, mode, cellSize, width, height, isEnemyUnitHiddenByFog } = params
  for (const cell of cells) {
    if (!cell.units?.length) continue

    const center = getCellCenter(cell.coor.x, cell.coor.z, cellSize, width, height)
    const positions = unitPositionsForDraw(lobbyPreview, mode, cellSize)
    const n = Math.min(cell.units.length, 3)

    for (let k = 0; k < n; k++) {
      const i = n - 1 - k
      const unit = cell.units[i]
      if (isEnemyUnitHiddenByFog(unit, cell)) continue

      const pos = positions[i]
      const unitX = center.x + pos.x
      const unitY = center.y + pos.y
      const size = unitDrawSize(cell.units.length, lobbyPreview, mode, cellSize)
      const half = size / 2
      const hit = Math.abs(mouseX - unitX) <= half && Math.abs(mouseY - unitY) <= half
      if (hit) return { cell, unit, index: i }
    }
  }
  return null
}

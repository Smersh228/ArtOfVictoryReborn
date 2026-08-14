import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { battleUnitsVisibleOnMap } from '../../game/battleAirSupport'
import type { AirInterceptionTarget } from '../../game/battleAirSupport'
import { unitDrawSize, unitPositionsForDraw, airInterceptionTargetDrawSize } from './cellsDrawBase'

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
    const rowUnits = battleUnitsVisibleOnMap(cell, mode)
    if (!rowUnits.length) continue

    const center = getCellCenter(cell.coor.x, cell.coor.z, cellSize, width, height)
    const positions = unitPositionsForDraw(lobbyPreview, mode, cellSize)
    const n = Math.min(rowUnits.length, 3)

    for (let k = 0; k < n; k++) {
      const i = n - 1 - k
      const unit = rowUnits[i]
      if (isEnemyUnitHiddenByFog(unit, cell)) continue

      const pos = positions[i]
      const unitX = center.x + pos.x
      const unitY = center.y + pos.y
      const size = unitDrawSize(rowUnits.length, lobbyPreview, mode, cellSize)
      const half = size / 2
      const hit = Math.abs(mouseX - unitX) <= half && Math.abs(mouseY - unitY) <= half
      if (hit) return { cell, unit, index: i }
    }
  }
  return null
}

export function findAirInterceptionTargetAtPosition(
  mouseX: number,
  mouseY: number,
  targets: AirInterceptionTarget[],
  params: {
    lobbyPreview: boolean
    mode: 'editor' | 'battle'
    cellSize: number
    width: number
    height: number
    findCellAt?: (mouseX: number, mouseY: number) => Cell | null
  },
): { cell: Cell; unit: Record<string, unknown>; index: number } | null {
  if (!targets.length || params.mode !== 'battle' || params.lobbyPreview) return null

  const { lobbyPreview, mode, cellSize, width, height, findCellAt } = params
  const cellUnderMouse = findCellAt?.(mouseX, mouseY) ?? null

  if (cellUnderMouse) {
    for (let ti = 0; ti < targets.length; ti++) {
      const t = targets[ti]
      if (Number(t.engagementCell.id) === Number(cellUnderMouse.id)) {
        return { cell: t.engagementCell, unit: t.unit, index: 0 }
      }
    }
  }

  let best: { cell: Cell; unit: Record<string, unknown>; index: number; dist: number } | null = null

  for (let ti = 0; ti < targets.length; ti++) {
    const t = targets[ti]
    const cell = t.engagementCell
    const center = getCellCenter(cell.coor.x, cell.coor.z, cellSize, width, height)
    const unitX = center.x
    const unitY = center.y
    const size = airInterceptionTargetDrawSize(cellSize)
    const half = size / 2
    const hit = Math.abs(mouseX - unitX) <= half && Math.abs(mouseY - unitY) <= half
    if (!hit) continue
    const dist = Math.hypot(mouseX - unitX, mouseY - unitY)
    if (!best || dist < best.dist) {
      best = { cell, unit: t.unit, index: 0, dist }
    }
  }

  return best ? { cell: best.cell, unit: best.unit, index: best.index } : null
}

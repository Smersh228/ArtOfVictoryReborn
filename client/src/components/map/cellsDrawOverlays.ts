import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { drawImageCoverInCircle } from './cellsDrawBase'

export function drawPathOverlay(
  ctx: CanvasRenderingContext2D,
  params: {
    hoverPath: Cell[] | null | undefined
    moveDecalImg: HTMLImageElement | null
    cellSize: number
    getCellCenter: (q: number, r: number) => { x: number; y: number }
  },
) {
  const { hoverPath, moveDecalImg, cellSize, getCellCenter } = params
  if (!hoverPath || hoverPath.length < 2) return

  ctx.save()
  const icon = moveDecalImg
  if (icon?.naturalWidth) {
    for (let i = 1; i < hoverPath.length; i++) {
      const cell = hoverPath[i]
      const center = getCellCenter(cell.coor.x, cell.coor.z)
      const r = cellSize * 0.2
      drawImageCoverInCircle(ctx, icon, center.x, center.y, r)
    }
  }

  ctx.restore()
}

import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { drawImageCoverInCircle } from './cellsDrawBase'

/** Конец линии не доходит до центра цели — иначе штрих визуально «пропадает» под иконкой приказа. */
function shortenAirTrajectoryEndTowardPrev(
  points: { x: number; y: number }[],
  cellSize: number,
): { x: number; y: number }[] {
  if (points.length < 2) return points
  const margin = Math.max(14, cellSize * 0.24)
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const dx = last.x - prev.x
  const dy = last.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return points
  const trim = Math.min(margin, len * 0.92)
  const nx = dx / len
  const ny = dy / len
  return [...points.slice(0, -1), { x: last.x - nx * trim, y: last.y - ny * trim }]
}

/** Начало линии не доходит до центра вылета — иначе штрих заходит под иконку И-16. */
function shortenAirTrajectoryStartTowardNext(
  points: { x: number; y: number }[],
  cellSize: number,
): { x: number; y: number }[] {
  if (points.length < 2) return points
  const margin = Math.max(14, cellSize * 0.24)
  const first = points[0]
  const next = points[1]
  const dx = next.x - first.x
  const dy = next.y - first.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return points
  const trim = Math.min(margin, len * 0.92)
  const nx = dx / len
  const ny = dy / len
  return [{ x: first.x + nx * trim, y: first.y + ny * trim }, ...points.slice(1)]
}

function trimAirTrajectoryEndpoints(
  points: { x: number; y: number }[],
  cellSize: number,
): { x: number; y: number }[] {
  if (points.length < 2) return points
  return shortenAirTrajectoryStartTowardNext(shortenAirTrajectoryEndTowardPrev(points, cellSize), cellSize)
}

export function drawPathOverlay(
  ctx: CanvasRenderingContext2D,
  params: {
    hoverPath: Cell[] | null | undefined
    /** Пунктирная линия между гексами (авиатраектория). Движение — только иконки на клетках. */
    hoverPathIsAirMission?: boolean
    moveDecalImg: HTMLImageElement | null
    cellSize: number
    getCellCenter: (q: number, r: number) => { x: number; y: number }
  },
) {
  const { hoverPath, hoverPathIsAirMission, moveDecalImg, cellSize, getCellCenter } = params
  if (!hoverPath || hoverPath.length < 2) return

  /** Полный путь; авиалиния начинается от центра гекса вылёта (первая точка пути). */
  const pathToDraw = hoverPath

  ctx.save()

  if (hoverPathIsAirMission) {
    const rawCenters = pathToDraw.map((cell) => getCellCenter(cell.coor.x, cell.coor.z))
    const centers =
      rawCenters.length >= 2 ? trimAirTrajectoryEndpoints(rawCenters, cellSize) : rawCenters
    ctx.beginPath()
    for (let i = 0; i < centers.length; i++) {
      const p = centers[i]
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.92)'
    ctx.lineWidth = Math.max(3, cellSize * 0.08)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.setLineDash([])
  }

  const icon = moveDecalImg
  if (!hoverPathIsAirMission && icon?.naturalWidth) {
    for (let i = 1; i < pathToDraw.length; i++) {
      const cell = pathToDraw[i]
      const center = getCellCenter(cell.coor.x, cell.coor.z)
      const r = cellSize * 0.2
      drawImageCoverInCircle(ctx, icon, center.x, center.y, r)
    }
  }

  ctx.restore()
}

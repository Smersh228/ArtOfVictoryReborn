import type { Cell } from '../../../server/src/game/gameLogic/cells/cell'

/** Допустимые уровни возвышенности на карте / в hexExtra. При отсутствии поля считается 0 (равнина). */
export function effectiveElevationLevel(cell: { hexExtra?: unknown }): number {
  const ex = cell.hexExtra
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return 0
  const raw = (ex as Record<string, unknown>).heightLevel
  if (raw === undefined || raw === null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n)
  if (r < -1 || r > 3) return 0
  return r
}

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const

/** Углы середин рёбер гекса (pointy-top, углы с 0° на восток). */
const HEX_EDGE_MID_DEG = [30, 90, 150, 210, 270, 330] as const

export function buildCellByCubeKey(cells: Cell[]): Map<string, Cell> {
  const map = new Map<string, Cell>()
  for (const c of cells) {
    map.set(`${c.coor.x},${c.coor.y},${c.coor.z}`, c)
  }
  return map
}

function cubeNeighborCoor(hex: { x: number; y: number; z: number }, dir: number) {
  const d = CUBE_NEIGHBOR_DIRS[dir]
  return { x: hex.x + d.x, y: hex.y + d.y, z: hex.z + d.z }
}

function findNeighborByDir(cell: Cell, dir: number, byCube: Map<string, Cell>): Cell | null {
  const nb = cubeNeighborCoor(cell.coor, dir)
  return byCube.get(`${nb.x},${nb.y},${nb.z}`) ?? null
}

/** Индекс ребра (0..5), через которое проходит линия к соседу. */
function edgeIndexTowardNeighbor(
  cellCenter: { x: number; y: number },
  neighborCenter: { x: number; y: number },
): number {
  const deg = ((Math.atan2(neighborCenter.y - cellCenter.y, neighborCenter.x - cellCenter.x) * 180) / Math.PI + 360) % 360
  let best = 0
  let bestDiff = 360
  for (let i = 0; i < 6; i++) {
    let diff = Math.abs(deg - HEX_EDGE_MID_DEG[i])
    if (diff > 180) diff = 360 - diff
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

/**
 * Маска рёбер гекса: true — рисовать ребро.
 * Соседи с той же возвышенностью не получают общую грань (не «закрывают» друг друга).
 */
export function elevationEdgeDrawMask(
  cell: Cell,
  byCube: Map<string, Cell>,
  getCellCenter: (q: number, r: number) => { x: number; y: number },
): boolean[] {
  const selfLevel = effectiveElevationLevel(cell)
  const center = getCellCenter(cell.coor.x, cell.coor.z)
  const mask = [true, true, true, true, true, true]
  for (let dir = 0; dir < 6; dir++) {
    const neighbor = findNeighborByDir(cell, dir, byCube)
    if (!neighbor) continue
    if (effectiveElevationLevel(neighbor) === selfLevel) {
      const nCenter = getCellCenter(neighbor.coor.x, neighbor.coor.z)
      const edgeIdx = edgeIndexTowardNeighbor(center, nCenter)
      mask[edgeIdx] = false
    }
  }
  return mask
}

export function strokeHexEdges(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[],
  edgeMask: boolean[],
  stroke: string,
  lineWidth: number,
) {
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    if (!edgeMask[i]) continue
    const a = corners[i]
    const b = corners[(i + 1) % 6]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

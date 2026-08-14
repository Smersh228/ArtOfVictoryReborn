import { Cell } from '../../../server/src/game/gameLogic/cells/cell'

/** Гексы на краю сетки (у которых нет хотя бы одного соседа в том же наборе — осевые 6 направлений). */
export function computeEdgeCellIds(cells: Cell[]): Set<number> {
  const byKey = new Set<string>()
  for (const c of cells) {
    byKey.add(`${c.coor.x},${c.coor.z}`)
  }
  const axialNeighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ] as const
  const edge = new Set<number>()
  for (const c of cells) {
    const q = c.coor.x
    const r = c.coor.z
    let onEdge = false
    for (const [dq, dr] of axialNeighbors) {
      if (!byKey.has(`${q + dq},${r + dr}`)) {
        onEdge = true
        break
      }
    }
    if (onEdge) edge.add(c.id)
  }
  return edge
}

export function generateEmptyGrid(width: number, height: number): Cell[] {
  const newCells: Cell[] = []
  let id = 1

  const left = -Math.floor(width / 2)
  const right = Math.ceil(width / 2) - 1
  const top = -Math.floor(height / 2)
  const bottom = Math.ceil(height / 2) - 1

  for (let q = left; q <= right; q++) {
    const qOffset = Math.floor(q / 2)
    for (let r = top - qOffset; r <= bottom - qOffset; r++) {
      const s = -q - r
      newCells.push(
        new Cell(
          id++,
          'plain',
          [],
          { x: q, y: s, z: r },
          '',
          0,
          true,
          { infantry: 0, technics: 0 },
          {
            trench: 0,
            trenchEdges: 0,
            wire: 0,
            wireEdges: 0,
            antiTankBuild: 0,
            antiTankEdges: 0,
            storage: 0,
            mine: 0,
            trenchTank: 0,
            dot: 0,
            pontonBridge: 0,
          },
        ),
      )
    }
  }
  return newCells
}

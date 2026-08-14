/** Поворот текстуры гекса на карте: 0…5 — шаги по 60°. */
export const TILE_ROTATION_STEPS = 6

export function readTileRotationSteps(cell: { hexExtra?: unknown }): number {
  const ex = cell.hexExtra
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return 0
  const raw = (ex as Record<string, unknown>).tileRotation
  if (raw === undefined || raw === null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0
  const steps = Math.round(n)
  return ((steps % TILE_ROTATION_STEPS) + TILE_ROTATION_STEPS) % TILE_ROTATION_STEPS
}

export function readTileMirror(cell: { hexExtra?: unknown }): boolean {
  const ex = cell.hexExtra
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return false
  return (ex as Record<string, unknown>).tileMirror === true
}

export function tileRotationRadians(steps: number): number {
  const s = ((Math.round(steps) % TILE_ROTATION_STEPS) + TILE_ROTATION_STEPS) % TILE_ROTATION_STEPS
  return (s * Math.PI) / 3
}

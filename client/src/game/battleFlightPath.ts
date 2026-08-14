import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';

function hexDist(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

function findCellByCoor(cells: Cell[], coor: { x: number; y: number; z: number }): Cell | null {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.coor.x === coor.x && c.coor.y === coor.y && c.coor.z === coor.z) return c;
  }
  return null;
}

function cubeRound(fr: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  let rx = Math.round(fr.x);
  let ry = Math.round(fr.y);
  let rz = Math.round(fr.z);
  const xDiff = Math.abs(rx - fr.x);
  const yDiff = Math.abs(ry - fr.y);
  const zDiff = Math.abs(rz - fr.z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { x: rx, y: ry, z: rz };
}

function cubeLerp(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function dedupeConsecutiveCubes(arr: { x: number; y: number; z: number }[]) {
  const res: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    const last = res[res.length - 1];
    if (!last || last.x !== c.x || last.y !== c.y || last.z !== c.z) res.push(c);
  }
  return res;
}

function cubeLineThroughCube(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number }[] {
  const N = hexDist(a.x, a.y, a.z, b.x, b.y, b.z);
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    out.push(cubeRound(cubeLerp(a, b, t)));
  }
  return dedupeConsecutiveCubes(out);
}

/**
 * Прямая траектория в гексах от точки вылета (A) до назначения (B).
 * Возвращает null, если линия проходит через координату без клетки на поле.
 */
export function computeHexFlightPathCellIds(cells: Cell[], fromCell: Cell, toCell: Cell): number[] | null {
  const line = cubeLineThroughCube(fromCell.coor, toCell.coor);
  const ids: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const cell = findCellByCoor(cells, line[i]);
    if (!cell) return null;
    const id = Number(cell.id);
    if (!ids.length || ids[ids.length - 1] !== id) ids.push(id);
  }
  return ids;
}

/** Точка встречи двух маршрутов (минимум max индексов с обоих концов). */
export function findPathIntersectionCell(pathA: number[], pathB: number[]): number | null {
  const a = pathA.map(Number).filter(Number.isFinite);
  const b = pathB.map(Number).filter(Number.isFinite);
  const indexB = new Map<number, number>();
  for (let i = 0; i < b.length; i++) indexB.set(b[i], i);
  let bestCell: number | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < a.length; i++) {
    const id = a[i];
    if (!indexB.has(id)) continue;
    const score = Math.max(i, indexB.get(id)!);
    if (score < bestScore) {
      bestScore = score;
      bestCell = id;
    }
  }
  return bestCell;
}

export function readFlightPathCellIdsFromUnit(unit: Record<string, unknown> | null | undefined): number[] {
  const tac = unit?.tactical as Record<string, unknown> | undefined;
  const sortie = tac?.airSortie as Record<string, unknown> | undefined;
  if (sortie && Array.isArray(sortie.pathCellIds) && sortie.pathCellIds.length) {
    return (sortie.pathCellIds as unknown[]).map(Number).filter(Number.isFinite);
  }
  if (tac && Array.isArray(tac.airMissionFlightPath) && tac.airMissionFlightPath.length) {
    return (tac.airMissionFlightPath as unknown[]).map(Number).filter(Number.isFinite);
  }
  return [];
}

function readEffectivePathIndex(unit: Record<string, unknown>, path: number[]): number {
  const sortie = (unit.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined;
  if (!sortie || typeof sortie !== 'object') return -1;
  const phase = String(sortie.phase ?? '').trim();
  if (phase === 'patrol') return Math.max(0, path.length - 1);
  if (phase === 'inbound') {
    const idx = Number(sortie.pathIndex);
    return Number.isFinite(idx) ? idx : -1;
  }
  if (
    phase === 'cooldown' &&
    Array.isArray(sortie.returnPathCellIds) &&
    (sortie.returnPathCellIds as unknown[]).length
  ) {
    const idx = Number(sortie.pathIndex);
    return Number.isFinite(idx) ? idx : -1;
  }
  return -1;
}

export function computeInterceptionMeetingCell(
  cells: Cell[],
  interceptorCell: Cell,
  targetUnit: Record<string, unknown>,
  readEngagementCellId: (unit: Record<string, unknown>, physicalCellId: number) => number,
): { meetingCellId: number; interceptorPath: number[] } | null {
  const fullTargetPath = readFlightPathCellIdsFromUnit(targetUnit);
  if (!fullTargetPath.length) return null;
  const targetIdx = readEffectivePathIndex(targetUnit, fullTargetPath);
  const targetPath = targetIdx > 0 ? fullTargetPath.slice(targetIdx) : fullTargetPath;

  const tac = targetUnit.tactical as Record<string, unknown> | undefined;
  const targetEndId = Number(tac?.airMissionTargetCellId) || fullTargetPath[fullTargetPath.length - 1];
  const targetEndCell = cells.find((c) => c.id === targetEndId);
  const currentCellId = readEngagementCellId(targetUnit, Number(targetEndId));
  const currentCell = cells.find((c) => Number(c.id) === Number(currentCellId));
  if (!targetEndCell || !currentCell || !interceptorCell) return null;

  const approachPath =
    computeHexFlightPathCellIds(cells, interceptorCell, currentCell) ??
    computeHexFlightPathCellIds(cells, interceptorCell, targetEndCell);
  if (!approachPath?.length) return null;

  let meetingCellId = findPathIntersectionCell(targetPath, approachPath);
  if (meetingCellId == null) {
    meetingCellId = Number(currentCellId);
  }
  if (!Number.isFinite(meetingCellId)) return null;
  const meetingCell = cells.find((c) => c.id === meetingCellId);
  if (!meetingCell) return null;
  const interceptorPath = computeHexFlightPathCellIds(cells, interceptorCell, meetingCell);
  if (!interceptorPath?.length) return null;
  return { meetingCellId, interceptorPath };
}

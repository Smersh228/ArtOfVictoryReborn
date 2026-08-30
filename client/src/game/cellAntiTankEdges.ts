import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';
import { findMoveDir, moveDirToVisualEdge } from './cellWireEdges';

export function getAntiTankEdgesMask(builds: IBuildCell | undefined | null): number {
  const b = ensureCellBuilds(builds);
  const raw = (b as { antiTankEdges?: unknown }).antiTankEdges;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return n & 0x3f;
  const legacy = b.antiTankBuild;
  const lt = typeof legacy === 'number' ? legacy : Number(legacy);
  if (Number.isFinite(lt) && lt > 0) return 0x3f;
  return 0;
}

export function hasAntiTankOnCell(builds: IBuildCell | undefined | null): boolean {
  return getAntiTankEdgesMask(builds) !== 0;
}

export function hasAntiTankOnEdge(builds: IBuildCell | undefined | null, edgeDir: number): boolean {
  if (edgeDir < 0 || edgeDir > 5) return false;
  return (getAntiTankEdgesMask(builds) & (1 << edgeDir)) !== 0;
}

export function hasAntiTankOnMoveDir(builds: IBuildCell | undefined | null, moveDir: number): boolean {
  return hasAntiTankOnEdge(builds, moveDirToVisualEdge(moveDir));
}

export function toggleAntiTankEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  const mask = getAntiTankEdgesMask(base);
  const bit = 1 << edgeDir;
  return { ...base, antiTankEdges: (mask ^ bit) & 0x3f, antiTankBuild: 0 };
}

export function clearAllAntiTankOnBuilds(builds: IBuildCell | undefined | null): IBuildCell {
  return { ...ensureCellBuilds(builds), antiTankEdges: 0, antiTankBuild: 0 };
}

export function clearAntiTankEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  return { ...base, antiTankEdges: getAntiTankEdgesMask(base) & ~(1 << edgeDir), antiTankBuild: 0 };
}

export function isAntiTankBlockedUnitType(type: string): boolean {
  const t = String(type || '').trim();
  return t === 'tech' || t === 'armor' || t === 'lightTank' || t === 'mediumTank' || t === 'heavyTank';
}

/** Танки и бронетехника не проходят через грань с танковым ежом. */
export function antiTankBlocksGroundMove(
  fromCell: Cell,
  toCell: Cell,
  unit: { type?: string },
): boolean {
  if (!isAntiTankBlockedUnitType(String(unit.type || ''))) return false;
  const dir = findMoveDir(fromCell, toCell);
  if (dir < 0) return false;
  const oppDir = (dir + 3) % 6;
  const blockedExit = hasAntiTankOnMoveDir(fromCell.builds, dir);
  const blockedEntry = hasAntiTankOnMoveDir(toCell.builds, oppDir);
  return blockedExit || blockedEntry;
}

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

export function adjacentCellsWithAntiTank(fromCell: Cell, allCells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let dir = 0; dir < 6; dir++) {
    const d = CUBE_NEIGHBOR_DIRS[dir];
    const nb = allCells.find(
      (c) =>
        c.coor.x === fromCell.coor.x + d.x &&
        c.coor.y === fromCell.coor.y + d.y &&
        c.coor.z === fromCell.coor.z + d.z,
    );
    if (!nb) continue;
    const oppDir = (dir + 3) % 6;
    if (hasAntiTankOnMoveDir(fromCell.builds, dir) || hasAntiTankOnMoveDir(nb.builds, oppDir)) {
      out.push(nb);
    }
  }
  return out;
}

export function cellsEligibleForCutEj(fromCell: Cell, allCells: Cell[]): Cell[] {
  const out = adjacentCellsWithAntiTank(fromCell, allCells);
  if (hasAntiTankOnCell(fromCell.builds)) out.unshift(fromCell);
  return out;
}

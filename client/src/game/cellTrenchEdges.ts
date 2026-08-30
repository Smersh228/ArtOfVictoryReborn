import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';

const FORBIDDEN_TYPES = new Set([
  'river',
  'swamp',
  'marsh',
  'bog',
  'lake',
  'water',
  'ford',
  'stones',
  'stone',
  'rock',
  'rocks',
  'bridge',
  'railwaybridge',
  'railbridge',
  'rail_bridge',
]);

const FORBIDDEN_NAME_RE =
  /река|болот|озер|озёр|брод|камн|мост|железнодорожн/i;

export function getTrenchEdgesMask(builds: IBuildCell | undefined | null): number {
  const b = ensureCellBuilds(builds);
  const raw = (b as { trenchEdges?: unknown }).trenchEdges;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return n & 0x3f;
  const legacy = b.trench;
  const lt = typeof legacy === 'number' ? legacy : Number(legacy);
  if (Number.isFinite(lt) && lt > 0) return 0x3f;
  return 0;
}

export function hasTrenchOnCell(builds: IBuildCell | undefined | null): boolean {
  return getTrenchEdgesMask(builds) !== 0;
}

export function hasTrenchOnEdge(builds: IBuildCell | undefined | null, edgeDir: number): boolean {
  if (edgeDir < 0 || edgeDir > 5) return false;
  return (getTrenchEdgesMask(builds) & (1 << edgeDir)) !== 0;
}

export function toggleTrenchEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  const mask = getTrenchEdgesMask(base);
  const bit = 1 << edgeDir;
  return { ...base, trenchEdges: (mask ^ bit) & 0x3f, trench: 0 };
}

export function clearAllTrenchOnBuilds(builds: IBuildCell | undefined | null): IBuildCell {
  return { ...ensureCellBuilds(builds), trenchEdges: 0, trench: 0 };
}

export function clearTrenchEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  return { ...base, trenchEdges: getTrenchEdgesMask(base) & ~(1 << edgeDir), trench: 0 };
}

export function addTrenchEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  const mask = getTrenchEdgesMask(base);
  return { ...base, trenchEdges: (mask | (1 << edgeDir)) & 0x3f, trench: 0 };
}

function hexExtraObj(cell: Cell | null | undefined): Record<string, unknown> | null {
  const ex = cell && (cell as { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null;
}

export function isTrenchForbiddenOnCell(cell: Cell | null | undefined): boolean {
  if (!cell) return true;
  const ex = hexExtraObj(cell);
  const placement = ex?.placementAllowed as Record<string, unknown> | undefined;
  if (placement && placement.trench === false) return true;
  if (ex && ex.isBridge === true) return true;
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (FORBIDDEN_TYPES.has(t)) return true;
  const name = String((ex && (ex.name || ex.label)) || (cell as { name?: unknown }).name || '');
  if (FORBIDDEN_NAME_RE.test(name) || FORBIDDEN_NAME_RE.test(String(cell.type || ''))) return true;
  return false;
}

function hexDist(a: Cell, b: Cell): number {
  return (
    (Math.abs(a.coor.x - b.coor.x) + Math.abs(a.coor.y - b.coor.y) + Math.abs(a.coor.z - b.coor.z)) / 2
  );
}

export function cellsEligibleForTrenchFacing(fromCell: Cell, allCells: Cell[]): Cell[] {
  if (isTrenchForbiddenOnCell(fromCell)) return [];
  const out: Cell[] = [];
  for (const c of allCells) {
    if (hexDist(fromCell, c) !== 1) continue;
    out.push(c);
  }
  return out;
}

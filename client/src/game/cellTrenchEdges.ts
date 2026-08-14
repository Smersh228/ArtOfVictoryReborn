import type { IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';

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

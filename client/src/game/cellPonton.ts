import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';

export const PONTON_COMPLETE_SECTIONS = 4;

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

export function pontonSections(builds: IBuildCell | undefined | null): number {
  return Math.max(0, Math.floor(Number(ensureCellBuilds(builds).pontonBridge) || 0));
}

export function isPontonBuilding(builds: IBuildCell | undefined | null): boolean {
  const b = ensureCellBuilds(builds);
  const n = pontonSections(b);
  return Boolean((b as { pontonBuilding?: boolean }).pontonBuilding) && n > 0 && n < PONTON_COMPLETE_SECTIONS;
}

export function isPontonComplete(builds: IBuildCell | undefined | null): boolean {
  const n = pontonSections(builds);
  if (n <= 0) return false;
  if (n >= PONTON_COMPLETE_SECTIONS) return true;
  return !isPontonBuilding(builds);
}

export function hasPontonOnCell(builds: IBuildCell | undefined | null): boolean {
  return pontonSections(builds) > 0;
}

export function pontonDrawOpacity(builds: IBuildCell | undefined | null): number {
  if (isPontonComplete(builds)) return 1;
  const s = pontonSections(builds);
  return Math.max(0.35, Math.min(0.95, 0.25 + s * 0.18));
}

export function isRiverCell(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const rawType = String(cell.type || '').trim();
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'river' || t === 'rivers') return true;
  const extra = cell as Cell & { name?: string };
  const name = String(extra.name || '');
  const blob = `${rawType} ${name}`;
  if (!/река/i.test(blob)) return false;
  if (/озер|озёр|болот/i.test(blob)) return false;
  return true;
}

export function cellsEligibleForPonton(fromCell: Cell, allCells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const d of CUBE_NEIGHBOR_DIRS) {
    const nb = allCells.find(
      (c) =>
        c.coor.x === fromCell.coor.x + d.x &&
        c.coor.y === fromCell.coor.y + d.y &&
        c.coor.z === fromCell.coor.z + d.z,
    );
    if (!nb || !isRiverCell(nb) || isPontonComplete(nb.builds)) continue;
    out.push(nb);
  }
  return out;
}

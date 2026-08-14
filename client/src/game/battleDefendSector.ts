import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { maxShootRangeStepsForUnit } from './battleFirePreview';
import { unitHasPropKey } from './battleTerrain';

/** Свойство каталога «Сектор стрельбы» (fireSector). */
export function artilleryUsesFireSectorProperty(unit: Record<string, unknown>): boolean {
  return String(unit.type || '').toLowerCase() === 'artillery' && unitHasPropKey(unit, 'fireSector');
}

/** Развёрнутая артиллерия со свойством fireSector — огонь только по сектору. */
export function artilleryFireRestrictedToSector(unit: Record<string, unknown>): boolean {
  const tac = unit.tactical as { artilleryDeployed?: boolean } | undefined;
  return tac?.artilleryDeployed === true && artilleryUsesFireSectorProperty(unit);
}

const CUBE_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

function findDirIndexFromDelta(du: { x: number; y: number; z: number }): number {
  for (let k = 0; k < 6; k++) {
    const d = CUBE_DIRS[k];
    if (d.x === du.x && d.y === du.y && d.z === du.z) return k;
  }
  return -1;
}

function findCellByCoor(allCells: Cell[], coor: { x: number; y: number; z: number }): Cell | null {
  for (let i = 0; i < allCells.length; i++) {
    const c = allCells[i];
    if (c.coor.x === coor.x && c.coor.y === coor.y && c.coor.z === coor.z) return c;
  }
  return null;
}

const HEX_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

export function findFacingNeighborCells(unitCell: Cell, allCells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const dir of HEX_DIRS) {
    const coor = {
      x: unitCell.coor.x + dir.x,
      y: unitCell.coor.y + dir.y,
      z: unitCell.coor.z + dir.z,
    };
    const c = allCells.find((h) => h.coor.x === coor.x && h.coor.y === coor.y && h.coor.z === coor.z);
    if (c) out.push(c);
  }
  return out;
}


export function computeDefendSectorCells(
  unitCell: Cell,
  facingCell: Cell,
  allCells: Cell[],
  attacker: Record<string, unknown>,
  rangeCapSteps?: number,
): Cell[] {
  const weaponMax = maxShootRangeStepsForUnit(attacker);
  const cap =
    rangeCapSteps != null && Number.isFinite(rangeCapSteps)
      ? Math.max(1, Math.min(Number(rangeCapSteps), weaponMax))
      : weaponMax;

  const du = {
    x: facingCell.coor.x - unitCell.coor.x,
    y: facingCell.coor.y - unitCell.coor.y,
    z: facingCell.coor.z - unitCell.coor.z,
  };
  const k0 = findDirIndexFromDelta(du);
  if (k0 < 0) return [];

  const d0 = CUBE_DIRS[k0];
  const dLeft = CUBE_DIRS[(k0 + 1) % 6];
  const dRight = CUBE_DIRS[(k0 + 5) % 6];

  const seen = new Set<number>();
  const out: Cell[] = [];
  for (const d1 of [dLeft, dRight]) {
    for (let s = 1; s <= cap; s++) {
      for (let i = 1; i <= s; i++) {
        const j = s - i;
        const coor = {
          x: unitCell.coor.x + i * d0.x + j * d1.x,
          y: unitCell.coor.y + i * d0.y + j * d1.y,
          z: unitCell.coor.z + i * d0.z + j * d1.z,
        };
        const c = findCellByCoor(allCells, coor);
        if (!c || c.id === unitCell.id) continue;
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

/** Сектор обстрела: только для артиллерии со свойством fireSector. */
export function getArtillerySectorCellIdSet(
  unit: Record<string, unknown>,
  unitCell: Cell,
  cells: Cell[],
): Set<number> | null {
  if (String(unit.type || '').toLowerCase() !== 'artillery') return null;
  if (!artilleryUsesFireSectorProperty(unit)) return null;
  const tac = unit.tactical as { artilleryDeployed?: boolean } | undefined;
  if (tac?.artilleryDeployed !== true) return null;

  const secRaw = unit.defendSectorCellIds;
  if (Array.isArray(secRaw) && secRaw.length > 0) {
    const set = new Set<number>();
    for (const x of secRaw) {
      const n = Number(x);
      if (Number.isFinite(n)) set.add(n);
    }
    if (set.size > 0) return set;
  }

  const facingId = Number(unit.defendFacingCellId);
  if (!Number.isFinite(facingId)) return null;
  const fc = cells.find((c) => c.id === facingId);
  if (!fc) return null;
  const capRaw = Number(unit.defendMaxRangeSteps);
  const range = Number.isFinite(capRaw) && capRaw >= 1 ? capRaw : maxShootRangeStepsForUnit(unit);
  const sectorCells = computeDefendSectorCells(unitCell, fc, cells, unit, range);
  if (!sectorCells.length) return null;
  return new Set(sectorCells.map((c) => c.id));
}

export function isCellInArtillerySector(
  unit: Record<string, unknown>,
  unitCell: Cell,
  cells: Cell[],
  targetCellId: number,
): boolean {
  if (!artilleryFireRestrictedToSector(unit)) return true;
  const sec = getArtillerySectorCellIdSet(unit, unitCell, cells);
  if (!sec) return false;
  return sec.has(targetCellId);
}

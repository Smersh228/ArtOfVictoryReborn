import type { Cell } from './cells/cell';


export type Cube = { x: number; y: number; z: number };

function cellToCube(c: Cell): Cube {
  return { x: c.coor.x, y: c.coor.y, z: c.coor.z };
}


export function cubeDistance(a: Cube, b: Cube): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function cubeLerp(a: Cube, b: Cube, t: number): Cube {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function cubeRound(frac: Cube): Cube {
  let rx = Math.round(frac.x);
  let ry = Math.round(frac.y);
  let rz = Math.round(frac.z);

  const xDiff = Math.abs(rx - frac.x);
  const yDiff = Math.abs(ry - frac.y);
  const zDiff = Math.abs(rz - frac.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}


export function cubeLineDraw(a: Cube, b: Cube): Cube[] {
  const n = cubeDistance(a, b);
  if (n === 0) return [a];
  const raw: Cube[] = [];
  for (let i = 0; i <= n; i++) {
    raw.push(cubeRound(cubeLerp(a, b, (1 / n) * i)));
  }
  const dedup: Cube[] = [];
  for (const c of raw) {
    const last = dedup[dedup.length - 1];
    if (!last || last.x !== c.x || last.y !== c.y || last.z !== c.z) dedup.push(c);
  }
  return dedup;
}

export function findCellByCube(cells: Cell[], cube: Cube): Cell | undefined {
  return cells.find((c) => c.coor.x === cube.x && c.coor.y === cube.y && c.coor.z === cube.z);
}


const LOS_BLOCKING_TERRAIN = new Set([
  'mountain',
  'forest',
  'hill',
  'city',
  'village',
  'openforest',
  'bushs',
  'лес',
  'редколесье',
  'кустарники',
  'город',
  'деревня',
]);

export function cellBlocksLineOfSight(cell: Cell): boolean {
  const ext = cell as unknown as {
    mapBuilding?: unknown;
    visionBlock?: unknown;
  };
  if (ext.mapBuilding != null) return true;
  const vb = ext.visionBlock;
  if (vb === true || vb === 'true' || vb === 1 || vb === '1') return true;

  const vis = (cell as unknown as { visible?: boolean }).visible;
  if (vis === false) return true;

  const t = String(cell.type || '')
    .trim()
    .toLowerCase();
  if (LOS_BLOCKING_TERRAIN.has(t)) return true;
  return false;
}


export function isHexVisible(observer: Cell, target: Cell, cells: Cell[]): boolean {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target));
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i]);
    if (!c) return false;
    if (cellBlocksLineOfSight(c)) return false;
  }
  return true;
}


export function visibleCellIdsInRange(observer: Cell, maxRange: number, cells: Cell[]): Set<number> {
  const obs = cellToCube(observer);
  const out = new Set<number>();
  out.add(observer.id);
  for (const c of cells) {
    if (c.id === observer.id) continue;
    if (cubeDistance(obs, cellToCube(c)) > maxRange) continue;
    if (isHexVisible(observer, c, cells)) out.add(c.id);
  }
  return out;
}

export type LosPathInfo = {
  pathCells: Cell[];
  blockingCells: Cell[];
  targetVisible: boolean;
};

export function analyzeLineOfSight(observer: Cell, target: Cell, cells: Cell[]): LosPathInfo {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target));
  const pathCells: Cell[] = [];
  for (const q of line) {
    const c = findCellByCube(cells, q);
    if (c) pathCells.push(c);
  }
  const blockingCells: Cell[] = [];
  for (let i = 1; i < pathCells.length - 1; i++) {
    if (cellBlocksLineOfSight(pathCells[i])) blockingCells.push(pathCells[i]);
  }
  const targetVisible = isHexVisible(observer, target, cells);
  return { pathCells, blockingCells, targetVisible };
}

type FactionSide = 'rkka' | 'wehrmacht' | 'none';


type UnitFogFields = {
  faction?: string;
  str?: number;
  strength?: number;
  vis?: number;
  visible?: number;
  visibleRange?: number;
  tactical?: { fireSuppression?: boolean };
};

function unitFaction(u: UnitFogFields): FactionSide {
  const f = String(u.faction || '').toLowerCase();
  if (f === 'germany' || f === 'wehrmacht') return 'wehrmacht';
  if (f === 'ussr' || f === 'rkka') return 'rkka';
  return 'none';
}

function getUnitStrength(u: UnitFogFields): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

function readVisionRange(u: UnitFogFields): number {
  if (u.tactical?.fireSuppression) return 1;
  const n = Number(u.vis ?? u.visible ?? u.visibleRange);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/**

 * Статический метод {@link VisibleLogic.computeRevealedCellIdsForFaction} 
 */
export class VisibleLogic {
  private readonly cells: Cell[]

  constructor(cells: Cell[]) {
    this.cells = cells
  }

  computeVisibleCellIds(observer: Cell, maxRange: number): Set<number> {
    return visibleCellIdsInRange(observer, maxRange, this.cells);
  }

  canSee(observer: Cell, target: Cell, maxRange: number): boolean {
    if (cubeDistance(cellToCube(observer), cellToCube(target)) > maxRange) return false;
    return isHexVisible(observer, target, this.cells);
  }

  analyze(observer: Cell, target: Cell): LosPathInfo {
    return analyzeLineOfSight(observer, target, this.cells);
  }


  static computeRevealedCellIdsForFaction(
    cells: Cell[],
    faction: FactionSide,
  ): Set<number> | null {
    if (faction === 'none') return null;
    const revealed = new Set<number>();
    for (const cell of cells) {
      const us = (cell.units || []) as unknown as UnitFogFields[];
      for (const u of us) {
        if (unitFaction(u) !== faction) continue;
        if (getUnitStrength(u) <= 0) continue;
        const r = readVisionRange(u);
        const ids = visibleCellIdsInRange(cell, r, cells);
        ids.forEach((id) => revealed.add(id));
      }
    }
    return revealed;
  }
}

function factionsOpposedSides(a: FactionSide, b: FactionSide): boolean {
  if (a === 'none' || b === 'none') return false;
  return a !== b;
}


export function isCellSeenByAnyHostileUnit(
  subjectUnit: UnitFogFields,
  targetCell: Cell,
  cells: Cell[],
): boolean {
  const mySide = unitFaction(subjectUnit);
  for (const cell of cells) {
    const us = (cell.units || []) as unknown as UnitFogFields[];
    for (const u of us) {
      if (getUnitStrength(u) <= 0) continue;
      if (!factionsOpposedSides(mySide, unitFaction(u))) continue;
      const seen = visibleCellIdsInRange(cell, readVisionRange(u), cells);
      if (seen.has(targetCell.id)) return true;
    }
  }
  return false;
}

/**
 *  {@link cellBlocksLineOfSight}).
 */
export function canPlaceAmbushFromEnemyVision(
  subjectUnit: UnitFogFields,
  ambushCell: Cell,
  cells: Cell[],
): boolean {
  return (
    !isCellSeenByAnyHostileUnit(subjectUnit, ambushCell, cells) &&
    cellBlocksLineOfSight(ambushCell)
  );
}


export { VisibleLogic as HexVisibility };

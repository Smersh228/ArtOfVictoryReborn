import type { Cell } from './cells/cell';


export type Cube = { x: number; y: number; z: number };

type UnitFogFields = {
  faction?: string;
  type?: string;
  str?: number;
  strength?: number;
  vis?: number;
  visible?: number;
  visibleRange?: number;
  tactical?: { fireSuppression?: boolean; inDot?: boolean };
};

const DOT_VISION_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

function cellHasDot(cell: Cell): boolean {
  const b = (cell as Cell & { builds?: { dot?: unknown } }).builds;
  return b != null && Number(b.dot) > 0;
}

function resolveDotFacingForVision(dotCell: Cell, cells: Cell[]): number {
  const b = (dotCell as Cell & { builds?: { dotFacing?: unknown; dotFacingCellId?: unknown } }).builds;
  const facingCellId = Number(b?.dotFacingCellId);
  if (Number.isFinite(facingCellId)) {
    const nb = cells.find((c) => Number(c.id) === facingCellId);
    if (nb) {
      const dx = Number(nb.coor.x) - Number(dotCell.coor.x);
      const dz = Number(nb.coor.z) - Number(dotCell.coor.z);
      for (let i = 0; i < DOT_VISION_DIRS.length; i++) {
        if (DOT_VISION_DIRS[i].x === dx && DOT_VISION_DIRS[i].z === dz) return i;
      }
    }
  }
  const n = Number(b?.dotFacing);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.floor(n);
  return 0;
}

function dotOccupantVisionCellIds(
  observer: Cell,
  unit: UnitFogFields,
  cells: Cell[],
): Set<number> | null {
  if (!unit.tactical?.inDot || !cellHasDot(observer)) return null;
  const maxSteps = String(unit.type || '').toLowerCase() === 'artillery' ? 4 : 3;
  const facingDir = resolveDotFacingForVision(observer, cells);
  const d0 = DOT_VISION_DIRS[facingDir];
  const dLeft = DOT_VISION_DIRS[(facingDir + 1) % 6];
  const dRight = DOT_VISION_DIRS[(facingDir + 5) % 6];
  const ox = Number(observer.coor.x);
  const oz = Number(observer.coor.z);
  const out = new Set<number>();
  out.add(observer.id);
  for (const d1 of [dLeft, dRight]) {
    for (let s = 1; s <= maxSteps; s++) {
      for (let i = 0; i <= s; i++) {
        const j = s - i;
        const wantX = ox + i * d0.x + j * d1.x;
        const wantZ = oz + i * d0.z + j * d1.z;
        const cell = cells.find((c) => Number(c.coor.x) === wantX && Number(c.coor.z) === wantZ);
        if (!cell || Number(cell.id) === Number(observer.id)) continue;
        out.add(Number(cell.id));
      }
    }
  }
  return out;
}

function effectiveElevationLevel(cell: Cell | null | undefined): number {
  if (!cell) return 0;
  const ex = (cell as unknown as { hexExtra?: unknown }).hexExtra;
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return 0;
  const raw = (ex as Record<string, unknown>).heightLevel;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n);
  if (r < -1 || r > 3) return 0;
  return r;
}

function isRavine(cell: Cell | null | undefined): boolean {
  return effectiveElevationLevel(cell) === -1;
}

function hexFlagOn(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** Река не закрывает обстрел: ни как овраг, ни как преграда видимости. */
function hexLooksLikeRiver(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = (cell as { hexExtra?: Record<string, unknown> }).hexExtra;
  if (ex && typeof ex === 'object') {
    if (hexFlagOn(ex.moveWithRiverProp) || hexFlagOn(ex.moveWithWaterUnitProp)) return true;
    if (hexFlagOn(ex.isRiver) || hexFlagOn(ex.river)) return true;
    const cat = String(ex.category || '')
      .trim()
      .toLowerCase();
    if (cat === 'rivers' || cat === 'river' || cat === 'water' || cat === 'waters') return true;
  }
  const rawType = String(cell.type || '').trim();
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'river' || t === 'rivers' || t === 'water') return true;
  const name = String(cell.name || (ex && (ex.name || ex.label)) || '');
  const img = String((cell as { img?: string }).img || (cell as { imagePath?: string }).imagePath || '');
  const blob = `${rawType} ${name} ${img}`;
  return (
    /река|руч(?:ей|ья|ью)?|канал|речн|водн|брод|river|water|ford/i.test(blob) &&
    !/озер|озёр|болот|swamp|marsh|lake/i.test(blob)
  );
}

function isBattleAirUnitType(u: UnitFogFields | null | undefined): boolean {
  const t = String(u?.type ?? '');
  return t === 'lightAir' || t === 'heavyAir';
}

function elevationLoSBonusSteps(observer: Cell, target: Cell): number {
  const obsE = effectiveElevationLevel(observer);
  const tgtE = effectiveElevationLevel(target);
  if (obsE <= tgtE) return 0;
  const diff = obsE - tgtE;
  if (diff >= 2) return 2;
  if (diff >= 1) return 1;
  return 0;
}

function hexDistCells(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  );
}

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
  if (hexLooksLikeRiver(cell)) return false;
  const ext = cell as unknown as {
    mapBuilding?: unknown;
    visionBlock?: unknown;
    hexExtra?: { visionBlock?: unknown };
  };
  if (ext.mapBuilding != null) return true;
  const vb = ext.visionBlock ?? ext.hexExtra?.visionBlock;
  if (vb === true || vb === 'true' || vb === 1 || vb === '1') return true;

  const vis = (cell as unknown as { visible?: boolean }).visible;
  if (vis === false) return true;

  const t = String(cell.type || '')
    .trim()
    .toLowerCase();
  if (LOS_BLOCKING_TERRAIN.has(t)) return true;
  return false;
}

function cellHasSmoke(cell: Cell | undefined | null): boolean {
  if (!cell) return false;
  const raw = (cell as { builds?: { smoke?: unknown } }).builds?.smoke;
  if (raw && typeof raw === 'object') return true;
  return Number(raw) > 0;
}

/** Дым закрывает всю линию за собой, не только один гекс тени. */
function lineOpenThroughSmoke(observer: Cell, target: Cell, cells: Cell[]): boolean {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target));
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i]);
    if (!c) return false;
    if (cellHasSmoke(c)) return false;
  }
  return true;
}

export type HexVisibilityOptions = {
  airObserver?: boolean;
};

function ravineBlocksHexLoS(
  observer: Cell,
  target: Cell,
  dist: number,
  options?: HexVisibilityOptions,
): boolean {
  if (options?.airObserver) return false;
  if (isRavine(observer) && !hexLooksLikeRiver(observer) && dist > 1) return true;
  if (isRavine(target) && !hexLooksLikeRiver(target) && dist > 1) return true;
  return false;
}

/** Гребень выше наблюдателя закрывает клетки за собой; сам гребень виден как цель. */
function lineOpenWithElevationRidge(observer: Cell, target: Cell, cells: Cell[]): boolean {
  const obsE = effectiveElevationLevel(observer);
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target));
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i]);
    if (!c) return false;
    if (hexLooksLikeRiver(c)) continue;
    if (effectiveElevationLevel(c) > obsE) return false;
  }
  return true;
}

/** Тень в один гекс сразу за преградой для видимости. */
function lineOpenWithOneHexShadow(observer: Cell, target: Cell, cells: Cell[]): boolean {
  const line = cubeLineDraw(cellToCube(observer), cellToCube(target));
  const targetCube = cellToCube(target);
  for (let i = 1; i < line.length - 1; i++) {
    const c = findCellByCube(cells, line[i]);
    if (!c) return false;
    if (!cellBlocksLineOfSight(c)) continue;
    const shadowCube = line[i + 1];
    if (
      shadowCube &&
      shadowCube.x === targetCube.x &&
      shadowCube.y === targetCube.y &&
      shadowCube.z === targetCube.z
    ) {
      return false;
    }
  }
  return true;
}

export function isHexVisible(
  observer: Cell,
  target: Cell,
  cells: Cell[],
  options?: HexVisibilityOptions,
): boolean {
  if (!observer || !target) return false;
  const dist = hexDistCells(observer, target);
  if (dist <= 0) return true;
  if (ravineBlocksHexLoS(observer, target, dist, options)) return false;
  if (!options?.airObserver && !lineOpenWithElevationRidge(observer, target, cells)) return false;
  if (!lineOpenThroughSmoke(observer, target, cells)) return false;
  return lineOpenWithOneHexShadow(observer, target, cells);
}


export function visibleCellIdsInRange(
  observer: Cell,
  maxRange: number,
  cells: Cell[],
  options?: HexVisibilityOptions,
): Set<number> {
  const obs = cellToCube(observer);
  const out = new Set<number>();
  out.add(observer.id);
  for (const c of cells) {
    if (c.id === observer.id) continue;
    const dist = cubeDistance(obs, cellToCube(c));
    const bonus = elevationLoSBonusSteps(observer, c);
    if (dist > maxRange + bonus) continue;
    if (isHexVisible(observer, c, cells, options)) out.add(c.id);
  }
  return out;
}

export function isUnitVisibleFromCell(
  observerCell: Cell,
  observerUnit: UnitFogFields | null | undefined,
  targetCell: Cell,
  _targetUnit: UnitFogFields | null | undefined,
  cells: Cell[],
): boolean {
  if (!observerCell || !targetCell) return false;
  const dist = hexDistCells(observerCell, targetCell);
  if (dist <= 0) return true;
  const airObs = observerUnit && isBattleAirUnitType(observerUnit);
  if (isRavine(observerCell) && !hexLooksLikeRiver(observerCell) && dist > 1 && !airObs) return false;
  if (isRavine(targetCell) && !hexLooksLikeRiver(targetCell) && dist > 1 && !airObs) return false;
  return isHexVisible(observerCell, targetCell, cells, { airObserver: !!airObs });
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
    if (cellBlocksLineOfSight(pathCells[i]) || cellHasSmoke(pathCells[i])) blockingCells.push(pathCells[i]);
  }
  const targetVisible = isHexVisible(observer, target, cells);
  return { pathCells, blockingCells, targetVisible };
}

type FactionSide = 'rkka' | 'wehrmacht' | 'none';

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
  let base = 6;
  if (u.tactical?.fireSuppression) base = 1;
  else {
    const n = Number(u.vis ?? u.visible ?? u.visibleRange);
    base = Number.isFinite(n) && n > 0 ? n : 6;
  }
  const pen = Number((globalThis as { __aovBattleEnv?: { visionPenalty?: number } }).__aovBattleEnv?.visionPenalty) || 0;
  return Math.max(0, base - pen);
}

/**

 * Статический метод {@link VisibleLogic.computeRevealedCellIdsForFaction} 
 */
export class VisibleLogic {
  private readonly cells: Cell[]

  constructor(cells: Cell[]) {
    this.cells = cells
  }

  computeVisibleCellIds(observer: Cell, maxRange: number, options?: HexVisibilityOptions): Set<number> {
    return visibleCellIdsInRange(observer, maxRange, this.cells, options);
  }

  canSee(observer: Cell, target: Cell, maxRange: number, options?: HexVisibilityOptions): boolean {
    const dist = cubeDistance(cellToCube(observer), cellToCube(target));
    const bonus = elevationLoSBonusSteps(observer, target);
    if (dist > maxRange + bonus) return false;
    return isHexVisible(observer, target, this.cells, options);
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
        const fromDot = dotOccupantVisionCellIds(cell, u, cells);
        if (fromDot) {
          revealed.add(cell.id);
          fromDot.forEach((id) => {
            const t = cells.find((x) => Number(x.id) === Number(id));
            if (t && lineOpenThroughSmoke(cell, t, cells)) revealed.add(Number(id));
          });
          continue;
        }
        const ids = visibleCellIdsInRange(cell, readVisionRange(u), cells, {
          airObserver: isBattleAirUnitType(u),
        });
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
      const fromDot = dotOccupantVisionCellIds(cell, u, cells);
      if (fromDot) {
        if (fromDot.has(targetCell.id)) return true;
        continue;
      }
      const seen = visibleCellIdsInRange(cell, readVisionRange(u), cells, {
        airObserver: isBattleAirUnitType(u),
      });
      if (seen.has(targetCell.id)) return true;
      if (isUnitVisibleFromCell(cell, u, targetCell, null, cells)) return true;
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

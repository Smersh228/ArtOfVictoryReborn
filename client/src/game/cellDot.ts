import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../api/rooms';
import type { LobbyFaction } from '../api/rooms';
import { findUnitCellByInstanceId } from './battleMovePreview';
import { isHexVisible } from './hexVisibility';
import { ensureCellBuilds } from './editorMapFortifications';
import { unitHasPropKey } from './battleTerrain';
import { applyAccuracyRangeShift } from './battleEnvironment';

function hexDistDot(a: Cell, b: Cell): number {
  const ax = Number(a.coor?.x);
  const ay = Number(a.coor?.y);
  const az = Number(a.coor?.z);
  const bx = Number(b.coor?.x);
  const by = Number(b.coor?.y);
  const bz = Number(b.coor?.z);
  if ([ax, ay, az, bx, by, bz].every((n) => Number.isFinite(n))) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  }
  if ([ax, az, bx, bz].every((n) => Number.isFinite(n))) {
    return (Math.abs(ax - bx) + Math.abs(az - bz) + Math.abs(ax - bx + az - bz)) / 2;
  }
  return Number.POSITIVE_INFINITY;
}

const DOT_HEX_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

function findDotCellByCoor(
  allCells: Cell[],
  coor: { x: number; y: number; z: number },
): Cell | null {
  for (let i = 0; i < allCells.length; i++) {
    const c = allCells[i];
    if (c.coor.x === coor.x && c.coor.z === coor.z) return c;
  }
  return null;
}

function factionsOpposedDot(fa: string, fb: string): boolean {
  const a = String(fa || '').trim().toLowerCase();
  const b = String(fb || '').trim().toLowerCase();
  const sov = a === 'ussr' || a === 'rkka';
  const axis = a === 'germany' || a === 'wehrmacht';
  const sovB = b === 'ussr' || b === 'rkka';
  const axisB = b === 'germany' || b === 'wehrmacht';
  return (sov && axisB) || (axis && sovB);
}

function unitIsMineForDot(unit: Record<string, unknown>, viewerFaction: LobbyFaction): boolean {
  if (viewerFaction === 'none') return true;
  const raw = String(unit.faction ?? '')
    .trim()
    .toLowerCase();
  const unitIsSoviet = raw === 'ussr' || raw === 'rkka';
  const unitIsAxis = raw === 'germany' || raw === 'wehrmacht';
  if (!unitIsSoviet && !unitIsAxis) return false;
  if (viewerFaction === 'rkka') return unitIsSoviet;
  if (viewerFaction === 'wehrmacht') return unitIsAxis;
  return false;
}
/** Индекс = дистанция гекса (0 не используется), как у обычных таблиц range. */
export const DOT_INF_RANGE = [0, 3, 2, 1] as const;
export const DOT_ART_RANGE = [0, 2, 2, 1, 1] as const;
export const DOT_INF_MAX_STEPS = DOT_INF_RANGE.length - 1;
export const DOT_ART_MAX_STEPS = DOT_ART_RANGE.length - 1;
export const DOT_INF_INTENSITY: Record<string, number> = { inf: 10, art: 10, tech: 10, build: 10 };
export const DOT_ART_INTENSITY: Record<string, number> = {
  inf: 6,
  art: 6,
  build: 6,
  tech: 9,
  armor: 10,
  lt: 12,
  mt: 12,
  ht: 10,
};

export function hasDotOnCell(builds: IBuildCell | undefined | null): boolean {
  return Number(ensureCellBuilds(builds).dot) > 0;
}

export function initDotBattleFields(builds: IBuildCell | undefined | null): IBuildCell {
  const b = ensureCellBuilds(builds);
  if (!hasDotOnCell(b)) return b;
  const out = { ...b };
  const def = Number(out.dotDef);
  if (!Number.isFinite(def) || def <= 0) out.dotDef = 4;
  const ammo = Number(out.dotAmmo);
  if (!Number.isFinite(ammo)) out.dotAmmo = 15;
  return out;
}

export function getDotOccupantInstanceId(builds: IBuildCell | undefined | null): number | null {
  const id = Number(ensureCellBuilds(builds).dotOccupantId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function isDotEmpty(builds: IBuildCell | undefined | null): boolean {
  return hasDotOnCell(builds) && getDotOccupantInstanceId(builds) == null;
}

/** ДОТ свободен: нет живого гарнизона и никто не занимает его сейчас. */
export function isDotCellVacant(dotCell: Cell, allCells: Cell[]): boolean {
  if (!hasDotOnCell(dotCell.builds)) return false;
  return resolveDotOccupantUnit(dotCell, allCells) == null;
}

export function unitInDot(unit: Record<string, unknown> | null | undefined): boolean {
  const tac = unit?.tactical as { inDot?: boolean } | undefined;
  return tac?.inDot === true;
}

export function unitDotExiting(unit: Record<string, unknown> | null | undefined): boolean {
  const n = Number((unit?.tactical as { dotExitTurnsLeft?: number } | undefined)?.dotExitTurnsLeft);
  return Number.isFinite(n) && n > 0;
}

export function unitDotEntering(unit: Record<string, unknown> | null | undefined): boolean {
  const n = Number((unit?.tactical as { dotEnterTurnsLeft?: number } | undefined)?.dotEnterTurnsLeft);
  return Number.isFinite(n) && n > 0;
}

export function unitHoldsDot(unit: Record<string, unknown> | null | undefined): boolean {
  return unitInDot(unit) || unitDotEntering(unit);
}

export function countSurfaceUnitsOnCell(
  cell: Cell,
  getStr: (u: Record<string, unknown>) => number,
): number {
  let n = 0;
  for (const u of cell.units || []) {
    const ru = u as Record<string, unknown>;
    if (getStr(ru) <= 0) continue;
    if (unitInDot(ru)) continue;
    n++;
  }
  return n;
}

export function maxSurfaceUnitsOnCell(cell: Cell): number {
  return hasDotOnCell(cell.builds) ? 2 : 3;
}

export function canUnitOccupySurfaceOnCell(
  cell: Cell,
  getStr: (u: Record<string, unknown>) => number,
): boolean {
  return countSurfaceUnitsOnCell(cell, getStr) < maxSurfaceUnitsOnCell(cell);
}

export function canEnterDotUnitType(unit: Record<string, unknown>): boolean {
  if (unitHasPropKey(unit, 'fireAirGun')) return false;
  const t = String(unit.type || '').toLowerCase();
  return t === 'infantry' || t === 'artillery';
}

/** Синтетические приказы ДОТ (не из БД) для пехоты и артиллерии. */
export const DEFAULT_DOT_BATTLE_ORDERS: ReadonlyArray<{
  id: number;
  name: string;
  order_key: string;
}> = [
  { id: -9001, name: 'Занять ДОТ', order_key: 'enterDot' },
  { id: -9002, name: 'Покинуть ДОТ', order_key: 'exitDot' },
];

export function appendDefaultDotOrders<T extends { id: number; name: string; order_key?: string }>(
  orders: T[],
  unit: Record<string, unknown>,
): T[] {
  if (!canEnterDotUnitType(unit)) return orders;
  const keys = new Set(
    orders.map((o) => String(o.order_key ?? '').trim()).filter((k) => k.length > 0),
  );
  const out = [...orders];
  const inDot = unitInDot(unit);
  const exiting = unitDotExiting(unit);
  const entering = unitDotEntering(unit);
  if (!inDot && !entering && !keys.has('enterDot')) {
    out.push({ id: -9001, name: 'Занять ДОТ', order_key: 'enterDot' } as T);
  }
  if (inDot && !exiting && !keys.has('exitDot')) {
    out.push({ id: -9002, name: 'Покинуть ДОТ', order_key: 'exitDot' } as T);
  }
  return out;
}

export function unitFiresFromDot(unit: Record<string, unknown> | null | undefined): boolean {
  return unitInDot(unit) && !unitDotExiting(unit);
}

function fireRowHasRangedPositive(
  unit: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  const opts = unit?.fireRowOptions as Record<string, { melee?: boolean } | undefined> | undefined;
  if (opts?.[key]?.melee === true) return false;
  const src =
    (unit?._fireRaw as Record<string, unknown> | undefined) ??
    (unit?.fire as Record<string, unknown> | undefined);
  if (!src || typeof src !== 'object') return false;
  const raw = src[key];
  if (raw == null || raw === '') return false;
  const nums = Array.isArray(raw)
    ? raw.map((x) => Number(x) || 0)
    : String(raw)
        .split(',')
        .map((x) => Number(String(x).trim()) || 0);
  return nums.some((n) => n > 0);
}

function dotShooterUsesArtilleryTables(unit: Record<string, unknown> | null | undefined): boolean {
  const t = String(unit?.type || '').toLowerCase();
  if (t === 'artillery' || unitHasPropKey(unit, 'fireSector')) return true;
  return fireRowHasRangedPositive(unit, 'armor') ||
    fireRowHasRangedPositive(unit, 'lt') ||
    fireRowHasRangedPositive(unit, 'mt') ||
    fireRowHasRangedPositive(unit, 'ht');
}

export function dotRangeArrayForUnit(unit: Record<string, unknown>): number[] | null {
  if (!unitFiresFromDot(unit)) return null;
  if (dotShooterUsesArtilleryTables(unit)) return [...DOT_ART_RANGE];
  if (String(unit.type || '').toLowerCase() === 'infantry') return [...DOT_INF_RANGE];
  return null;
}

export function dotIntensityForTarget(
  attacker: Record<string, unknown>,
  targetType: unknown,
): number | null {
  if (!unitFiresFromDot(attacker)) return null;
  const key = String(targetType || '')
    .trim()
    .toLowerCase();
  const fireKey =
    key === 'infantry'
      ? 'inf'
      : key === 'artillery'
        ? 'art'
        : key === 'tech'
          ? 'tech'
          : key === 'armor'
            ? 'armor'
            : key === 'lighttank'
              ? 'lt'
              : key === 'mediumtank'
                ? 'mt'
                : key === 'heavytank'
                  ? 'ht'
                  : key === 'lightair'
                    ? 'sa'
                    : key === 'heavyair'
                      ? 'ba'
                      : 'inf';
  if (dotShooterUsesArtilleryTables(attacker)) return DOT_ART_INTENSITY[fireKey] ?? 0;
  if (String(attacker.type || '').toLowerCase() === 'infantry') return DOT_INF_INTENSITY[fireKey] ?? 0;
  return null;
}

export function cellsEligibleForEnterDot(
  unitCell: Cell,
  cells: Cell[],
  getStr: (u: Record<string, unknown>) => number,
): Cell[] {
  const out: Cell[] = [];
  const sameId = (a: Cell, b: Cell) => Number(a.id) === Number(b.id);
  const dist = (a: Cell, b: Cell) => {
    return hexDistDot(a, b);
  };
  const tryPush = (c: Cell) => {
    if (!isDotCellVacant(c, cells)) return;
    if (!sameId(c, unitCell) && !canUnitOccupySurfaceOnCell(c, getStr)) return;
    if (!out.some((x) => sameId(x, c))) out.push(c);
  };
  tryPush(unitCell);
  for (const c of cells) {
    if (sameId(c, unitCell)) continue;
    if (dist(unitCell, c) === 1) tryPush(c);
  }
  return out;
}

function isAxialNeighborDot(a: Cell, b: Cell): boolean {
  const dx = Number(b.coor.x) - Number(a.coor.x);
  const dz = Number(b.coor.z) - Number(a.coor.z);
  return (
    (dx === 1 && dz === 0) ||
    (dx === -1 && dz === 0) ||
    (dx === 0 && dz === 1) ||
    (dx === 0 && dz === -1) ||
    (dx === 1 && dz === -1) ||
    (dx === -1 && dz === 1)
  );
}

export function cellsEligibleForExitDot(
  dotCell: Cell,
  cells: Cell[],
  getStr: (u: Record<string, unknown>) => number,
): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    if (Number(c.id) === Number(dotCell.id)) continue;
    if (!isAxialNeighborDot(dotCell, c)) continue;
    if (!canUnitOccupySurfaceOnCell(c, getStr)) continue;
    out.push(c);
  }
  return out;
}

export function getDotAmmo(builds: IBuildCell | undefined | null): number {
  return Math.max(0, Math.floor(Number(ensureCellBuilds(builds).dotAmmo) || 0));
}

export function getDotDef(builds: IBuildCell | undefined | null): number {
  const d = Number(ensureCellBuilds(builds).dotDef);
  return Number.isFinite(d) && d > 0 ? d : 4;
}

export type DotOccupancySide = 'friendly' | 'enemy' | 'empty';

export function resolveDotOccupantUnit(
  dotCell: Cell,
  allCells: Cell[],
): { unit: Record<string, unknown>; cell: Cell } | null {
  const occId = getDotOccupantInstanceId(dotCell.builds);
  if (occId != null) {
    const found = findUnitCellByInstanceId(allCells, occId);
    if (found) {
      const u = found.unit as Record<string, unknown>;
      const str = Number(u.str ?? u.strength);
      if (unitHoldsDot(u) && Number.isFinite(str) && str > 0) {
        return { unit: u, cell: found.cell };
      }
    }
  }
  for (const raw of dotCell.units || []) {
    const u = raw as Record<string, unknown>;
    const str = Number(u.str ?? u.strength);
    if (unitHoldsDot(u) && Number.isFinite(str) && str > 0) {
      return { unit: u, cell: dotCell };
    }
  }
  return null;
}

/** Гарнизон ДОТ на клетке под курсором (спрайт в бою скрыт, ховер идёт на гекс). */
export function resolveDotOccupantAtCellId(
  cellId: number | null | undefined,
  cells: Cell[],
): Record<string, unknown> | null {
  if (cellId == null || !Number.isFinite(Number(cellId))) return null;
  const cell = cells.find((c) => Number(c.id) === Number(cellId));
  if (!cell || !hasDotOnCell(cell.builds)) return null;
  return resolveDotOccupantUnit(cell, cells)?.unit ?? null;
}

export function dotOccupancySide(
  dotCell: Cell,
  allCells: Cell[],
  viewerFaction: LobbyFaction,
): DotOccupancySide {
  const occ = resolveDotOccupantUnit(dotCell, allCells);
  if (!occ) return 'empty';
  return unitIsMineForDot(occ.unit, viewerFaction) ? 'friendly' : 'enemy';
}

export type DotHoverTip = {
  title: string;
  defense: number;
  ammo: number;
  occupantLabel: string | null;
  occupancySide: DotOccupancySide;
  statusLabel: string;
};

export function buildDotHoverTip(dotCell: Cell, allCells: Cell[], viewerFaction: LobbyFaction): DotHoverTip {
  const side = dotOccupancySide(dotCell, allCells, viewerFaction);
  const occ = resolveDotOccupantUnit(dotCell, allCells);
  let occupantLabel: string | null = null;
  let statusLabel = 'Пустой';
  if (side === 'friendly' && occ) {
    occupantLabel = String(occ.unit.name ?? 'Юнит');
    statusLabel = unitDotEntering(occ.unit) ? 'Занимается' : 'Ваш гарнизон';
  } else if (side === 'enemy') {
    statusLabel = occ && unitDotEntering(occ.unit) ? 'Занимается противником' : 'Занят противником';
  }
  return {
    title: 'ДОТ',
    defense: getDotDef(dotCell.builds),
    ammo: getDotAmmo(dotCell.builds),
    occupantLabel,
    occupancySide: side,
    statusLabel,
  };
}

export function shouldShowDotTipForUnitHover(
  cell: Cell,
  unit: Record<string, unknown>,
): boolean {
  return hasDotOnCell(cell.builds) && unitInDot(unit);
}

export function isDotFireShooter(
  unit: Record<string, unknown>,
  cell: Cell,
  allCells: Cell[],
): boolean {
  if (unitFiresFromDot(unit)) return true;
  const occ = resolveDotOccupantUnit(cell, allCells);
  if (!occ) return false;
  return Number(occ.unit.instanceId) === Number(unit.instanceId);
}

export function hasDotFacing(builds: IBuildCell | undefined | null): boolean {
  const b = ensureCellBuilds(builds);
  const n = Number(b.dotFacing);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return true;
  const cid = Number(b.dotFacingCellId);
  return Number.isFinite(cid);
}

export function getDotFacingDir(builds: IBuildCell | undefined | null): number {
  const n = Number(ensureCellBuilds(builds).dotFacing);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.floor(n);
  return 0;
}

export function findDotFacingDirFromNeighbor(dotCell: Cell, neighbor: Cell): number | null {
  const dx = Number(neighbor.coor.x) - Number(dotCell.coor.x);
  const dz = Number(neighbor.coor.z) - Number(dotCell.coor.z);
  for (let k = 0; k < 6; k++) {
    const d = DOT_HEX_DIRS[k];
    if (d.x === dx && d.z === dz) return k;
  }
  return null;
}

export function neighborCellIdsOf(center: Cell, cells: Cell[]): number[] {
  const ids: number[] = [];
  for (const c of cells) {
    if (Number(c.id) === Number(center.id)) continue;
    if (findDotFacingDirFromNeighbor(center, c) != null) ids.push(Number(c.id));
  }
  return ids;
}

export function resolveDotFacingDir(dotCell: Cell, allCells?: Cell[]): number {
  const facingCellId = Number(ensureCellBuilds(dotCell.builds).dotFacingCellId);
  if (allCells && Number.isFinite(facingCellId)) {
    const nb = allCells.find((c) => Number(c.id) === facingCellId);
    if (nb) {
      const dir = findDotFacingDirFromNeighbor(dotCell, nb);
      if (dir != null) return dir;
    }
  }
  return getDotFacingDir(dotCell.builds);
}

export function dotFireSectorMaxSteps(unit: Record<string, unknown> | null | undefined): number {
  return unit && dotShooterUsesArtilleryTables(unit) ? DOT_ART_MAX_STEPS : DOT_INF_MAX_STEPS;
}

/** Дальность огня из ДОТ после тумана/ночи (видимость сектора не режется). */
export function dotFireMaxStepsForEnvironment(unit: Record<string, unknown> | null | undefined): number {
  const base = unit && dotShooterUsesArtilleryTables(unit) ? [...DOT_ART_RANGE] : [...DOT_INF_RANGE];
  const ra = applyAccuracyRangeShift(base);
  return Math.max(0, ra.length - 1);
}

/** Сектор стрельбы ДОТ: заполненный веер (фронт + два соседних направления). */
export function computeDotFireSectorCellIds(
  dotCell: Cell,
  allCells: Cell[],
  maxSteps: number,
  facingDirOverride?: number,
): number[] {
  if (!dotCell || maxSteps < 1) return [];
  const facingDir =
    facingDirOverride != null && facingDirOverride >= 0 && facingDirOverride <= 5
      ? facingDirOverride
      : resolveDotFacingDir(dotCell, allCells);
  const ox = Number(dotCell.coor.x);
  const oz = Number(dotCell.coor.z);
  const oy = Number.isFinite(Number(dotCell.coor.y)) ? Number(dotCell.coor.y) : -ox - oz;
  const d0 = DOT_HEX_DIRS[facingDir];
  const dLeft = DOT_HEX_DIRS[(facingDir + 1) % 6];
  const dRight = DOT_HEX_DIRS[(facingDir + 5) % 6];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d1 of [dLeft, dRight]) {
    for (let s = 1; s <= maxSteps; s++) {
      for (let i = 0; i <= s; i++) {
        const j = s - i;
        const cell = findDotCellByCoor(allCells, {
          x: ox + i * d0.x + j * d1.x,
          y: oy + i * d0.y + j * d1.y,
          z: oz + i * d0.z + j * d1.z,
        });
        if (!cell || Number(cell.id) === Number(dotCell.id)) continue;
        const id = Number(cell.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function computeOccupiedDotFireSectorCellIds(
  dotCell: Cell,
  allCells: Cell[],
  options?: { forFire?: boolean },
): number[] {
  if (!hasDotOnCell(dotCell.builds)) return [];
  const occ = resolveDotOccupantUnit(dotCell, allCells);
  if (!occ || !unitInDot(occ.unit)) return [];
  const maxSteps = options?.forFire
    ? dotFireMaxStepsForEnvironment(occ.unit)
    : dotFireSectorMaxSteps(occ.unit);
  if (maxSteps < 1) return [];
  return computeDotFireSectorCellIds(dotCell, allCells, maxSteps);
}

/** Видимость юнита в ДОТ: свой гекс + сектор стрельбы. */
export function dotOccupantVisionCellIds(
  observerCell: Cell,
  unit: Record<string, unknown> | null | undefined,
  allCells: Cell[],
): number[] | null {
  if (!unitInDot(unit) || !hasDotOnCell(observerCell.builds)) return null;
  const ids = computeDotFireSectorCellIds(observerCell, allCells, dotFireSectorMaxSteps(unit));
  return [Number(observerCell.id), ...ids];
}

/** Сектор ДОТ в редакторе карт: три направления, дальность пехоты. */
export function computeEditorDotFireSectorCellIds(
  dotCell: Cell,
  allCells: Cell[],
  facingDirOverride?: number,
): number[] {
  if (!hasDotOnCell(dotCell.builds) && facingDirOverride == null) return [];
  return computeDotFireSectorCellIds(dotCell, allCells, DOT_INF_MAX_STEPS, facingDirOverride);
}

/** Цели огня из ДОТ: враги в секторе, в LoS и в тумане видимости. */
export function computeDotFireHighlights(
  attacker: Record<string, unknown>,
  attackerCell: Cell,
  cells: Cell[],
  fogRevealedCellIds?: Set<number> | number[] | null,
): { instanceIds: Set<number>; areaCellIds: Set<number> } {
  const instanceIds = new Set<number>();
  const areaCellIds = new Set<number>();
  const maxD = dotFireMaxStepsForEnvironment(attacker);
  if (maxD < 1) return { instanceIds, areaCellIds };
  const af = String(attacker.faction ?? '');
  const fogHas = (id: number) => {
    if (fogRevealedCellIds == null) return true;
    if (Array.isArray(fogRevealedCellIds)) return fogRevealedCellIds.some((x) => Number(x) === Number(id));
    return fogRevealedCellIds.has(id);
  };
  const sectorIds = new Set(computeDotFireSectorCellIds(attackerCell, cells, maxD));
  for (const cell of cells) {
    if (Number(cell.id) === Number(attackerCell.id)) continue;
    if (sectorIds.size > 0 && !sectorIds.has(Number(cell.id))) continue;
    const d = hexDistDot(attackerCell, cell);
    if (!Number.isFinite(d) || d < 1 || d > maxD) continue;
    if (!fogHas(cell.id)) continue;
    if (!isHexVisible(attackerCell, cell, cells)) continue;
    let any = false;
    for (const raw of cell.units || []) {
      const u = raw as Record<string, unknown>;
      const tid = Number(u.instanceId);
      if (!Number.isFinite(tid)) continue;
      const str = Number(u.str ?? u.strength);
      if (Number.isFinite(str) && str <= 0) continue;
      if (!factionsOpposedDot(af, String(u.faction ?? ''))) continue;
      if (unitInDot(u)) continue;
      const io = dotIntensityForTarget(attacker, u.type);
      if (io != null && io <= 0) continue;
      const atkType = String(attacker.type || '').toLowerCase();
      const tgtType = String(u.type || '').toLowerCase();
      const armored =
        tgtType === 'armor' || tgtType === 'lighttank' || tgtType === 'mediumtank' || tgtType === 'heavytank';
      if (atkType === 'infantry' && armored) {
        const fk =
          tgtType === 'armor' ? 'armor' : tgtType === 'lighttank' ? 'lt' : tgtType === 'heavytank' ? 'ht' : 'mt';
        if (!fireRowHasRangedPositive(attacker, fk)) continue;
      }
      instanceIds.add(tid);
      any = true;
    }
    if (any) areaCellIds.add(Number(cell.id));
  }
  return { instanceIds, areaCellIds };
}

/** Убирает заведомо невалидные приказы ДОТ перед отправкой на сервер. */
export function sanitizeDotOrdersBeforeSubmit(
  orders: BattleOrderPayload[],
  cells: Cell[],
): BattleOrderPayload[] {
  const getStr = (u: Record<string, unknown>) => {
    const n = Number(u.str ?? u.strength);
    return Number.isFinite(n) ? n : 0;
  };
  return orders.filter((o) => {
    const key = String(o.orderKey ?? '').trim();
    if (key !== 'enterDot' && key !== 'exitDot') return true;
    const uid = Number(o.unitInstanceId);
    if (!Number.isFinite(uid)) return false;
    const live = findUnitCellByInstanceId(cells, uid);
    if (!live) return false;
    const u = live.unit as Record<string, unknown>;
    if (key === 'exitDot') {
      if (!unitInDot(u) || unitDotExiting(u)) return false;
      const cid = Number(o.targetCellId);
      if (!Number.isFinite(cid)) return false;
      const dest = cells.find((c) => c.id === cid);
      if (!dest) return false;
      if (!isAxialNeighborDot(live.cell, dest)) return false;
      return canUnitOccupySurfaceOnCell(dest, getStr);
    }
    if (unitInDot(u) || unitDotEntering(u)) return false;
    const cid = Number(o.targetCellId);
    if (!Number.isFinite(cid)) return false;
    const dotCell = cells.find((c) => c.id === cid);
    if (!dotCell || !isDotCellVacant(dotCell, cells)) return false;
    if (hexDistDot(live.cell, dotCell) > 1) return false;
    if (hexDistDot(live.cell, dotCell) === 1 && !canUnitOccupySurfaceOnCell(dotCell, getStr)) {
      return false;
    }
    return true;
  });
}

/** Убирает залипшие приказы прошлого хода: стоящая засада, занятый сапёр, ход в клетку где уже стоим. */
export function sanitizeStaleBattleOrders(
  orders: BattleOrderPayload[],
  cells: Cell[],
): BattleOrderPayload[] {
  return orders.filter((o) => {
    const key = String(o.orderKey ?? '').trim();
    const uid = Number(o.unitInstanceId);
    if (!Number.isFinite(uid)) return false;
    const live = findUnitCellByInstanceId(cells, uid);
    if (!live) return false;
    const u = live.unit as Record<string, unknown>;
    const tac = (u.tactical || {}) as {
      ambushOrder?: boolean;
      defendOrder?: boolean;
      ambushRevealed?: boolean;
      sapperJob?: { key?: string; turnsLeft?: number };
    };
    if (key === 'ambush' && tac.ambushOrder && !tac.defendOrder && !tac.ambushRevealed) {
      return false;
    }
    if (Number(tac.sapperJob?.turnsLeft) > 0) return false;
    if ((key === 'move' || key === 'moveWar') && Number(o.targetCellId) === Number(live.cell.id)) {
      return false;
    }
    return true;
  });
}


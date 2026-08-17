import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../api/rooms';
import type { LobbyFaction } from '../api/rooms';
import { findUnitCellByInstanceId } from './battleMovePreview';
import { ensureCellBuilds } from './editorMapFortifications';
import { hexDistCells } from './battleFirePreview';
import { unitIsMineOnMap } from '../pages/battlePageUtils';
export const DOT_INF_RANGE = [3, 2, 1] as const;
export const DOT_ART_RANGE = [2, 2, 1, 1] as const;

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

/** ДОТ свободен: нет живого гарнизона с inDot (устаревший dotOccupantId не блокирует вход). */
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
  if (!inDot && !keys.has('enterDot')) {
    out.push({ id: -9001, name: 'Занять ДОТ', order_key: 'enterDot' } as T);
  }
  if (inDot && !exiting && !keys.has('exitDot')) {
    out.push({ id: -9002, name: 'Покинуть ДОТ', order_key: 'exitDot' } as T);
  }
  return out;
}

export function dotRangeArrayForUnit(unit: Record<string, unknown>): number[] | null {
  if (!unitInDot(unit) || unitDotExiting(unit)) return null;
  const t = String(unit.type || '').toLowerCase();
  if (t === 'artillery') return [...DOT_ART_RANGE];
  if (t === 'infantry') return [...DOT_INF_RANGE];
  return null;
}

export function cellsEligibleForEnterDot(
  unitCell: Cell,
  cells: Cell[],
  getStr: (u: Record<string, unknown>) => number,
): Cell[] {
  const out: Cell[] = [];
  const tryPush = (c: Cell) => {
    if (!isDotCellVacant(c, cells)) return;
    if (c.id !== unitCell.id && !canUnitOccupySurfaceOnCell(c, getStr)) return;
    if (!out.some((x) => x.id === c.id)) out.push(c);
  };
  tryPush(unitCell);
  for (const c of cells) {
    if (c.id === unitCell.id) continue;
    if (hexDistCells(unitCell, c) === 1) tryPush(c);
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
      if (unitInDot(u) && Number.isFinite(str) && str > 0) {
        return { unit: u, cell: found.cell };
      }
    }
  }
  for (const raw of dotCell.units || []) {
    const u = raw as Record<string, unknown>;
    const str = Number(u.str ?? u.strength);
    if (unitInDot(u) && Number.isFinite(str) && str > 0) {
      return { unit: u, cell: dotCell };
    }
  }
  return null;
}

export function dotOccupancySide(
  dotCell: Cell,
  allCells: Cell[],
  viewerFaction: LobbyFaction,
): DotOccupancySide {
  const occ = resolveDotOccupantUnit(dotCell, allCells);
  if (!occ) return 'empty';
  return unitIsMineOnMap(occ.unit, viewerFaction) ? 'friendly' : 'enemy';
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
    statusLabel = 'Ваш гарнизон';
  } else if (side === 'enemy') {
    statusLabel = 'Занят противником';
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
    if (key === 'exitDot') return unitInDot(u) && !unitDotExiting(u);
    if (unitInDot(u)) return false;
    const cid = Number(o.targetCellId);
    if (!Number.isFinite(cid)) return false;
    const dotCell = cells.find((c) => c.id === cid);
    if (!dotCell || !isDotCellVacant(dotCell, cells)) return false;
    if (hexDistCells(live.cell, dotCell) > 1) return false;
    if (hexDistCells(live.cell, dotCell) === 1 && !canUnitOccupySurfaceOnCell(dotCell, getStr)) {
      return false;
    }
    return true;
  });
}

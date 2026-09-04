import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { hasPontonOnCell } from './cellPonton';
import { hasDotOnCell } from './cellDot';
import { cellHasWarehouse } from './battleLogisticsUi';
import { isDestroyedBridgeHex, isIntactBridgeHex, isRailwayBridgeHex } from './battleSpecialTerrain';
import { isRailwayDestroyedHex, isRailwayHex } from './cellRailway';
import { getUnitExplosivesStock, getUnitMinesStock } from './battleUnitStatsTip';

const SAPPER_ORDER_KEYS = new Set([
  'buildponton',
  'cutej',
  'cutwire',
  'demining',
  'mining',
  'trenches',
]);

function hexDist(a: Cell, b: Cell): number {
  const ax = Number(a.coor?.x);
  const az = Number(a.coor?.z);
  const bx = Number(b.coor?.x);
  const bz = Number(b.coor?.z);
  const ay = Number(a.coor?.y);
  const by = Number(b.coor?.y);
  if (Number.isFinite(ay) && Number.isFinite(by)) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  }
  const dq = ax - bx;
  const dr = az - bz;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function unitPaysDemolitionWithMines(unit: Record<string, unknown> | null | undefined): boolean {
  const orders = unit && Array.isArray(unit.orders) ? unit.orders : [];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i] as { order_key?: string; key?: string } | null;
    const k = String((o && (o.order_key || o.key)) || '')
      .trim()
      .toLowerCase();
    if (SAPPER_ORDER_KEYS.has(k)) return true;
  }
  return false;
}

export function canPayDemolitionCharge(unit: Record<string, unknown> | null | undefined): boolean {
  if (!unit) return false;
  if (unitPaysDemolitionWithMines(unit)) return getUnitMinesStock(unit) >= 1;
  return getUnitExplosivesStock(unit) >= 1;
}

export function demolitionChargeHint(unit: Record<string, unknown> | null | undefined): string {
  if (unitPaysDemolitionWithMines(unit)) {
    return getUnitMinesStock(unit) >= 1 ? '' : 'Нет мин в запасе';
  }
  return getUnitExplosivesStock(unit) >= 1 ? '' : 'Нет взрывчатки';
}

export function demolitionStructureKind(cell: Cell | null | undefined): string | null {
  if (!cell) return null;
  if (hasPontonOnCell(cell.builds)) return 'ponton';
  if (hasDotOnCell(cell.builds)) return 'dot';
  if (cellHasWarehouse(cell)) return 'storage';
  const ex =
    cell &&
    (cell as Cell & { hexExtra?: unknown }).hexExtra &&
    typeof (cell as Cell & { hexExtra?: unknown }).hexExtra === 'object'
      ? ((cell as Cell & { hexExtra: Record<string, unknown> }).hexExtra as Record<string, unknown>)
      : null;
  const flaggedRailBridge = Boolean(ex && ex.isRailwayBridge === true);
  const flaggedBridge = Boolean(ex && ex.isBridge === true);
  const flaggedRailway = Boolean(ex && (ex.isRailway === true || ex.railway === true || ex.rail === true));
  if (!isDestroyedBridgeHex(cell)) {
    if ((isIntactBridgeHex(cell) && isRailwayBridgeHex(cell)) || flaggedRailBridge) return 'railBridge';
    if (isIntactBridgeHex(cell) || flaggedBridge) return 'bridge';
  }
  if (!isDestroyedBridgeHex(cell) && !isRailwayDestroyedHex(cell) && (isRailwayHex(cell) || flaggedRailway)) {
    return 'railway';
  }
  return null;
}

export function cellsEligibleForDemolition(fromCell: Cell, cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    if (hexDist(fromCell, c) !== 1) continue;
    if (demolitionStructureKind(c)) out.push(c);
  }
  return out;
}

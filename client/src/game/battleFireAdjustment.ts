import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { visibleCellIdsInRange } from './hexVisibility';
import { battleUnitHasPropKey } from './battleFirePreview';
import { unitFactionKey } from './battleHqMorale';
import { applyVisionPenalty } from './battleEnvironment';

function getStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 0;
}

function readVisionRange(u: Record<string, unknown>): number {
  const tac = u.tactical as { fireSuppression?: boolean } | undefined;
  if (tac?.fireSuppression) return applyVisionPenalty(1);
  const n = Number(u.vis ?? u.visible ?? u.visibleRange);
  return applyVisionPenalty(Number.isFinite(n) && n > 0 ? n : 6);
}

function isBattleAirUnit(u: Record<string, unknown>): boolean {
  const t = String(u.type ?? '');
  return t === 'lightAir' || t === 'heavyAir';
}

function isUnitInTransport(u: Record<string, unknown>): boolean {
  const id = Number((u.tactical as { embarkedTransportInstanceId?: unknown } | undefined)?.embarkedTransportInstanceId);
  return Number.isFinite(id) && id > 0;
}

function normalizeSideFaction(factionKey: string): 'rkka' | 'wehrmacht' | 'none' {
  const f = String(factionKey || '').trim().toLowerCase();
  if (f === 'ussr' || f === 'rkka') return 'rkka';
  if (f === 'germany' || f === 'wehrmacht') return 'wehrmacht';
  return 'none';
}

function unitSideMatches(unit: Record<string, unknown>, side: 'rkka' | 'wehrmacht'): boolean {
  return normalizeSideFaction(unitFactionKey(unit)) === side;
}

export function hasActiveFireAdjustmentSpotter(cells: Cell[], viewerFaction: string): boolean {
  const side = normalizeSideFaction(viewerFaction);
  if (side === 'none') return false;
  for (const cell of cells) {
    for (const raw of cell.units || []) {
      const u = raw as Record<string, unknown>;
      if (getStr(u) <= 0) continue;
      if (!unitSideMatches(u, side)) continue;
      if (isBattleAirUnit(u)) continue;
      if (!battleUnitHasPropKey(u, 'fireAdjustment')) continue;
      if (isUnitInTransport(u)) continue;
      return true;
    }
  }
  return false;
}

export function isCellVisibleToAnyFriendly(cells: Cell[], viewerFaction: string, targetCell: Cell): boolean {
  const side = normalizeSideFaction(viewerFaction);
  if (side === 'none' || !targetCell) return false;
  for (const cell of cells) {
    for (const raw of cell.units || []) {
      const u = raw as Record<string, unknown>;
      if (getStr(u) <= 0) continue;
      if (!unitSideMatches(u, side)) continue;
      if (isBattleAirUnit(u)) continue;
      const seen = visibleCellIdsInRange(cell, readVisionRange(u), cells);
      if (seen.has(targetCell.id)) return true;
    }
  }
  return false;
}

export function isArtilleryUnitBattle(u: Record<string, unknown>): boolean {
  return String(u.type ?? '').toLowerCase() === 'artillery';
}

export function canArtilleryUseFireAdjustment(
  unit: Record<string, unknown>,
  orderKey: string,
): boolean {
  if (String(orderKey).trim() !== 'fire') return false;
  if (isBattleAirUnit(unit)) return false;
  return (
    isArtilleryUnitBattle(unit) ||
    battleUnitHasPropKey(unit, 'areaFire') ||
    battleUnitHasPropKey(unit, 'concealedTargetFire')
  );
}

export function fireAdjustmentAlreadyUsedInOrders(
  pendingOrders: Array<{ useFireAdjustment?: boolean; unitInstanceId?: number }>,
  viewerFaction: string,
  cells: Cell[],
  findUnitById: (id: number) => Record<string, unknown> | null,
): boolean {
  const side = normalizeSideFaction(viewerFaction);
  if (side === 'none') return false;
  for (const o of pendingOrders) {
    if (!o.useFireAdjustment) continue;
    const u = findUnitById(Number(o.unitInstanceId));
    if (!u) continue;
    if (unitSideMatches(u, side)) return true;
  }
  return false;
}

export function canOfferFireAdjustment(
  cells: Cell[],
  viewerFaction: string,
  pendingOrders: Array<{ useFireAdjustment?: boolean; unitInstanceId?: number }>,
  findUnitById: (id: number) => Record<string, unknown> | null,
): boolean {
  if (!hasActiveFireAdjustmentSpotter(cells, viewerFaction)) return false;
  return !fireAdjustmentAlreadyUsedInOrders(pendingOrders, viewerFaction, cells, findUnitById);
}

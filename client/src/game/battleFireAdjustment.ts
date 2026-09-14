import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { battleUnitHasPropKey } from './battleFirePreview';
import { unitUsesGunDeploy } from './battleDefendSector';
import { unitFactionKey } from './battleHqMorale';
import { factionsAlliedOnMap, isInstanceIdInAnyTruckCargo } from './battleLogisticsUi';

function getStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 0;
}

function isBattleAirUnit(u: Record<string, unknown>): boolean {
  const t = String(u.type ?? '');
  return t === 'lightAir' || t === 'heavyAir';
}

function unitHasOrderKeyBattle(u: Record<string, unknown>, key: string): boolean {
  const orders = u.orders;
  if (!Array.isArray(orders)) return false;
  const want = String(key).trim().toLowerCase();
  if (!want) return false;
  return orders.some((o) => {
    if (!o || typeof o !== 'object') return false;
    const rec = o as { order_key?: unknown; key?: unknown };
    return String(rec.order_key ?? rec.key ?? '').trim().toLowerCase() === want;
  });
}

function isUnitInTransport(u: Record<string, unknown>): boolean {
  const id = Number((u.tactical as { embarkedTransportInstanceId?: unknown } | undefined)?.embarkedTransportInstanceId);
  return Number.isFinite(id) && id > 0;
}

export function unitIsFireAdjustmentSpotter(u: Record<string, unknown>): boolean {
  return unitHasOrderKeyBattle(u, 'fireAdjustment') || battleUnitHasPropKey(u, 'fireAdjustment');
}

export function isArtilleryUnitBattle(u: Record<string, unknown>): boolean {
  return String(u.type ?? '').toLowerCase() === 'artillery';
}

/** Союзная артиллерия на поле — цель приказа корректировки огня. */
export function computeFireAdjustmentTargetInstanceIds(
  cells: Cell[],
  spotterUnit: Record<string, unknown>,
): Set<number> {
  const out = new Set<number>();
  const fac = String(spotterUnit.faction || unitFactionKey(spotterUnit) || '');
  const selfId = Number(spotterUnit.instanceId);
  for (const cell of cells) {
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === selfId) continue;
      if (getStr(u) < 1) continue;
      if (!isArtilleryUnitBattle(u) && !unitUsesGunDeploy(u)) continue;
      if (isBattleAirUnit(u)) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), fac)) continue;
      if (isInstanceIdInAnyTruckCargo(cells, iid)) continue;
      if (isUnitInTransport(u)) continue;
      out.add(iid);
    }
  }
  return out;
}

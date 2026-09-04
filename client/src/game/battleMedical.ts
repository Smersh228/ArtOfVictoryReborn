import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { factionsAlliedOnMap, hexDistCells, isInstanceIdInAnyTruckCargo } from './battleLogisticsUi';
import { isInfantryUnitType } from './battleTerrain';

function unitStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength ?? u.count);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function isMedicalAidReceiverClient(unit: Record<string, unknown> | null | undefined): boolean {
  if (!unit) return false;
  if (isInfantryUnitType(unit)) return true;
  return String(unit.type || '').toLowerCase() === 'artillery';
}

/** Союзная пехота и артиллерия на своём и соседних гексах (включая самого медика). */
export function computeMedicalTargetInstanceIds(
  cells: Cell[],
  medicUnit: Record<string, unknown>,
  medicCell: Cell,
): Set<number> {
  const out = new Set<number>();
  const fac = String(medicUnit.faction || '');
  for (const cell of cells) {
    if (hexDistCells(cell, medicCell) > 1) continue;
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid)) continue;
      if (unitStr(u) < 1) continue;
      if (!isMedicalAidReceiverClient(u)) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), fac)) continue;
      if (isInstanceIdInAnyTruckCargo(cells, iid)) continue;
      const tac = u.tactical as { embarkedTransportInstanceId?: unknown } | undefined;
      if (tac?.embarkedTransportInstanceId != null) continue;
      out.add(iid);
    }
  }
  return out;
}

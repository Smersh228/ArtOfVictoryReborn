import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { unitHasPropKey } from './battleTerrain';
import { isHexVisible } from './hexVisibility';

function hexDistCells(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  );
}

function getStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 0;
}

function unitFaction(u: Record<string, unknown>): string {
  return String(u.faction ?? '');
}

export function isHiddenConcealedClient(unit: Record<string, unknown> | null | undefined): boolean {
  if (!unit || !unitHasPropKey(unit, 'hiddenState')) return false;
  const tac = unit.tactical as { ambushOrder?: boolean; ambushRevealed?: boolean; hiddenState?: { skipThisTurn?: boolean; revealed?: boolean } } | undefined;
  if (tac?.ambushOrder && !tac?.ambushRevealed) return false;
  const h = tac?.hiddenState;
  if (!h || typeof h !== 'object') return true;
  if (h.skipThisTurn) return false;
  if (h.revealed) return false;
  return true;
}

export function canSpotHiddenTargetClient(
  attackerUnit: Record<string, unknown>,
  attackerCell: Cell,
  targetUnit: Record<string, unknown>,
  targetCell: Cell,
  cells: Cell[],
): boolean {
  if (!isHiddenConcealedClient(targetUnit)) return true;
  const atkF = unitFaction(attackerUnit);
  if (!atkF || atkF === 'none') return false;
  if (hexDistCells(attackerCell, targetCell) <= 1) return true;
  for (const c of cells) {
    if (hexDistCells(c, targetCell) > 1) continue;
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      if (getStr(u) <= 0) continue;
      if (unitFaction(u) === atkF) return true;
    }
  }
  if (
    String(attackerUnit.type || '').toLowerCase() === 'artillery' &&
    unitHasPropKey(attackerUnit, 'areaFire')
  ) {
    return true;
  }
  return false;
}

export function fireMoveLosCellIds(
  path: Cell[],
  targetCell: Cell,
  cells: Cell[],
): number[] {
  const ids: number[] = [];
  for (const c of path) {
    if (isHexVisible(c, targetCell, cells)) ids.push(c.id);
  }
  return ids;
}

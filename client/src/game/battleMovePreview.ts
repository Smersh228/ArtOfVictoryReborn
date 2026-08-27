import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import {
  applyMoveSlopeCounters,
  canUnitTraverseSlope,
  createMoveSlopeCounters,
  isRavineExitDirection,
  moveCountersKey,
  ravineCountersAllow,
  slopeCountersAllow,
  slopeTransition,
  terrainEntryCost,
} from './battleTerrain';
import { wireBlocksGroundMove } from './cellWireEdges';
import { antiTankBlocksGroundMove } from './cellAntiTankEdges';
import { hasDotOnCell, unitInDot } from './cellDot';

/** Совпадает с сервером: для авиации ОД не ограничивают дальность превью хода. */
const AIR_BATTLE_EFFECTIVE_MOVE_POINTS = 99999999;

export type BattleMovePreviewUnit = {
  type: string;
  faction: string;
  properties?: unknown;
};

export function normalizeBattleInstanceId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function battleInstanceIdInList(
  list: readonly number[] | null | undefined,
  raw: unknown,
): boolean {
  const id = normalizeBattleInstanceId(raw);
  if (id == null || !list?.length) return false;
  for (let i = 0; i < list.length; i++) {
    if (Number(list[i]) === id) return true;
  }
  return false;
}

function normFaction(raw: string): 'wehrmacht' | 'rkka' | 'none' {
  const f = String(raw || '')
    .trim()
    .toLowerCase();
  if (f === 'germany' || f === 'wehrmacht') return 'wehrmacht';
  if (f === 'ussr' || f === 'rkka') return 'rkka';
  return 'none';
}

function unitFaction(u: { faction?: string }): 'wehrmacht' | 'rkka' | 'none' {
  return normFaction(String(u.faction ?? ''));
}

function opposing(a: 'wehrmacht' | 'rkka' | 'none', b: 'wehrmacht' | 'rkka' | 'none'): boolean {
  if (a === 'none' || b === 'none') return false;
  return a !== b;
}

function getStr(u: { str?: unknown; strength?: unknown }): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

export function usesTechMoveCost(type: string): boolean {
  const t = String(type || '');
  return [
    'tech',
    'armor',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'lightAir',
    'heavyAir',
  ].includes(t);
}

function canTraverseMoveEdge(
  fromCell: Cell,
  toCell: Cell,
  unit: BattleMovePreviewUnit,
  counters: ReturnType<typeof createMoveSlopeCounters>,
): boolean {
  if (!slopeCountersAllow(unit, counters, fromCell, toCell)) return false;
  if (!ravineCountersAllow(unit, counters, fromCell, toCell)) return false;
  if (fromCell && !isRavineExitDirection(fromCell, toCell)) {
    if (!canUnitTraverseSlope(unit, slopeTransition(fromCell, toCell))) return false;
  }
  if (wireBlocksGroundMove(fromCell, toCell, unit)) return false;
  if (antiTankBlocksGroundMove(fromCell, toCell, unit)) return false;
  return true;
}

function getMeleeOpponentId(u: { tactical?: { meleeOpponentInstanceId?: unknown } }): number | null {
  const id = Number(u.tactical?.meleeOpponentInstanceId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function hexDistCells(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  );
}

function findUnitOnField(allCells: Cell[], instanceId: number): { cell: Cell; unit: Record<string, unknown> } | null {
  for (const cell of allCells) {
    for (const raw of cell.units || []) {
      const u = raw as Record<string, unknown>;
      if (Number(u.instanceId) === instanceId && getStr(u) > 0) return { cell, unit: u };
    }
  }
  return null;
}

function cellForbidsThirdPartyMeleeEntry(allCells: Cell[], cell: Cell, moverUnit: BattleMovePreviewUnit & { instanceId?: unknown }): boolean {
  const mid = Number(moverUnit.instanceId);
  if (!Number.isFinite(mid)) return false;
  for (const u of cell.units || []) {
    const occ = u as Record<string, unknown> & { tactical?: { meleeOpponentInstanceId?: unknown } };
    if (getStr(occ) <= 0) continue;
    const opp = getMeleeOpponentId(occ);
    if (opp == null) continue;
    if (Number(occ.instanceId) === mid || opp === mid) continue;
    const oth = findUnitOnField(allCells, opp);
    if (!oth || getStr(oth.unit) <= 0) continue;
    if (!opposing(unitFaction(moverUnit), unitFaction(oth.unit))) continue;
    if (hexDistCells(cell, oth.cell) <= 1) return true;
  }
  return false;
}

function canEnterCell(
  cell: Cell,
  unit: BattleMovePreviewUnit,
  fogRevealedCellIds: Set<number> | null,
  allCells?: Cell[],
  fromCell?: Cell,
  counters?: ReturnType<typeof createMoveSlopeCounters>,
): boolean {
  if (!cell) return false;
  const us = cell.units || [];
  let liveOnHex = 0;
  for (let i = 0; i < us.length; i++) {
    const occ0 = us[i] as { str?: unknown; strength?: unknown };
    if (getStr(occ0) <= 0) continue;
    if (unitInDot(occ0 as Record<string, unknown>)) continue;
    liveOnHex++;
  }
  const cap = hasDotOnCell(cell.builds) ? 2 : 3;
  if (liveOnHex >= cap) return false;
  const mine = unitFaction(unit);
  for (let i = 0; i < us.length; i++) {
    const occ = us[i] as { faction?: string; str?: unknown; strength?: unknown };
    if (opposing(mine, unitFaction(occ)) && getStr(occ) > 0) {
      if (fogRevealedCellIds != null && !fogRevealedCellIds.has(cell.id)) continue;
      return false;
    }
  }
  if (allCells && cellForbidsThirdPartyMeleeEntry(allCells, cell, unit)) return false;
  if (fromCell && counters) {
    if (!canTraverseMoveEdge(fromCell, cell, unit, counters)) return false;
  }
  if (terrainEntryCost(cell, unit) === 0) return false;
  return true;
}

function getNeighbor(hex: { x: number; y: number; z: number }, dir: number) {
  const dirs = [
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
  ];
  return { x: hex.x + dirs[dir].x, y: hex.y + dirs[dir].y, z: hex.z + dirs[dir].z };
}

function findCellByCoor(cells: Cell[], coor: { x: number; y: number; z: number }): Cell | null {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.coor.x === coor.x && c.coor.y === coor.y && c.coor.z === coor.z) return c;
  }
  return null;
}


export function findReachableCells(
  start: Cell,
  maxPoints: number,
  allCells: Cell[],
  unit: BattleMovePreviewUnit,
  fogRevealedCellIds: Set<number> | null = null,
): Cell[] {
  const result: Cell[] = [];
  const visited: Record<string, number> = Object.create(null);
  const queue: { cell: Cell; spent: number; counters: ReturnType<typeof createMoveSlopeCounters> }[] = [];
  const startCounters = createMoveSlopeCounters();
  const startKey = `${start.id}:${moveCountersKey(startCounters)}`;
  visited[startKey] = 0;
  queue.push({ cell: start, spent: 0, counters: startCounters });
  while (queue.length > 0) {
    queue.sort((a, b) => a.spent - b.spent);
    const current = queue.shift()!;
    if (current.spent <= maxPoints) result.push(current.cell);
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir);
      const neighbor = findCellByCoor(allCells, nb);
      if (
        !neighbor ||
        !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells, current.cell, current.counters)
      ) {
        continue;
      }
      const cost = terrainEntryCost(neighbor, unit);
      const newSpent = current.spent + cost;
      if (newSpent > maxPoints) continue;
      const newCounters = applyMoveSlopeCounters(current.counters, current.cell, neighbor);
      const vKey = `${neighbor.id}:${moveCountersKey(newCounters)}`;
      const old = visited[vKey];
      if (old === undefined || newSpent < old) {
        visited[vKey] = newSpent;
        queue.push({ cell: neighbor, spent: newSpent, counters: newCounters });
      }
    }
  }
  return result;
}

export function findMovementPath(
  start: Cell,
  target: Cell,
  allCells: Cell[],
  unit: BattleMovePreviewUnit,
  fogRevealedCellIds: Set<number> | null = null,
): Cell[] | null {
  if (start.id === target.id) return [start];
  const visited: Record<string, number> = Object.create(null);
  const prev: Record<string, string | undefined> = Object.create(null);
  const queue: {
    cell: Cell;
    cost: number;
    counters: ReturnType<typeof createMoveSlopeCounters>;
    key: string;
  }[] = [];
  const startCounters = createMoveSlopeCounters();
  const startKey = `${start.id}:${moveCountersKey(startCounters)}`;
  visited[startKey] = 0;
  queue.push({ cell: start, cost: 0, counters: startCounters, key: startKey });
  let goalKey: string | null = null;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cell.id === target.id) {
      goalKey = current.key;
      break;
    }
    for (let dir = 0; dir < 6; dir++) {
      const nb = getNeighbor(current.cell.coor, dir);
      const neighbor = findCellByCoor(allCells, nb);
      if (
        !neighbor ||
        !canEnterCell(neighbor, unit, fogRevealedCellIds, allCells, current.cell, current.counters)
      ) {
        continue;
      }
      const cost = terrainEntryCost(neighbor, unit);
      const newCost = current.cost + cost;
      const newCounters = applyMoveSlopeCounters(current.counters, current.cell, neighbor);
      const vKey = `${neighbor.id}:${moveCountersKey(newCounters)}`;
      const oldCost = visited[vKey];
      if (oldCost === undefined || newCost < oldCost) {
        visited[vKey] = newCost;
        prev[vKey] = current.key;
        queue.push({ cell: neighbor, cost: newCost, counters: newCounters, key: vKey });
      }
    }
  }
  if (!goalKey) return null;
  const idChain: number[] = [];
  let k: string | undefined = goalKey;
  while (k) {
    idChain.unshift(Number(String(k).split(':')[0]));
    k = prev[k];
  }
  const path: Cell[] = [];
  for (const id of idChain) {
    const c = allCells.find((x) => Number(x.id) === id);
    if (c) path.push(c);
  }
  return path.length ? path : null;
}


export function getBattleMoveBudget(unit: Record<string, unknown>): number {
  const ty = String(unit.type ?? '').trim();
  if (ty === 'lightAir' || ty === 'heavyAir') return AIR_BATTLE_EFFECTIVE_MOVE_POINTS;
  const rawMp = unit.movePoint;
  if (rawMp != null && rawMp !== '') {
    const mp = Number(rawMp);
    if (Number.isFinite(mp) && mp >= 0) return mp;
  }
  const n = Number(unit.mov ?? unit.moveCap ?? 4);
  return Number.isFinite(n) && n > 0 ? n : 4;
}


export function getBattleMoveBudgetForOrder(
  unit: Record<string, unknown>,
  orderKey: 'move' | 'moveWar',
): number {
  const base = getBattleMoveBudget(unit);
  return orderKey === 'moveWar' ? Math.max(0, base - 1) : base;
}

export function pathTerrainCost(path: Cell[], unit: BattleMovePreviewUnit): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    s += terrainEntryCost(path[i], unit);
  }
  return s;
}

function unitStrengthLive(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

/** Юнит на гексе (не в carriedUnits) — для огня, движения и приказов после десанта. */
export function findGroundBattleUnitByInstanceId(
  cells: Cell[],
  instanceId: number,
): { cell: Cell; unit: Record<string, unknown>; inCargo: boolean } | null {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return null;
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const us = cell.units || [];
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui] as unknown as Record<string, unknown>;
      if (Number(u.instanceId) !== id) continue;
      if (unitStrengthLive(u) <= 0) continue;
      return { cell, unit: u, inCargo: false };
    }
  }
  const nested = findBattleUnitByInstanceId(cells, id);
  if (!nested) return null;
  if (unitStrengthLive(nested.unit) <= 0) return null;
  return { cell: nested.cell, unit: nested.unit, inCargo: true };
}

export function findUnitCellByInstanceId(
  cells: Cell[],
  instanceId: number,
): { cell: Cell; unit: Record<string, unknown> } | null {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return null;
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const us = cell.units || [];
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui] as unknown as Record<string, unknown>;
      if (Number(u.instanceId) !== id) continue;
      if (unitStrengthLive(u) <= 0) continue;
      return { cell, unit: u };
    }
  }
  return null;
}

function findInUnitTree(
  units: unknown[],
  instanceId: number,
  cell: Cell,
): { cell: Cell; unit: Record<string, unknown> } | null {
  for (const raw of units) {
    const u = raw as unknown as Record<string, unknown>;
    if (Number(u.instanceId) === instanceId) return { cell, unit: u };
    const tac = u.tactical as Record<string, unknown> | undefined;
    const carried = tac?.carriedUnits as unknown[] | undefined;
    if (Array.isArray(carried) && carried.length) {
      const nested = findInUnitTree(carried, instanceId, cell);
      if (nested) return nested;
    }
  }
  return null;
}


export function findBattleUnitByInstanceId(
  cells: Cell[],
  instanceId: number,
): { cell: Cell; unit: Record<string, unknown> } | null {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return null;
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const found = findInUnitTree(cell.units || [], id, cell);
    if (found) return found;
  }
  return null;
}




































































import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { unitHasPropKey } from './battleTerrain';
import {
  canUnloadToCellClient,
  factionsAlliedOnMap,
  getCarriedUnitsFromTruck,
  hexDistCells,
  isInstanceIdInAnyTruckCargo,
} from './battleLogisticsUi';

function blobOf(cell: Cell): string {
  return `${String(cell.type || '')} ${String(cell.name || '')}`;
}

export function isRailwayCell(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  if (t === 'railway' || t === 'railroad' || t === 'rail' || t === 'train') return true;
  const blob = blobOf(cell);
  if (/железн|railway|railroad|жд(?![а-я])/i.test(blob)) return true;
  const ex = (cell as Cell & { hexExtra?: { railway?: boolean; rail?: boolean } }).hexExtra;
  if (ex && (ex.railway === true || ex.rail === true)) return true;
  return false;
}

export function isRailwayStationCell(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const blob = blobOf(cell);
  if (/станци|вокзал|station/i.test(blob)) return true;
  const ex = (cell as Cell & { hexExtra?: { railwayStation?: boolean; station?: boolean } }).hexExtra;
  if (ex && (ex.railwayStation === true || ex.station === true)) return true;
  return false;
}

export function isRailwayUnitBattle(u: Record<string, unknown> | null | undefined): boolean {
  if (!u) return false;
  if (String(u.type || '').toLowerCase() !== 'tech') return false;
  return unitHasPropKey(u, 'railwayDetachment');
}

function isRailCargoOther(u: Record<string, unknown>): boolean {
  const t = String(u.type || '').toLowerCase();
  if (t === 'infantry') return false;
  if (t === 'artillery' || t === 'armor' || t === 'lighttank' || t === 'mediumtank' || t === 'heavytank') return true;
  if (t === 'tech' && !isRailwayUnitBattle(u)) return true;
  return false;
}

function countRailSlots(train: Record<string, unknown>): { inf: number; other: number } {
  const arr = getCarriedUnitsFromTruck(train);
  let inf = 0;
  let other = 0;
  for (const u of arr) {
    if (String(u.type || '').toLowerCase() === 'infantry') inf += 1;
    else other += 1;
  }
  return { inf, other };
}

export function canRailAcceptUnit(train: Record<string, unknown>, cargo: Record<string, unknown>): boolean {
  if (isRailwayUnitBattle(cargo)) return false;
  const slots = countRailSlots(train);
  if (String(cargo.type || '').toLowerCase() === 'infantry') return slots.inf < 2;
  if (isRailCargoOther(cargo)) return slots.other < 2;
  return false;
}

function battleGetStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

export function computeRailLoadingTargetInstanceIds(
  cells: Cell[],
  trainUnit: Record<string, unknown>,
  trainCell: Cell,
): Set<number> {
  const out = new Set<number>();
  if (!isRailwayUnitBattle(trainUnit) || !isRailwayCell(trainCell)) return out;
  const selfId = Number(trainUnit.instanceId);
  const tf = String(trainUnit.faction || '');
  for (const cell of cells) {
    if (hexDistCells(cell, trainCell) !== 1) continue;
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === selfId) continue;
      if (battleGetStr(u) < 1) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), tf)) continue;
      if (isInstanceIdInAnyTruckCargo(cells, iid)) continue;
      const tac = u.tactical as { embarkedTransportInstanceId?: number } | undefined;
      if (tac?.embarkedTransportInstanceId != null) continue;
      if (!canRailAcceptUnit(trainUnit, u)) continue;
      out.add(iid);
    }
  }
  return out;
}

export function canRailAcceptLoading(
  cells: Cell[],
  trainUnit: Record<string, unknown>,
  trainCell: Cell,
): boolean {
  return computeRailLoadingTargetInstanceIds(cells, trainUnit, trainCell).size > 0;
}

export function computeRailUnloadCellIds(
  cells: Cell[],
  trainUnit: Record<string, unknown>,
  cargoInstanceId: number,
): Set<number> | null {
  const trainLoc = cells.find((c) =>
    (c.units || []).some((u) => Number((u as { instanceId?: unknown }).instanceId) === Number(trainUnit.instanceId)),
  );
  if (!trainLoc) return null;
  const cargo = getCarriedUnitsFromTruck(trainUnit).find((u) => Number(u.instanceId) === Number(cargoInstanceId));
  if (!cargo) return null;
  const pf = String(cargo.faction || '');
  const pid = Number(cargoInstanceId);
  const out = new Set<number>();
  for (const c of cells) {
    if (hexDistCells(c, trainLoc) !== 1) continue;
    if (!canUnloadToCellClient(c, pf, pid)) continue;
    out.add(c.id);
  }
  return out;
}

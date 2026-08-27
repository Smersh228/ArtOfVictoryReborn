import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { hasDotOnCell, unitInDot } from './cellDot';
import { findUnitCellByInstanceId } from './battleMovePreview';
import { hasStorageOnCell, STORAGE_DEFAULT_AMMO } from './editorMapFortifications';

export function hexDistCells(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  );
}

function unitStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength ?? u.count);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}


function battleGetStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

export function factionsAlliedOnMap(fa: string, fb: string): boolean {
  const a = String(fa || '')
    .trim()
    .toLowerCase();
  const b = String(fb || '')
    .trim()
    .toLowerCase();
  const sov = (x: string) => x === 'ussr' || x === 'rkka';
  const axis = (x: string) => x === 'germany' || x === 'wehrmacht';
  return (sov(a) && sov(b)) || (axis(a) && axis(b));
}

export function isTruckUnitBattle(u: Record<string, unknown>): boolean {
  const t = String(u.type || '').toLowerCase();
  if (t !== 'tech') return false;
  return /грузовик/i.test(String(u.name || ''));
}

export function parseAmmoCapacityMaxUi(u: Record<string, unknown>): number | null {
  const s = u.ammoSupply;
  if (typeof s === 'string' && s.includes('/')) {
    const mx = Number(String(s.split('/')[1] || '').trim());
    if (Number.isFinite(mx) && mx >= 0) return mx;
  }
  return null;
}


const DEFAULT_UNIT_AMMO_CAP_UI = 10;

export function getAmmoCapacityMaxUi(u: Record<string, unknown>): number {
  const p = parseAmmoCapacityMaxUi(u);
  if (p != null) return p;
  return DEFAULT_UNIT_AMMO_CAP_UI;
}

export function readAmmoCountUi(u: Record<string, unknown>): number {
  const n = u.ammoCount;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  const am = u.ammunition as { ammo?: number } | undefined;
  if (am && typeof am.ammo === 'number' && Number.isFinite(am.ammo)) return am.ammo;
  const raw = u.ammo;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const p = Number(String(raw).split(/[\/,]/)[0]);
    if (Number.isFinite(p)) return p;
  }
  return 0;
}

export function maxAmmoTransferFromTruckTo(
  truck: Record<string, unknown>,
  recipient: Record<string, unknown>,
): number {
  const have = readAmmoCountUi(truck);
  const cap = getAmmoCapacityMaxUi(recipient);
  const rec = readAmmoCountUi(recipient);
  const headroom = Math.max(0, cap - rec);
  return Math.min(have, headroom);
}

/** Юниты в кузове грузовика (пехота и свёрнутое орудие). */
export function getCarriedUnitsFromTruck(truck: Record<string, unknown>): Record<string, unknown>[] {
  const tac = truck.tactical as { carriedUnits?: Record<string, unknown>[] } | undefined;
  return Array.isArray(tac?.carriedUnits) ? tac.carriedUnits : [];
}

export function sumCarriedStrengthUi(truck: Record<string, unknown>): number {
  return getCarriedUnitsFromTruck(truck).reduce((s, u) => s + battleGetStr(u), 0);
}

/** Суммарная «численность» груза: массив carriedUnits + legacy пехота на клетке с embarked. */
export function sumEmbarkedStrengthUi(cells: Cell[], truckInstanceId: number): number {
  const tid = Number(truckInstanceId);
  let s = 0;
  const truckLoc = findUnitCellByInstanceId(cells, tid);
  if (truckLoc) {
    s += sumCarriedStrengthUi(truckLoc.unit as unknown as Record<string, unknown>);
  }
  for (const c of cells) {
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const tac = u.tactical as { embarkedTransportInstanceId?: number } | undefined;
      if (tac && Number(tac.embarkedTransportInstanceId) === tid) {
        s += battleGetStr(u);
      }
    }
  }
  return s;
}

function isInfantryUnitBattle(u: Record<string, unknown>): boolean {
  return String(u.type || '').toLowerCase() === 'infantry';
}

function isArtilleryUnitBattle(u: Record<string, unknown>): boolean {
  return String(u.type || '').toLowerCase() === 'artillery';
}


export function sumEmbarkedInfantryStrengthUi(cells: Cell[], truckInstanceId: number): number {
  const tid = Number(truckInstanceId);
  let s = 0;
  const truckLoc = findUnitCellByInstanceId(cells, tid);
  if (truckLoc) {
    for (const cu of getCarriedUnitsFromTruck(truckLoc.unit as unknown as Record<string, unknown>)) {
      if (isInfantryUnitBattle(cu)) s += battleGetStr(cu);
    }
  }
  for (const c of cells) {
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const tac = u.tactical as { embarkedTransportInstanceId?: number } | undefined;
      if (tac && Number(tac.embarkedTransportInstanceId) === tid && isInfantryUnitBattle(u)) {
        s += battleGetStr(u);
      }
    }
  }
  return s;
}


export function sumEmbarkedArtilleryStrengthUi(cells: Cell[], truckInstanceId: number): number {
  const tid = Number(truckInstanceId);
  let s = 0;
  const truckLoc = findUnitCellByInstanceId(cells, tid);
  if (truckLoc) {
    for (const cu of getCarriedUnitsFromTruck(truckLoc.unit as unknown as Record<string, unknown>)) {
      if (isArtilleryUnitBattle(cu)) s += battleGetStr(cu);
    }
  }
  for (const c of cells) {
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const tac = u.tactical as { embarkedTransportInstanceId?: number } | undefined;
      if (tac && Number(tac.embarkedTransportInstanceId) === tid && isArtilleryUnitBattle(u)) {
        s += battleGetStr(u);
      }
    }
  }
  return s;
}

export function isInstanceIdInAnyTruckCargo(cells: Cell[], instanceId: number): boolean {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return false;
  for (const c of cells) {
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      if (!isTruckUnitBattle(u)) continue;
      if (getCarriedUnitsFromTruck(u).some((x) => Number(x.instanceId) === id)) return true;
    }
  }
  return false;
}

function terrainInfPassable(cell: Cell): boolean {
  const mc = cell.moveCostInf ?? cell.moveCost ?? 1;
  return mc > 0;
}

export function canUnloadToCellClient(
  cell: Cell,
  passengerFaction: string,
  passengerInstanceId: number,
): boolean {
  if (!terrainInfPassable(cell)) return false;
  let liveOnHex = 0;
  for (const raw of cell.units || []) {
    const u = raw as unknown as Record<string, unknown>;
    if (Number(u.instanceId) === Number(passengerInstanceId)) continue;
    if (unitStr(u) <= 0) continue;
    if (unitInDot(u)) continue;
    liveOnHex++;
    if (isTruckUnitBattle(u)) return false;
    if (!factionsAlliedOnMap(String(u.faction || ''), passengerFaction)) return false;
  }
  if (liveOnHex >= (hasDotOnCell(cell.builds) ? 2 : 3)) return false;
  return true;
}

export function computeGetSupTargetInstanceIds(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): Set<number> {
  const out = new Set<number>();
  const selfId = Number(truckUnit.instanceId);
  const tf = String(truckUnit.faction || '');
  for (const cell of cells) {
    const d = hexDistCells(cell, truckCell);
    if (d !== 1) continue;
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === selfId) continue;
      if (unitStr(u) < 1) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), tf)) continue;
      if (maxAmmoTransferFromTruckTo(truckUnit, u) < 1) continue;
      out.add(iid);
    }
  }
  return out;
}

export function computeLoadingTargetInstanceIds(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): Set<number> {
  const out = new Set<number>();
  const selfId = Number(truckUnit.instanceId);
  const tf = String(truckUnit.faction || '');
  const cap = battleGetStr(truckUnit);
  const used = sumEmbarkedInfantryStrengthUi(cells, selfId);
  for (const cell of cells) {
    if (hexDistCells(cell, truckCell) !== 1) continue;
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === selfId) continue;
      if (String(u.type || '').toLowerCase() !== 'infantry') continue;
      if (battleGetStr(u) < 1) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), tf)) continue;
      if (isInstanceIdInAnyTruckCargo(cells, iid)) continue;
      const tac = u.tactical as { embarkedTransportInstanceId?: number } | undefined;
      if (tac?.embarkedTransportInstanceId != null) continue;
      const need = battleGetStr(u);
      if (used + need > cap) continue;
      out.add(iid);
    }
  }
  return out;
}

export function computeTowTargetInstanceIds(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): Set<number> {
  const out = new Set<number>();
  const selfId = Number(truckUnit.instanceId);
  const tf = String(truckUnit.faction || '');
  const used0 = sumEmbarkedArtilleryStrengthUi(cells, selfId);
  const cap = battleGetStr(truckUnit);
  for (const cell of cells) {
    if (hexDistCells(cell, truckCell) !== 1) continue;
    for (const raw of cell.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === selfId) continue;
      if (String(u.type || '').toLowerCase() !== 'artillery') continue;
      if (unitStr(u) < 1) continue;
      if (!factionsAlliedOnMap(String(u.faction || ''), tf)) continue;
      const tac = u.tactical as { artilleryDeployed?: boolean; embarkedTransportInstanceId?: number } | undefined;
      if (tac?.embarkedTransportInstanceId != null) continue;
      if (tac?.artilleryDeployed === true) continue;
      if (isInstanceIdInAnyTruckCargo(cells, iid)) continue;
      if (used0 + battleGetStr(u) > cap) continue;
      out.add(iid);
    }
  }
  return out;
}


export function computeUnloadCellIds(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  cargoInstanceId: number,
): Set<number> | null {
  const truckLoc = findUnitCellByInstanceId(cells, Number(truckUnit.instanceId));
  if (!truckLoc) return null;
  const cargo = getCarriedUnitsFromTruck(truckUnit).find((u) => Number(u.instanceId) === Number(cargoInstanceId));
  if (!cargo) return null;
  const pf = String(cargo.faction || '');
  const pid = Number(cargoInstanceId);
  const out = new Set<number>();
  for (const c of cells) {
    if (hexDistCells(c, truckLoc.cell) !== 1) continue;
    if (!canUnloadToCellClient(c, pf, pid)) continue;
    out.add(c.id);
  }
  return out;
}

export function readStorageAmmo(cell: Cell): number {
  if (!hasStorageOnCell(cell.builds)) return 0;
  const n = Number(cell.builds?.storageAmmo);
  if (!Number.isFinite(n)) return STORAGE_DEFAULT_AMMO;
  return Math.max(0, Math.floor(n));
}

export function maxAmmoLoadFromWarehouse(
  truck: Record<string, unknown>,
  warehouseCell: Cell,
): number {
  const stock = readStorageAmmo(warehouseCell);
  const cap = getAmmoCapacityMaxUi(truck);
  const have = readAmmoCountUi(truck);
  const headroom = Math.max(0, cap - have);
  return Math.min(stock, headroom);
}

export function computeLoadingSupTargetCellIds(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): Set<number> {
  const out = new Set<number>();
  for (const cell of cells) {
    if (hexDistCells(cell, truckCell) > 1) continue;
    if (maxAmmoLoadFromWarehouse(truckUnit, cell) < 1) continue;
    out.add(cell.id);
  }
  return out;
}

/** Есть ли рядом пехота, которую можно погрузить с учётом грузоподъёмности. */
export function canTruckAcceptLoading(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): boolean {
  return computeLoadingTargetInstanceIds(cells, truckUnit, truckCell).size > 0;
}

/** Есть ли рядом свёрнутое орудие, которое можно взять на буксир. */
export function canTruckAcceptTow(
  cells: Cell[],
  truckUnit: Record<string, unknown>,
  truckCell: Cell,
): boolean {
  return computeTowTargetInstanceIds(cells, truckUnit, truckCell).size > 0;
}

import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';

/** Скидка стоимости захода для свойства «Железнодорожный отряд». 0 на гексе = непроходим, поэтому ниже не опускаем. */
export const RAILWAY_ENTRY_COST_DISCOUNT = 1.5;
export const RAILWAY_ENTRY_COST_MIN = 0.5;

function blobOf(cell: Cell): string {
  const ex = hexExtraOf(cell);
  const name = String(cell.name || (ex && (ex.name || ex.label)) || '');
  const img = String(
    (cell as { img?: string }).img ||
      (cell as { imagePath?: string }).imagePath ||
      (ex && (ex.image_path || ex.img || ex.imagePath)) ||
      '',
  );
  const mb = String((cell as { mapBuilding?: { name?: string } }).mapBuilding?.name || '');
  return `${String(cell.type || '')} ${name} ${img} ${mb}`;
}

function hexExtraOf(cell: Cell): Record<string, unknown> | null {
  const ex = (cell as Cell & { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null;
}

const RAIL_STATION_RE = /станци|вокзал|station|жд\s*стан|rail(?:way)?\s*stat/i;

export function isRailwayStationHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (
    ex &&
    (ex.isRailStation === true || ex.railwayStation === true || ex.station === true)
  ) {
    return true;
  }
  const hp = cell.builds && (cell.builds as { structureHp?: { kind?: string } }).structureHp;
  if (hp && String(hp.kind || '') === 'station') return true;
  return RAIL_STATION_RE.test(blobOf(cell));
}

export function isRailwayDestroyedHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  return Boolean(
    ex &&
      (ex.railwayDestroyed === true ||
        ex.isDestroyedRailway === true ||
        ex.editorDestroyedRailway === true),
  );
}

export function isRepairableDestroyedRailwayHex(cell: Cell | null | undefined): boolean {
  if (!cell || !isRailwayDestroyedHex(cell)) return false;
  const ex = hexExtraOf(cell);
  if (ex && (ex.isDestroyedBridge === true || ex.destroyedBridge === true || ex.editorDestroyedBridge === true)) {
    return false;
  }
  if (ex && (ex.isRailway === true || ex.railway === true || ex.rail === true || ex.isRailStation === true)) return true;
  if (isRailwayStationHex(cell)) return true;
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  if (t === 'railway' || t === 'railroad' || t === 'rail' || t === 'train') return true;
  if (/железн|railway|railroad|жд(?![а-я])/i.test(blobOf(cell))) return true;
  return Boolean(ex && (ex.railwayDestroyed === true || ex.isDestroyedRailway === true));
}

export function isRailwayHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  if (isRailwayDestroyedHex(cell)) return false;
  if (isRailwayStationHex(cell)) return true;
  const t = String(cell.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  if (t === 'railway' || t === 'railroad' || t === 'rail' || t === 'train') return true;
  const blob = blobOf(cell);
  if (/железн|railway|railroad|жд(?![а-я])/i.test(blob)) return true;
  const ex = hexExtraOf(cell);
  if (ex && (ex.isRailway === true || ex.railway === true || ex.rail === true)) return true;
  return false;
}

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

/** ЖД-отряд может стоять на целом пути или заходить на разрушенный для ремонта. */
export function cellAllowsRailwayDetachment(cell: Cell | null | undefined): boolean {
  return isRailwayHex(cell) || isRepairableDestroyedRailwayHex(cell);
}

export function cellsEligibleForRepairRailway(fromCell: Cell, cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    const d = hexDist(fromCell, c);
    if (!(d === 0 || d === 1)) continue;
    if (isRepairableDestroyedRailwayHex(c)) out.push(c);
  }
  return out;
}

export function applyRailwayEntryDiscount(
  cell: Cell | null | undefined,
  hasRailwayDetachment: boolean,
  cost: number,
): number {
  if (!hasRailwayDetachment || !(cost > 0) || !isRailwayHex(cell)) return cost;
  return Math.max(RAILWAY_ENTRY_COST_MIN, cost - RAILWAY_ENTRY_COST_DISCOUNT);
}

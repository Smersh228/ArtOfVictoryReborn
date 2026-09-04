import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { isDestroyedBridgeHex, isIntactBridgeHex, isRailwayBridgeHex } from './battleSpecialTerrain';
import { isRailwayDestroyedHex, isRailwayHex, isRailwayStationHex } from './cellRailway';

function hexExtraOf(cell: Cell | null | undefined): Record<string, unknown> | null {
  const ex = cell && (cell as Cell & { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null;
}

function extraImage(ex: Record<string, unknown> | null, key: string): string {
  if (!ex) return '';
  const raw = ex[key];
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s;
}

export function cellDestroyedBridgeImage(cell: Cell | null | undefined): string {
  return extraImage(hexExtraOf(cell), 'destroyedBridgeImage');
}

export function cellDestroyedRailwayImage(cell: Cell | null | undefined): string {
  return extraImage(hexExtraOf(cell), 'destroyedRailwayImage');
}

export function cellOffersDestroyedBridgeToggle(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  if (cellDestroyedBridgeImage(cell)) return true;
  const ex = hexExtraOf(cell);
  if (ex && (ex.isBridge === true || ex.isRailwayBridge === true)) return true;
  return isIntactBridgeHex(cell) || isDestroyedBridgeHex(cell);
}

export function cellOffersDestroyedRailwayToggle(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  if (cellDestroyedRailwayImage(cell)) return true;
  const ex = hexExtraOf(cell);
  if (
    ex &&
    (ex.isRailway === true ||
      ex.railway === true ||
      ex.rail === true ||
      ex.isRailwayBridge === true ||
      ex.isRailStation === true)
  ) {
    return true;
  }
  return isRailwayHex(cell) || isRailwayStationHex(cell) || isRailwayDestroyedHex(cell) || isRailwayBridgeHex(cell);
}

/** Картинка гекса с учётом разрушенного моста / ЖД. */
export function hexTerrainImagePath(cell: Cell | null | undefined): string {
  if (!cell) return '';
  const extras = cell as Cell & { img?: string };
  const fallback = typeof extras.img === 'string' ? extras.img : '';
  const ex = hexExtraOf(cell);
  if (isDestroyedBridgeHex(cell)) {
    const p = extraImage(ex, 'destroyedBridgeImage');
    if (p) return p;
  }
  if (isRailwayDestroyedHex(cell)) {
    const p = extraImage(ex, 'destroyedRailwayImage');
    if (p) return p;
  }
  return fallback;
}

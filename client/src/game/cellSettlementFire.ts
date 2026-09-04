import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import fireSpriteUrl from '../img/orderUnits/firebuild.png';
import { isRailwayStationHex } from './cellRailway';

export const SETTLEMENT_FIRE_SPRITE_URL = fireSpriteUrl;

type HexExtra = Record<string, unknown>;

function hexExtraOf(cell: Cell | null | undefined): HexExtra | null {
  const ex = cell && (cell as { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as HexExtra) : null;
}

function cellBlob(cell: Cell | null | undefined): string {
  const ex = hexExtraOf(cell);
  const name = String(cell?.name || (ex && (ex.name || ex.label)) || '');
  const type = String(cell?.type || '');
  const img = String(
    (cell as { img?: string } | null)?.img ||
      (cell as { imagePath?: string } | null)?.imagePath ||
      (ex && (ex.image_path || ex.img || ex.imagePath)) ||
      '',
  );
  return `${type} ${name} ${img}`;
}

export function isSettlementDestroyedHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (ex && (ex.settlementDestroyed === true || ex.isDestroyedSettlement === true)) return true;
  return /полностью разрушен|destroyed\s*settlement/i.test(cellBlob(cell));
}

export function settlementKindOf(
  cell: Cell | null | undefined,
): 'city' | 'village' | 'station' | null {
  if (!cell || isSettlementDestroyedHex(cell)) return null;
  return settlementKindFromFlags(cell);
}

export function settlementKindFromFlags(
  cell: Cell | null | undefined,
): 'city' | 'village' | 'station' | null {
  if (!cell) return null;
  const ex = hexExtraOf(cell);
  const blob = cellBlob(cell);
  if (isRailwayStationHex(cell) || (ex && ex.isRailStation === true)) return 'station';
  if (/станци|вокзал|station|жд\s*стан/i.test(blob)) return 'station';
  if (ex && ex.isCity === true) return 'city';
  if (/город|city/i.test(blob) && !/станци|вокзал|station/i.test(blob)) return 'city';
  if (ex && ex.isVillage === true) return 'village';
  if (/деревн|посёл|поселок|village/i.test(blob)) return 'village';
  if (ex && ex.isSettlement === true) return 'village';
  return null;
}

export function canArsonOnCell(cell: Cell | null | undefined): boolean {
  if (!settlementKindOf(cell)) return false;
  if (hasSettlementFire(cell?.builds)) return false;
  if (isSettlementDestroyedHex(cell)) return false;
  return true;
}

export function hasSettlementFire(builds: IBuildCell | undefined | null): boolean {
  const raw = builds && (builds as { settlementFire?: unknown }).settlementFire;
  return Boolean(raw && typeof raw === 'object');
}

export function settlementFireMarkers(builds: IBuildCell | undefined | null): number {
  const raw = builds && (builds as { settlementFire?: { markers?: unknown } }).settlementFire;
  const n = Number(raw && raw.markers);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

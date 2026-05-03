import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { LobbyFaction } from '../api/rooms';
import type { BattlePlayerId } from '../game/battleSync';
import { generateEmptyGrid } from '../game/hexGrid';
import { placeUnitsOnGrid } from '../game/battleUnits';
import { getCarriedUnitsFromTruck } from '../game/battleLogisticsUi';

const BATTLE_GRID_W = 10;
const BATTLE_GRID_H = 10;

export function resolveBattleCellOnField(
  cell: Cell | null | undefined,
  fieldCells: Cell[],
): Cell | null | undefined {
  if (!cell || !fieldCells.length) return cell;
  const id = cell.id;
  if (!Number.isFinite(id)) return cell;
  const found = fieldCells.find((c) => c.id === id);
  return found ?? cell;
}

export function formatBattleTechCargoLine(unit: Record<string, unknown>): string | null {
  if (String(unit.type || '').toLowerCase() !== 'tech') return null;
  const carried = getCarriedUnitsFromTruck(unit);
  if (!carried.length) return 'Нет';
  return carried
    .map((c) => {
      const ty = String(c.type || '').toLowerCase();
      const kind = ty === 'infantry' ? 'пехота' : ty === 'artillery' ? 'артиллерия' : ty || 'отряд';
      return `${String(c.name ?? '—')} (${kind})`;
    })
    .join('; ');
}

export function formatBattleUnitFactionLabel(unit: Record<string, unknown>): string {
  const raw = String(unit.faction ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'germany' || raw === 'wehrmacht') return 'Германия (Вермахт)';
  if (raw === 'ussr' || raw === 'rkka') return 'СССР (РККА)';
  if (raw) return raw;
  return '—';
}

export function formatBattleUnitPlayerLabel(
  unit: Record<string, unknown>,
  viewerFaction: LobbyFaction,
  battlePlayer: BattlePlayerId,
  spectatorNames?: { rkka?: string; wehrmacht?: string },
): string {
  const raw = String(unit.faction ?? '')
    .trim()
    .toLowerCase();
  const unitIsSoviet = raw === 'ussr' || raw === 'rkka';
  const unitIsAxis = raw === 'germany' || raw === 'wehrmacht';
  if (viewerFaction === 'none') {
    if (unitIsSoviet && spectatorNames?.rkka) return spectatorNames.rkka;
    if (unitIsAxis && spectatorNames?.wehrmacht) return spectatorNames.wehrmacht;
    return battlePlayer === 'b' ? 'Игрок B' : 'Игрок A';
  }
  if (!unitIsSoviet && !unitIsAxis) return '—';

  const mineIsSoviet = viewerFaction === 'rkka';
  const mineIsAxis = viewerFaction === 'wehrmacht';
  const isMine = (unitIsSoviet && mineIsSoviet) || (unitIsAxis && mineIsAxis);
  return isMine ? 'Вы' : 'Противник';
}

export function unitIsMineOnMap(unit: Record<string, unknown>, viewerFaction: LobbyFaction): boolean {
  if (viewerFaction === 'none') return true;
  const raw = String(unit.faction ?? '')
    .trim()
    .toLowerCase();
  const unitIsSoviet = raw === 'ussr' || raw === 'rkka';
  const unitIsAxis = raw === 'germany' || raw === 'wehrmacht';
  if (!unitIsSoviet && !unitIsAxis) return false;
  const mineIsSoviet = viewerFaction === 'rkka';
  const mineIsAxis = viewerFaction === 'wehrmacht';
  return (unitIsSoviet && mineIsSoviet) || (unitIsAxis && mineIsAxis);
}

export function readBattleUnitOrdersFromPayload(unit: Record<string, unknown>): {
  id: number;
  name: string;
  order_key?: string;
}[] {
  const raw = unit.orders ?? unit.allowedOrders;
  if (!Array.isArray(raw)) return [];
  const out: { id: number; name: string; order_key?: string }[] = [];
  for (const item of raw) {
    if (item != null && typeof item === 'object' && 'id' in item) {
      const id = Number((item as { id: unknown }).id);
      const name = (item as { name?: unknown }).name;
      const order_key =
        typeof (item as { order_key?: unknown }).order_key === 'string'
          ? String((item as { order_key: string }).order_key).trim()
          : undefined;
      if (Number.isFinite(id)) {
        out.push({
          id,
          name: typeof name === 'string' && name.trim() ? name.trim() : `Приказ ${id}`,
          ...(order_key ? { order_key } : {}),
        });
      }
      continue;
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      out.push({ id: item, name: `Приказ ${item}` });
    }
  }
  return out;
}

export function inferOrderKey(o: { name: string; order_key?: string }): string | null {
  const n = o.name.toLowerCase();
  if (n.includes('подавлен')) return 'fireHard';
  const k = o.order_key?.trim();
  if (k === 'loadingSup') return null;
  if (k) return k;
  if (n.includes('огонь')) return 'fire';
  if (n.includes('атака')) return 'attack';
  if (n.includes('боевое') && n.includes('полож')) return 'moveWar';
  if (n.includes('походн')) return 'move';
  if (n.includes('оборон')) return 'defend';
  if (n.includes('засад')) return 'ambush';
  if (n.includes('погруз')) return 'loading';
  if (n.includes('буксир')) return 'tow';
  if (n.includes('свёртыв') || n.includes('свертыв')) return 'clotting';
  if (n.includes('развёртыв') || n.includes('развертыв')) return 'deploy';
  if (n.includes('смена') && n.includes('сектор')) return 'changeSector';
  if (n.includes('выгруз')) return 'unloading';
  if (n.includes('припас') && (n.includes('получ') || n.includes('получен'))) return 'getSup';
  return null;
}

function normFaction(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

export function factionsOpposedOnMap(fa: string, fb: string): boolean {
  const a = normFaction(fa);
  const b = normFaction(fb);
  const sov = a === 'ussr' || a === 'rkka';
  const axis = a === 'germany' || a === 'wehrmacht';
  const sovB = b === 'ussr' || b === 'rkka';
  const axisB = b === 'germany' || b === 'wehrmacht';
  return (sov && axisB) || (axis && sovB);
}

export function cellsFromEditorPayload(payload: unknown): Cell[] | null {
  if (payload == null || typeof payload !== 'object') return null;
  const cells = (payload as { cells?: unknown }).cells;
  if (!Array.isArray(cells) || cells.length === 0) return null;
  return cells as Cell[];
}

export function buildInitialBattleCells(): Cell[] {
  const grid = generateEmptyGrid(BATTLE_GRID_W, BATTLE_GRID_H);
  const n = grid.length;
  if (n === 0) return grid;
  return placeUnitsOnGrid(
    grid,
    [
      { cellIndex: Math.min(Math.floor(n * 0.12), n - 1), catalogUnitId: 1 },
      { cellIndex: Math.min(Math.floor(n * 0.18), n - 1), catalogUnitId: 4 },
      { cellIndex: Math.min(Math.floor(n * 0.72), n - 1), catalogUnitId: 2 },
      { cellIndex: Math.min(Math.floor(n * 0.78), n - 1), catalogUnitId: 3 },
      { cellIndex: Math.min(Math.floor(n * 0.5), n - 1), catalogUnitId: 5 },
    ],
    { current: 1 },
  );
}

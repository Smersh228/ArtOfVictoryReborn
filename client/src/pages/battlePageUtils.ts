import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { BattlePlayerId } from '../game/battleSync';
import { ensureCellBuilds } from '../game/editorMapFortifications';
import { appendDefaultDotOrders } from '../game/cellDot';
import { appendDefaultGunDeployOrders } from '../game/battleDefendSector';
import { generateEmptyGrid } from '../game/hexGrid';
import { placeUnitsOnGrid } from '../game/battleUnits';
import { getCarriedUnitsFromTruck } from '../game/battleLogisticsUi';
import { teamFromUnit, teamSideLabel } from '../game/editorMapTeam';
import type { LobbyFaction } from '../api/rooms';

const BATTLE_GRID_W = 10;
const BATTLE_GRID_H = 10;

export function resolveBattleCellOnField(
  cell: Cell | null | undefined,
  fieldCells: Cell[],
): Cell | null | undefined {
  if (!cell || !fieldCells.length) return cell;
  const id = Number(cell.id);
  if (!Number.isFinite(id)) return cell;
  const found = fieldCells.find((c) => Number(c.id) === id);
  return found ?? cell;
}

export function battleUnitTypeLabelRu(type: unknown): string {
  const t = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  const labels: Record<string, string> = {
    infantry: 'пехота',
    artillery: 'артиллерия',
    tech: 'техника',
    armor: 'бронетехника',
    lighttank: 'лёгкий танк',
    mediumtank: 'средний танк',
    heavytank: 'тяжёлый танк',
    lightair: 'малая авиация',
    heavyair: 'большая авиация',
  };
  return labels[t] || 'отряд';
}

const CARGO_HOLD_ORDER_KEYS = new Set(['loading', 'unloading', 'tow', 'railLoading', 'railUnloading']);

export function unitHasCargoHoldOrders(unit: Record<string, unknown>): boolean {
  for (const o of readBattleUnitOrdersFromPayload(unit)) {
    const k = inferOrderKey(o);
    if (k && CARGO_HOLD_ORDER_KEYS.has(k)) return true;
  }
  return false;
}

export function formatBattleTechCargoLine(unit: Record<string, unknown>): string | null {
  if (!unitHasCargoHoldOrders(unit)) return null;
  const carried = getCarriedUnitsFromTruck(unit);
  if (!carried.length) return 'Нет';
  return carried.map((c) => String(c.name ?? '—')).join('; ');
}

export function formatBattleUnitTeamLabel(unit: Record<string, unknown>): string {
  const team = teamFromUnit(unit, 6)
  return `${team} · ${teamSideLabel(team)}`
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
  if (!Array.isArray(raw)) return appendDefaultGunDeployOrders(appendDefaultDotOrders([], unit), unit);
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
  return appendDefaultGunDeployOrders(appendDefaultDotOrders(out, unit), unit);
}

export function inferOrderKey(o: { name: string; order_key?: string }): string | null {
  const n = o.name.toLowerCase();
  if (n.includes('подавлен')) return 'fireHard';
  const k = o.order_key?.trim();
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
  if (n.includes('склад') && (n.includes('припас') || n.includes('загруз'))) return 'loadingSup';
  if (n.includes('припас') && (n.includes('загруз') || n.includes('получ') || n.includes('получен'))) return 'getSup';
  if (n.includes('разведк') && (n.includes('авиац') || n.includes('авиа'))) return 'intelligenceAir';
  if ((n.includes('поддержк') || n.includes('поддержка')) && (n.includes('авиац') || n.includes('авиа')))
    return 'airSupply';
  if (n.includes('сброс') && n.includes('припас')) return 'airSupply';
  if (n.includes('сопровожд') && (n.includes('авиац') || n.includes('авиа'))) return 'accompaniment';
  if (n.includes('штурмов')) return 'attackAir';
  if (n.includes('бомбардир')) return 'bombardment';
  if (n.includes('десант')) return 'desant';
  if (n.includes('перехват')) return 'interception';
  if (n.includes('патрулир')) return 'patrol';
  if (n.includes('занять') && n.includes('дот')) return 'enterDot';
  if (n.includes('покинуть') && n.includes('дот')) return 'exitDot';
  if (n.includes('войти') && n.includes('дот')) return 'enterDot';
  if (n.includes('выйти') && n.includes('дот')) return 'exitDot';
  if (n.includes('вырубк') || n.includes('просек')) return 'cutGlade';
  if (n.includes('ремонт') && (n.includes('жд') || n.includes('путе') || n.includes('железн'))) return 'repairRailway';
  if (n.includes('поджёг') || n.includes('поджег')) return 'arson';
  if (n.includes('подрыв') && !n.includes('сооруж') && !n.includes('загражд')) return 'demolition';
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

export function normalizeBattleCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ ...c, builds: ensureCellBuilds(c.builds) }));
}

export function cellsFromEditorPayload(payload: unknown): Cell[] | null {
  if (payload == null || typeof payload !== 'object') return null;
  const cells = (payload as { cells?: unknown }).cells;
  if (!Array.isArray(cells) || cells.length === 0) return null;
  return normalizeBattleCells(cells as Cell[]);
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

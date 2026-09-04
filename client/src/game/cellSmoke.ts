import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import smokeSpriteUrl from '../img/units/Germany/humans/humans/dum.png';
import { cellsEligibleForDemolition } from './cellDemolition';

export const SMOKE_SPRITE_URL = smokeSpriteUrl;

export const SMOKE_BLOCKED_ORDERS = new Set([
  'attack',
  'hardMove',
  'ambush',
  'move',
  'moveWar',
  'fireMove',
  'loading',
  'unloading',
  'tow',
  'getSup',
  'loadingSup',
  'clotting',
  'deploy',
  'changeSector',
  'explomost',
  'medical',
  'razvedka',
  'svzy',
  'buildPonton',
  'cutEj',
  'cutWire',
  'demining',
  'mining',
  'trenches',
  'enterDot',
  'exitDot',
  'railLoading',
  'railUnloading',
  'desant',
  'cutGlade',
  'repairRailway',
  'arson',
  'demolition',
]);

export function hasSmokeOnCell(builds: IBuildCell | undefined | null): boolean {
  if (!builds || typeof builds !== 'object') return false;
  const raw = (builds as { smoke?: unknown }).smoke;
  if (raw && typeof raw === 'object') return true;
  return Number(raw) > 0;
}

export function cellsEligibleForExplomost(fromCell: Cell, cells: Cell[]): Cell[] {
  return cellsEligibleForDemolition(fromCell, cells);
}

function factionsAllied(fa: string, fb: string): boolean {
  const a = String(fa || '').trim().toLowerCase();
  const b = String(fb || '').trim().toLowerCase();
  const sov = (x: string) => x === 'ussr' || x === 'rkka';
  const axis = (x: string) => x === 'germany' || x === 'wehrmacht';
  return (sov(a) && sov(b)) || (axis(a) && axis(b));
}

export function collectEnemyUnitsHiddenBySmoke(cells: Cell[], viewerFaction: string): number[] {
  if (!viewerFaction || viewerFaction === 'none') return [];
  const ids: number[] = [];
  for (const c of cells) {
    if (!hasSmokeOnCell(c.builds)) continue;
    for (const raw of c.units || []) {
      const u = raw as unknown as Record<string, unknown>;
      const n = Number(u.str ?? u.strength);
      if (Number.isFinite(n) && n <= 0) continue;
      if (factionsAllied(String(u.faction || ''), viewerFaction)) continue;
      const iid = Number(u.instanceId);
      if (Number.isFinite(iid)) ids.push(iid);
    }
  }
  return ids;
}

import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { hasPontonOnCell } from './cellPonton';
import smokeSpriteUrl from '../img/units/Germany/humans/humans/dum.png';

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
]);

export function hasSmokeOnCell(builds: IBuildCell | undefined | null): boolean {
  if (!builds || typeof builds !== 'object') return false;
  const raw = (builds as { smoke?: unknown }).smoke;
  if (raw && typeof raw === 'object') return true;
  return Number(raw) > 0;
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

export function cellsEligibleForExplomost(fromCell: Cell, cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    if (hexDist(fromCell, c) > 1) continue;
    if (hasPontonOnCell(c.builds)) out.push(c);
  }
  return out;
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

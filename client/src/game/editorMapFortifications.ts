import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { normalizeUnitTeam, teamSideLabel } from './editorMapTeam';
import dotImg from '../img/build/dot.png';
import minesImg from '../img/build/mines.png';
import storageImg from '../img/build/storage.png';
import pontonImg from '../img/build/pontoonBridge/ponton.png';
import ponton1Img from '../img/build/pontoonBridge/ponton1.png';
import ponton2Img from '../img/build/pontoonBridge/ponton2.png';
import pontonReadyImg from '../img/build/pontoonBridge/pontonReady.png';
import tankHedgehogImg from '../img/build/tankHedgehog/eji1.png';
import trenchImg from '../img/build/trench/trenchBottom.png';
import wireImg from '../img/build/wire/provolka_bottom.png';

/** Ключ поля `cell.builds` для укрепления на гексе. */
export type MapFortificationBuildKey = keyof Pick<
  IBuildCell,
  'dot' | 'wire' | 'antiTankBuild' | 'trench' | 'storage' | 'mine' | 'pontonBridge'
>;

export type CatalogFortification = {
  id: string;
  name: string;
  imagePath: string;
  buildKey: MapFortificationBuildKey;
  /** Увеличенная иконка только для проволки (PNG с большими полями). */
  iconVariant?: 'wire';
};

/** Статические карточки укреплений во вкладке «Сооружения» редактора карты. */
export const EDITOR_MAP_FORTIFICATIONS: CatalogFortification[] = [
  { id: 'fort_dot', name: 'ДОТ', imagePath: dotImg, buildKey: 'dot' },
  {
    id: 'fort_wire',
    name: 'Колючая проволока',
    imagePath: wireImg,
    buildKey: 'wire',
    iconVariant: 'wire',
  },
  {
    id: 'fort_anti_tank',
    name: 'Противотанковый ёж',
    imagePath: tankHedgehogImg,
    buildKey: 'antiTankBuild',
  },
  { id: 'fort_trench', name: 'Окоп', imagePath: trenchImg, buildKey: 'trench' },
  { id: 'fort_storage', name: 'Склад', imagePath: storageImg, buildKey: 'storage' },
  { id: 'fort_mine', name: 'Мина', imagePath: minesImg, buildKey: 'mine' },
];

/** Спрайты укреплений на карте. */
export const DOT_SPRITE_URL = dotImg;
export const STORAGE_SPRITE_URL = storageImg;
export const ANTITANK_SPRITE_URL = tankHedgehogImg;
export const TRENCH_SPRITE_URL = trenchImg;
/** Стадии наведения: ponton → ponton1 → ponton2 → pontonReady. */
export const PONTON_STAGE_SPRITE_URLS: readonly string[] = [pontonImg, ponton1Img, ponton2Img, pontonReadyImg];
export const PONTON_SPRITE_URL = pontonReadyImg;

export const STORAGE_DEFAULT_AMMO = 40;
export const STORAGE_DEFAULT_SMOKE = 2;
export const STORAGE_DEFAULT_EXPLOSIVES = 2;
export const STORAGE_DEFAULT_MINES = 4;

export type MineKind = 'infantry' | 'tank';

export function hasMineOnCell(builds: IBuildCell | undefined | null): boolean {
  return Number(builds?.mine) > 0;
}

export function isMineRevealed(builds: IBuildCell | undefined | null): boolean {
  return hasMineOnCell(builds) && Boolean(builds?.mineRevealed);
}

export function getMineKind(builds: IBuildCell | undefined | null): MineKind {
  return builds?.mineKind === 'tank' ? 'tank' : 'infantry';
}

export function readMineTeam(builds: IBuildCell | undefined | null): number | null {
  const n = Math.floor(Number(builds?.mineTeam));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function getMineTeam(builds: IBuildCell | undefined | null, limit: unknown = 6): number {
  return normalizeUnitTeam(readMineTeam(builds) ?? 1, limit);
}

export function mineOwnerBattleFaction(
  builds: IBuildCell | undefined | null,
): 'rkka' | 'wehrmacht' | 'none' {
  const team = readMineTeam(builds);
  if (team == null) return 'none';
  return team % 2 === 1 ? 'rkka' : 'wehrmacht';
}

export function isMineFriendlyToFaction(
  builds: IBuildCell | undefined | null,
  faction: unknown,
): boolean {
  const mf = mineOwnerBattleFaction(builds);
  const raw = String(faction || '').toLowerCase();
  const vf =
    raw === 'ussr' || raw === 'rkka' ? 'rkka' : raw === 'germany' || raw === 'wehrmacht' ? 'wehrmacht' : 'none';
  return mf !== 'none' && vf !== 'none' && mf === vf;
}

export function isMineVisibleOnBattleMap(
  builds: IBuildCell | undefined | null,
  viewerFaction: unknown,
): boolean {
  if (!hasMineOnCell(builds)) return false;
  if (isMineRevealed(builds)) return true;
  return isMineFriendlyToFaction(builds, viewerFaction);
}

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

export function cellsEligibleForDemining(
  fromCell: Cell,
  allCells: Cell[],
  viewerFaction: unknown,
): Cell[] {
  const out: Cell[] = [];
  if (isMineVisibleOnBattleMap(fromCell.builds, viewerFaction)) out.push(fromCell);
  for (const d of CUBE_NEIGHBOR_DIRS) {
    const nb = allCells.find(
      (c) =>
        c.coor.x === fromCell.coor.x + d.x &&
        c.coor.y === fromCell.coor.y + d.y &&
        c.coor.z === fromCell.coor.z + d.z,
    );
    if (!nb || !isMineVisibleOnBattleMap(nb.builds, viewerFaction)) continue;
    out.push(nb);
  }
  return out;
}

export function mineKindLabel(kind: MineKind): string {
  return kind === 'tank' ? 'Танковая' : 'Пехотная';
}

export function buildMineHoverTip(builds: IBuildCell | undefined | null): {
  title: string;
  rows: { key: string; val: string }[];
} {
  const team = readMineTeam(builds);
  const rows = [{ key: 'Тип', val: mineKindLabel(getMineKind(builds)) }];
  if (team != null) {
    rows.push({ key: 'Сторона', val: `Команда ${team} (${teamSideLabel(team)})` });
  }
  return { title: 'Мина', rows };
}

export function applyMineDefaults(
  builds: IBuildCell,
  kind: MineKind = 'infantry',
  team: unknown = 1,
): IBuildCell {
  return {
    ...builds,
    mine: 1,
    mineKind: kind,
    mineTeam: normalizeUnitTeam(team ?? readMineTeam(builds) ?? 1, 6),
  };
}

export function clearMineFields(builds: IBuildCell): IBuildCell {
  const next = { ...builds, mine: 0 };
  delete next.mineKind;
  delete next.mineRevealed;
  delete next.mineTeam;
  return next;
}

export function hasStorageOnCell(builds: IBuildCell | undefined | null): boolean {
  return Number(builds?.storage) > 0;
}

function readSupplyCount(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export function applyStorageSupplyDefaults(builds: IBuildCell): IBuildCell {
  const out = { ...builds, storage: 1 };
  out.storageAmmo = readSupplyCount(out.storageAmmo, STORAGE_DEFAULT_AMMO, STORAGE_DEFAULT_AMMO);
  out.storageSmoke = readSupplyCount(out.storageSmoke, STORAGE_DEFAULT_SMOKE, STORAGE_DEFAULT_SMOKE);
  out.storageExplosives = readSupplyCount(out.storageExplosives, STORAGE_DEFAULT_EXPLOSIVES, STORAGE_DEFAULT_EXPLOSIVES);
  out.storageMines = readSupplyCount(out.storageMines, STORAGE_DEFAULT_MINES, STORAGE_DEFAULT_MINES);
  return out;
}

export function clearStorageSupplyFields(builds: IBuildCell): IBuildCell {
  const next = { ...builds, storage: 0 };
  delete next.storageAmmo;
  delete next.storageSmoke;
  delete next.storageExplosives;
  delete next.storageMines;
  return next;
}

export const EMPTY_CELL_BUILDS: IBuildCell = {
  trench: 0,
  trenchEdges: 0,
  wire: 0,
  wireEdges: 0,
  antiTankBuild: 0,
  antiTankEdges: 0,
  storage: 0,
  mine: 0,
  trenchTank: 0,
  dot: 0,
  pontonBridge: 0,
};

export function ensureCellBuilds(builds: IBuildCell | undefined | null): IBuildCell {
  if (builds == null || typeof builds !== 'object') {
    return { ...EMPTY_CELL_BUILDS };
  }
  const merged = {
    ...EMPTY_CELL_BUILDS,
    ...builds,
  };
  if (Number(merged.dot) > 0) {
    const def = Number(merged.dotDef);
    if (!Number.isFinite(def) || def <= 0) merged.dotDef = 4;
    const ammo = Number(merged.dotAmmo);
    if (!Number.isFinite(ammo)) merged.dotAmmo = 15;
  }
  if (Number(merged.storage) > 0) {
    return applyStorageSupplyDefaults(merged);
  }
  if (Number(merged.mine) > 0) {
    merged.mineKind = merged.mineKind === 'tank' ? 'tank' : 'infantry';
    const team = Math.floor(Number(merged.mineTeam));
    if (Number.isFinite(team) && team >= 1) merged.mineTeam = team;
  }
  return merged;
}

const STRUCTURE_COUNT_KEYS = [
  'dot',
  'wire',
  'antiTankBuild',
  'trench',
  'storage',
  'mine',
  'pontonBridge',
  'trenchTank',
] as const;

const STRUCTURE_EDGE_KEYS = ['trenchEdges', 'wireEdges', 'antiTankEdges'] as const;

export function cellHasEditorStructure(cell: Cell): boolean {
  const extra = cell as Cell & { mapBuilding?: unknown };
  if (extra.mapBuilding != null) return true;
  const b = ensureCellBuilds(cell.builds);
  for (const key of STRUCTURE_COUNT_KEYS) {
    if (Number(b[key]) > 0) return true;
  }
  for (const key of STRUCTURE_EDGE_KEYS) {
    if (Number(b[key]) > 0) return true;
  }
  return false;
}

export function clearCellEditorStructures(cell: Cell): Cell {
  const next = { ...cell, builds: { ...EMPTY_CELL_BUILDS } } as Cell & { mapBuilding?: unknown };
  delete next.mapBuilding;
  return next;
}

export function isCatalogFortification(
  item: { buildKey?: unknown; dbId?: unknown; faction?: unknown } | null | undefined,
): item is CatalogFortification {
  return (
    item != null &&
    typeof item === 'object' &&
    typeof item.buildKey === 'string' &&
    !('dbId' in item) &&
    !('faction' in item)
  );
}

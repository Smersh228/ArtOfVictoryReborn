import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import dotImg from '../img/build/dot.png';
import minesImg from '../img/build/mines.png';
import storageImg from '../img/build/storage.png';
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
  {
    id: 'fort_ponton_bridge',
    name: 'Понтонный мост',
    imagePath: pontonReadyImg,
    buildKey: 'pontonBridge',
  },
];

/** Спрайты укреплений на карте. */
export const DOT_SPRITE_URL = dotImg;
export const STORAGE_SPRITE_URL = storageImg;
export const ANTITANK_SPRITE_URL = tankHedgehogImg;
export const TRENCH_SPRITE_URL = trenchImg;

export const STORAGE_DEFAULT_AMMO = 40;
export const STORAGE_DEFAULT_SMOKE = 2;
export const STORAGE_DEFAULT_EXPLOSIVES = 2;
export const STORAGE_DEFAULT_MINES = 4;

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

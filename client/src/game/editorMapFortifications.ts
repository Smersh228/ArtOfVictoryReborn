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
  return {
    ...EMPTY_CELL_BUILDS,
    ...builds,
  };
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

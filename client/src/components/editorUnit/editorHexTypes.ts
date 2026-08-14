/** Фильтр списка гексов в редакторе каталога */
export const HEX_SIDEBAR_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'rivers', label: 'Реки' },
  { id: 'nature', label: 'Природа' },
  { id: 'buildings', label: 'Строения' },
  { id: 'roads', label: 'Дороги' },
];

export const HEX_FORM_CATEGORIES = HEX_SIDEBAR_CATEGORIES.filter((c) => c.id !== 'all');

/** Типы юнитов для сеток гекса (стоимость хода, защита, засада). */
export const HEX_UNIT_TYPES: { id: string; label: string }[] = [
  { id: 'infantry', label: 'Пехота' },
  { id: 'artillery', label: 'Артиллерия' },
  { id: 'tech', label: 'Техника' },
  { id: 'armor', label: 'Бронетехника' },
  { id: 'lightTank', label: 'Лёгкие танки' },
  { id: 'mediumTank', label: 'Средние танки' },
  { id: 'heavyTank', label: 'Тяжёлые танки' },
  { id: 'lightAir', label: 'Малая авиация' },
  { id: 'heavyAir', label: 'Большая авиация' },
];

export const HEX_SAVE_UNIT_TYPE_IDS = HEX_UNIT_TYPES.map((t) => t.id);

/** Стоимость хода и бонус защиты по типу (без авиации — для них действует общая «тех» метка на карте). */
export const HEX_MOVE_DEF_UNIT_TYPES: { id: string; label: string }[] = HEX_UNIT_TYPES.filter(
  (t) => t.id !== 'lightAir' && t.id !== 'heavyAir',
);
export const HEX_MOVE_DEF_TYPE_IDS = HEX_MOVE_DEF_UNIT_TYPES.map((t) => t.id);

export const HEX_ACCURACY_TYPES: { id: string; label: string }[] = [
  { id: 'infantry', label: 'Пехота' },
  { id: 'artillery', label: 'Артиллерия' },
  { id: 'tech', label: 'Техника' },
  { id: 'armor', label: 'Бронетехника' },
  { id: 'lightTank', label: 'Лёгкие танки' },
  { id: 'mediumTank', label: 'Средние танки' },
  { id: 'heavyTank', label: 'Тяжёлые танки' },
];
export const HEX_ACCURACY_TYPE_IDS = HEX_ACCURACY_TYPES.map((t) => t.id);

/** Типы целей для бонуса меткости (включая авиацию и строения). */
export const HEX_ACCURACY_TARGET_TYPES: { id: string; label: string }[] = [
  { id: '', label: 'Любая цель' },
  ...HEX_UNIT_TYPES,
  { id: 'build', label: 'Строения' },
];

export const HEX_PLACEMENT_OPTS: { key: string; name: string; label: string }[] = [
  { key: 'barbedWire', name: 'hex_place_barbedWire', label: 'Колючая проволка' },
  { key: 'tankHedgehog', name: 'hex_place_tankHedgehog', label: 'Танковый ёж' },
  { key: 'dot', name: 'hex_place_dot', label: 'Дот' },
  { key: 'warehouse', name: 'hex_place_warehouse', label: 'Склад' },
  { key: 'mine', name: 'hex_place_mine', label: 'Мина' },
  { key: 'trench', name: 'hex_place_trench', label: 'Окоп' },
  { key: 'pontonBridge', name: 'hex_place_pontonBridge', label: 'Понтонный мост' },
];

import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { settlementKindOf, settlementKindFromFlags, isSettlementDestroyedHex } from './cellSettlementFire';
import { isIntactBridgeHex, isRailwayBridgeHex, isDestroyedBridgeHex } from './battleSpecialTerrain';
import { isRailwayStationHex } from './cellRailway';

export type StructureHpKind = 'city' | 'village' | 'station' | 'bridge' | 'railBridge';

export type StructureHp = {
  kind: StructureHpKind;
  str: number;
  maxStr: number;
  def: number;
  maxDef: number;
};

function splitNums(v: unknown): number[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => Number(x) || 0);
  return String(v)
    .split(',')
    .map((x) => {
      const n = Number(String(x).trim());
      return Number.isFinite(n) ? n : 0;
    });
}

export function unitHasBuildFire(unit: Record<string, unknown> | null | undefined, useReactiveFire?: boolean): boolean {
  if (!unit) return false;
  const src = useReactiveFire
    ? unit.fireReactive
    : unit.fireParsed || unit.fire;
  if (!src || typeof src !== 'object') return false;
  const raw = (src as Record<string, unknown>).build;
  if (raw == null || raw === '') return false;
  return splitNums(raw).some((n) => n > 0);
}

export function hpKindForCell(cell: Cell | null | undefined): StructureHpKind | null {
  if (!cell) return null;
  const stored = cell.builds && (cell.builds as IBuildCell).structureHp;
  if (stored && stored.kind === 'station') return 'station';
  if (isSettlementDestroyedHex(cell)) return null;
  if (isDestroyedBridgeHex(cell)) return null;
  if (isRailwayStationHex(cell)) return 'station';
  const sk = settlementKindOf(cell);
  if (sk) return sk;
  if (stored && (stored.kind === 'city' || stored.kind === 'village' || stored.kind === 'bridge' || stored.kind === 'railBridge')) {
    return stored.kind;
  }
  if (isIntactBridgeHex(cell) && isRailwayBridgeHex(cell)) return 'railBridge';
  if (isIntactBridgeHex(cell)) return 'bridge';
  return null;
}

function defaultHp(kind: StructureHpKind): StructureHp {
  if (kind === 'city') return { kind, str: 18, maxStr: 18, def: 2, maxDef: 2 };
  if (kind === 'village') return { kind, str: 24, maxStr: 24, def: 1, maxDef: 1 };
  if (kind === 'station') return { kind, str: 12, maxStr: 12, def: 1, maxDef: 1 };
  return { kind, str: 3, maxStr: 3, def: 3, maxDef: 3 };
}

export function structureHpOf(cell: Cell | null | undefined): StructureHp | null {
  if (!cell) return null;
  if (isSettlementDestroyedHex(cell) || isDestroyedBridgeHex(cell)) return null;
  const raw = cell.builds && (cell.builds as IBuildCell).structureHp;
  if (raw && typeof raw === 'object' && raw.kind) {
    const str = Number(raw.str);
    if (Number.isFinite(str) && str <= 0) return null;
    return {
      kind: raw.kind,
      str: Number.isFinite(str) ? str : 0,
      maxStr: Number(raw.maxStr) || 0,
      def: Math.max(0, Number(raw.def) || 0),
      maxDef: Math.max(0, Number(raw.maxDef) || 0),
    };
  }
  const kind = hpKindForCell(cell);
  if (!kind) return null;
  return defaultHp(kind);
}

export function isShootableStructureCell(cell: Cell | null | undefined): boolean {
  const hp = structureHpOf(cell);
  return !!(hp && hp.str > 0);
}

export function unitCanEnterDamagedStructure(
  unit: { type?: unknown; properties?: unknown } | null | undefined,
  cell: Cell | null | undefined,
): boolean {
  if (!unit || !cell) return true;
  const t = String(unit.type || '')
    .trim()
    .toLowerCase();
  if (t === 'lightair' || t === 'heavyair') return true;
  if (isDestroyedBridgeHex(cell)) {
    return unitHasPropKeyForStructure(unit, 'waterUnit');
  }
  const hp = structureHpOf(cell);
  if (!hp || (hp.kind !== 'bridge' && hp.kind !== 'railBridge')) return true;
  if (hp.str <= 0) return false;
  if (hp.str <= 2 && t === 'heavytank') return false;
  if (hp.str <= 1 && t !== 'infantry' && t !== 'artillery') return false;
  if (hp.kind === 'railBridge' && hp.str <= 2) {
    if (unitHasPropKeyForStructure(unit, 'railwayDetachment')) return false;
  }
  return true;
}

function unitHasPropKeyForStructure(unit: { properties?: unknown } | null | undefined, key: string): boolean {
  const props = unit?.properties;
  if (!Array.isArray(props)) return false;
  const want = String(key).trim();
  for (const p of props) {
    if (
      p &&
      typeof p === 'object' &&
      String((p as { prop_key?: string; key?: string }).prop_key || (p as { key?: string }).key || '').trim() === want
    ) {
      return true;
    }
  }
  return false;
}

export function stationHasLoadBonus(cell: Cell | null | undefined): boolean {
  if (isSettlementDestroyedHex(cell)) return false;
  const hp = structureHpOf(cell);
  if (hp && hp.kind === 'station' && hp.str <= 0) return false;
  return true;
}

export function structureHpLabel(hp: StructureHp): string {
  return `З${hp.def} ${hp.str}`;
}

export type StructureInspect = {
  kind: StructureHpKind;
  destroyed: boolean;
  str: number;
  maxStr: number;
  def: number;
  maxDef: number;
  defBonusInf: number;
  defBonusTech: number;
  defBonusByType: { id: string; label: string; value: number }[];
  accuracyBonusByType: { id: string; label: string; value: number }[];
};

const STRUCTURE_KIND_LABEL: Record<StructureHpKind, string> = {
  city: 'Город',
  village: 'Деревня',
  station: 'ЖД станция',
  bridge: 'Мост',
  railBridge: 'ЖД мост',
};

const UNIT_TYPE_LABELS: { id: string; label: string }[] = [
  { id: 'infantry', label: 'Пехота' },
  { id: 'artillery', label: 'Артиллерия' },
  { id: 'tech', label: 'Техника' },
  { id: 'armor', label: 'Бронетехника' },
  { id: 'lightTank', label: 'Лёгкие танки' },
  { id: 'mediumTank', label: 'Средние танки' },
  { id: 'heavyTank', label: 'Тяжёлые танки' },
];

function hexExtraOfStructure(cell: Cell | null | undefined): Record<string, unknown> | null {
  const ex = cell && (cell as { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null;
}

function readBonusMap(
  src: unknown,
  labels: { id: string; label: string }[],
): { id: string; label: string; value: number }[] {
  if (!src || typeof src !== 'object') return [];
  const rec = src as Record<string, unknown>;
  const out: { id: string; label: string; value: number }[] = [];
  for (const t of labels) {
    const n = Number(rec[t.id]);
    if (Number.isFinite(n) && n !== 0) out.push({ id: t.id, label: t.label, value: n });
  }
  return out;
}

export function structureInspectOf(cell: Cell | null | undefined): StructureInspect | null {
  if (!cell) return null;
  const destroyedSettle = isSettlementDestroyedHex(cell);
  const destroyedBridge = isDestroyedBridgeHex(cell);
  let kind: StructureHpKind | null = null;
  let destroyed = false;
  if (destroyedSettle) {
    const sk = settlementKindFromFlags(cell);
    if (sk) {
      kind = sk;
      destroyed = true;
    }
  } else if (destroyedBridge) {
    kind = isRailwayBridgeHex(cell) ? 'railBridge' : 'bridge';
    destroyed = true;
  } else {
    kind = hpKindForCell(cell);
  }
  if (!kind) return null;
  const live = destroyed ? null : structureHpOf(cell);
  const fallback = defaultHp(kind);
  const hp = live && live.kind === kind ? live : fallback;
  const ex = hexExtraOfStructure(cell);
  const cellAny = cell as unknown as {
    defBonusInf?: number;
    defBonusTech?: number;
    defBonusByType?: Record<string, number>;
  };
  const defBonusInf = Math.max(
    0,
    Number((ex && ex.defBonusInf) ?? cellAny.defBonusInf) || 0,
  );
  const defBonusTech = Math.max(
    0,
    Number((ex && ex.defBonusTech) ?? cellAny.defBonusTech) || 0,
  );
  const defBonusByType = readBonusMap(
    (ex && ex.defBonusByType) || cellAny.defBonusByType,
    UNIT_TYPE_LABELS,
  );
  const accuracyBonusByType = readBonusMap(ex && ex.accuracyBonusByType, UNIT_TYPE_LABELS);
  return {
    kind,
    destroyed,
    str: destroyed ? 0 : hp.str,
    maxStr: hp.maxStr,
    def: destroyed ? 0 : hp.def,
    maxDef: hp.maxDef,
    defBonusInf,
    defBonusTech,
    defBonusByType,
    accuracyBonusByType,
  };
}

export function structureKindLabel(kind: StructureHpKind): string {
  return STRUCTURE_KIND_LABEL[kind];
}

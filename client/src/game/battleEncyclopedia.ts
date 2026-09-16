import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { EditorCatalogResponse } from '../api/editorCatalog';
import type { ManualRuleCardEntry } from '../components/manual/ManualRuleCard';
import { hoverTipFromStructure } from '../components/battle/battleHoverTip';
import { unitStatsRowsForTip } from './battleUnitStatsTip';
import { EDITOR_UNIT_PROPERTY_DEFS } from './editorUnitPropertyIcons';

const RULE_HEAD_REF_RE = /^(units|hexes):(\d+)$/;

export type BattleEncyclopediaKind = 'unit' | 'hex';

export type BattleEncyclopediaView = {
  kind: BattleEncyclopediaKind;
  entry: ManualRuleCardEntry;
  liveRows: { label: string; value: string }[];
};

type ManualStatRow = { label: string; value: string };

const FACTION_LABELS: Record<string, string> = {
  ussr: 'СССР',
  germany: 'Германия',
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  infantry: 'Пехота',
  artillery: 'Артиллерия',
  tech: 'Техника',
  armor: 'Бронетехника',
  lightTank: 'Лёгкие танки',
  mediumTank: 'Средние танки',
  heavyTank: 'Тяжёлые танки',
  lightAir: 'Малая авиация',
  heavyAir: 'Большая авиация',
};

function parseRuleHead(raw: unknown): { kind: 'units' | 'hexes'; entityId: number } | null {
  const head = String(raw ?? '').trim();
  const m = head.match(RULE_HEAD_REF_RE);
  if (!m) return null;
  const entityId = Number(m[2]);
  if (!Number.isFinite(entityId)) return null;
  return { kind: m[1] as 'units' | 'hexes', entityId };
}

function historicalRuleImage(r: Record<string, unknown>): string {
  for (const key of ['imagePath2', 'imagePath3'] as const) {
    const p = r[key];
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return '';
}

function pushRow(rows: ManualStatRow[], label: string, value: unknown) {
  if (value == null || value === '') return;
  const s = String(value).trim();
  if (!s) return;
  rows.push({ label, value: s });
}

function propertyDisplayName(p: unknown): string {
  if (!p || typeof p !== 'object') return '';
  const rec = p as { name?: unknown; prop_key?: unknown; key?: unknown };
  const key = String(rec.prop_key ?? rec.key ?? '').trim();
  if (key === 'fireAdjustment') return '';
  const fromDef = EDITOR_UNIT_PROPERTY_DEFS.find((d) => d.prop_key === key)?.name ?? '';
  return fromDef || String(rec.name ?? '').trim();
}

function unitCatalogRows(u: Record<string, unknown>): ManualStatRow[] {
  const rows: ManualStatRow[] = [];
  const fr = String(u.faction ?? '').trim();
  if (fr) pushRow(rows, 'Фракция', FACTION_LABELS[fr] ?? fr);
  const ut = String(u.type ?? '').trim();
  if (ut) pushRow(rows, 'Тип', UNIT_TYPE_LABELS[ut] ?? ut);
  pushRow(rows, 'Численность', u.str);
  pushRow(rows, 'Защита', u.def);
  pushRow(rows, 'Мораль', u.mor);
  pushRow(rows, 'Боеприпасы', u.ammo);
  pushRow(rows, 'Мины', u.mines);
  pushRow(rows, 'Взрывчатка', u.explosives);
  pushRow(rows, 'Дымовые снаряды', u.smokeShells);
  pushRow(rows, 'Видимость', u.vis);
  const fire = u.fire;
  if (fire && typeof fire === 'object') {
    const f = fire as Record<string, unknown>;
    pushRow(rows, 'Дальность стрельбы', f.range);
    pushRow(rows, 'Урон по пехоте', f.inf);
    pushRow(rows, 'Урон по артиллерии', f.art);
    pushRow(rows, 'Урон по технике', f.tech);
    pushRow(rows, 'Урон по лёгким танкам', f.lt);
    pushRow(rows, 'Урон по средним танкам', f.mt);
    pushRow(rows, 'Урон по тяжёлым танкам', f.ht);
    pushRow(rows, 'Урон по малой авиации', f.sa);
    pushRow(rows, 'Урон по большой авиации', f.ba);
    pushRow(rows, 'Урон по строениям', f.build);
  }
  const properties = u.properties;
  if (Array.isArray(properties) && properties.length > 0) {
    const names = properties.map(propertyDisplayName).filter(Boolean);
    if (names.length) rows.push({ label: 'Свойства', value: names.join(', ') });
  }
  return rows;
}

function hexCatalogRows(h: Record<string, unknown>): ManualStatRow[] {
  const rows: ManualStatRow[] = [];
  const mc = Number(h.moveCost);
  const mci = h.moveCostInf != null ? Number(h.moveCostInf) : Number.isFinite(mc) ? mc : 1;
  const mct = h.moveCostTech != null ? Number(h.moveCostTech) : Number.isFinite(mc) ? mc : 1;
  rows.push({ label: 'Стоимость хода (пехота)', value: String(mci) });
  rows.push({ label: 'Стоимость хода (техника)', value: String(mct) });
  rows.push({ label: 'Бонус защиты (пехота)', value: String(Number(h.defBonusInf) || 0) });
  rows.push({ label: 'Бонус защиты (техника)', value: String(Number(h.defBonusTech) || 0) });
  const blocksVision =
    h.visionBlock === true || h.visionBlock === 'true' || h.visionBlock === 1 || h.visionBlock === '1';
  rows.push({ label: 'Блокирует обзор', value: blocksVision ? 'Да' : 'Нет' });
  return rows;
}

export function catalogHexIdOfCell(cell: { type?: unknown; hexExtra?: unknown } | null | undefined): number | null {
  const fromType = String(cell?.type ?? '')
    .trim()
    .match(/^hex_(\d+)$/i);
  if (fromType) return Number(fromType[1]);
  const ex =
    cell?.hexExtra && typeof cell.hexExtra === 'object' ? (cell.hexExtra as Record<string, unknown>) : null;
  const n = Number(ex?.catalogHexId ?? ex?.id_hex);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findRule(
  catalog: EditorCatalogResponse | null,
  kind: 'units' | 'hexes',
  entityId: number,
): Record<string, unknown> | null {
  const rules = catalog?.rulesEditor ?? [];
  for (const raw of rules) {
    const r = raw as Record<string, unknown>;
    const ref = parseRuleHead(r.chapter ?? r.head);
    if (ref?.kind === kind && ref.entityId === entityId) return r;
  }
  return null;
}

function ruleEntry(
  rule: Record<string, unknown> | null,
  fallbackTitle: string,
  statRows: ManualStatRow[],
  spritePath = '',
): ManualRuleCardEntry {
  return {
    id: Number(rule?.id) || 0,
    ruleTitle: String(rule?.title ?? '').trim() || fallbackTitle,
    description: '',
    imagePath: historicalRuleImage(rule ?? {}),
    imagePath2: '',
    imagePath3: '',
    spritePath,
    statRows,
  };
}

export function buildUnitEncyclopediaCard(
  unit: Record<string, unknown> | null | undefined,
  catalog: EditorCatalogResponse | null,
  cells?: Cell[] | null,
  unitCell?: Cell | null,
  pendingOrderKey?: string | null,
  hideCurrentAmmo = false,
): BattleEncyclopediaView | null {
  if (!unit) return null;
  const catalogId = Number(unit.id);
  if (!Number.isFinite(catalogId)) return null;
  const unitsEditor = (catalog?.unitsEditor ?? []) as Array<Record<string, unknown>>;
  const catalogUnit = unitsEditor.find((u) => Number(u.id) === catalogId) ?? null;
  const rule = findRule(catalog, 'units', catalogId);
  const name = String(unit.name ?? catalogUnit?.name ?? 'Юнит');
  const sprite = String(catalogUnit?.imagePath ?? unit.img ?? unit.imagePath ?? '');
  const liveRows = unitStatsRowsForTip(unit, cells ?? null, unitCell ?? null, {
    pendingOrderKey,
    hideCurrentAmmo,
  }).map((row) => ({
    label: row.key,
    value: row.val,
  }));
  return {
    kind: 'unit',
    entry: ruleEntry(rule, name, catalogUnit ? unitCatalogRows(catalogUnit) : [], sprite),
    liveRows,
  };
}

export function buildHexEncyclopediaCard(
  cell: Cell | null | undefined,
  catalog: EditorCatalogResponse | null,
): BattleEncyclopediaView | null {
  if (!cell) return null;
  const hexId = catalogHexIdOfCell(cell);
  const hexesEditor = (catalog?.hexesEditor ?? []) as Array<Record<string, unknown>>;
  const catalogHex = hexId != null ? hexesEditor.find((h) => Number(h.id) === hexId) ?? null : null;
  const rule = hexId != null ? findRule(catalog, 'hexes', hexId) : null;
  const ex = cell.hexExtra && typeof cell.hexExtra === 'object' ? (cell.hexExtra as Record<string, unknown>) : null;
  const name = String(catalogHex?.name ?? ex?.name ?? `Гекс ${cell.id}`);
  const liveRows: { label: string; value: string }[] = [{ label: 'Клетка', value: String(cell.id) }];
  const structure = hoverTipFromStructure(cell);
  if (structure) {
    liveRows.push({ label: 'Объект', value: structure.title });
    for (const row of structure.rows) liveRows.push({ label: row.key, value: row.val });
  }
  if (ex?.isCity === true) liveRows.push({ label: 'Тип поселения', value: 'Город' });
  else if (ex?.isVillage === true) liveRows.push({ label: 'Тип поселения', value: 'Деревня' });
  return {
    kind: 'hex',
    entry: ruleEntry(
      rule,
      name,
      catalogHex ? hexCatalogRows(catalogHex) : [],
      String(catalogHex?.imagePath ?? cell.img ?? ''),
    ),
    liveRows,
  };
}

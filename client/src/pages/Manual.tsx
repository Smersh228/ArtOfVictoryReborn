import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './styleModules/manual.module.css';
import { fetchEditorCatalog } from '../api/editorCatalog';
import ManualSidebar from '../components/manual/ManualSidebar';
import ManualCardsSection from '../components/manual/ManualCardsSection';
import ManualRuleCard from '../components/manual/ManualRuleCard';


const RULE_HEAD_REF_RE = /^(units|hexes):(\d+)$/;

function parseRuleHead(
  raw: unknown,
): { kind: 'units' | 'hexes'; entityId: number } | null {
  const head = String(raw ?? '').trim();
  const m = head.match(RULE_HEAD_REF_RE);
  if (!m) return null;
  const entityId = Number(m[2]);
  if (!Number.isFinite(entityId)) return null;
  return { kind: m[1] as 'units' | 'hexes', entityId };
}


function ruleDescOnly(r: Record<string, unknown>): string {
  return String(r.desc ?? '').trim();
}

function firstRuleImage(r: Record<string, unknown>): string {
  for (const key of ['imagePath', 'imagePath2', 'imagePath3'] as const) {
    const p = r[key];
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return '';
}

function ruleImagePath2(r: Record<string, unknown>): string {
  const p = r.imagePath2;
  return typeof p === 'string' ? p.trim() : '';
}

function ruleImagePath3(r: Record<string, unknown>): string {
  const p = r.imagePath3;
  return typeof p === 'string' ? p.trim() : '';
}

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

const HEX_BUILDING_LABELS: Record<string, string> = {
  mine: 'Мина',
  warehouse: 'Склад',
  barbed_wire: 'Колючая проволока',
  tank_trap: 'Танковый ёж',
  trench: 'Окоп',
  pillbox: 'Дот',
};

function labelFaction(raw: string): string {
  const k = raw.trim();
  return FACTION_LABELS[k] ?? (k || '—');
}

function labelUnitType(raw: string): string {
  const k = raw.trim();
  return UNIT_TYPE_LABELS[k] ?? (k || '—');
}

function pushRow(rows: ManualStatRow[], label: string, value: unknown) {
  if (value == null || value === '') return;
  const s = String(value).trim();
  if (!s) return;
  rows.push({ label, value: s });
}

function unitStatRows(u: Record<string, unknown>): ManualStatRow[] {
  const rows: ManualStatRow[] = [];
  const fr = String(u.faction ?? '').trim();
  if (fr) pushRow(rows, 'Фракция', labelFaction(fr));
  const ut = String(u.type ?? '').trim();
  if (ut) pushRow(rows, 'Тип', labelUnitType(ut));
  pushRow(rows, 'Численность', u.str);
  pushRow(rows, 'Защита', u.def);
  pushRow(rows, 'Мораль', u.mor);
  pushRow(rows, 'Боеприпасы', u.ammo);
  pushRow(rows, 'Мины', u.mines);
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
  }

  const orders = u.orders;
  if (Array.isArray(orders) && orders.length > 0) {
    const names = orders
      .map((o) => (o && typeof o === 'object' ? String((o as { name?: string }).name ?? '').trim() : ''))
      .filter(Boolean);
    if (names.length) rows.push({ label: 'Приказы', value: names.join(', ') });
  }

  return rows;
}

function hexStatRows(h: Record<string, unknown>): ManualStatRow[] {
  const rows: ManualStatRow[] = [];
  const mc = Number(h.moveCost);
  const mci = h.moveCostInf != null ? Number(h.moveCostInf) : Number.isFinite(mc) ? mc : 1;
  const mct = h.moveCostTech != null ? Number(h.moveCostTech) : Number.isFinite(mc) ? mc : 1;
  rows.push({ label: 'Стоимость хода (пехота)', value: String(mci) });
  rows.push({ label: 'Стоимость хода (техника)', value: String(mct) });
  const di = Number(h.defBonusInf) || 0;
  const dt = Number(h.defBonusTech) || 0;
  rows.push({ label: 'Бонус защиты (пехота)', value: String(di) });
  rows.push({ label: 'Бонус защиты (техника)', value: String(dt) });
  const blocksVision =
    h.visionBlock === true || h.visionBlock === 'true' || h.visionBlock === 1 || h.visionBlock === '1';
  rows.push({ label: 'Блокирует обзор', value: blocksVision ? 'Да' : 'Нет' });

  const allowed = h.allowedBuildings;
  if (Array.isArray(allowed) && allowed.length > 0) {
    const lbls = allowed
      .filter((x): x is string => typeof x === 'string')
      .map((id) => HEX_BUILDING_LABELS[id] ?? id);
    if (lbls.length) rows.push({ label: 'Доступные сооружения', value: lbls.join(', ') });
  }

  return rows;
}


interface ManualRuleEntry {
  id: number;

  ruleTitle: string;
  description: string;
  imagePath: string;

  imagePath2: string;
  imagePath3: string;
  statRows: ManualStatRow[];

  unitFaction?: string;
  unitType?: string;
}


type ManualChapterSection = 'game_turn' | 'general' | 'orders' | 'properties';

const RULE_CHAPTER_TO_MANUAL_SECTION: Record<string, ManualChapterSection> = {
  game_turn: 'game_turn',
  general_mechanics: 'general',
  orders: 'orders',
  properties: 'properties',
};

function emptyChapterRuleBuckets(): Record<ManualChapterSection, ManualRuleEntry[]> {
  return {
    game_turn: [],
    general: [],
    orders: [],
    properties: [],
  };
}

const Manual: React.FC = () => {
  const navigate = useNavigate();
  const [selectedSection, setSelectedSection] = useState<string>('units');

  const [selectedFaction, setSelectedFaction] = useState<string>('all');
  const [selectedUnitType, setSelectedUnitType] = useState<string>('all');

  const factions = [
    { id: 'all', label: 'Все' },
    { id: 'ussr', label: 'СССР' },
    { id: 'germany', label: 'Германия' },
  ];

  const unitTypes = [
    { id: 'all', label: 'Все' },
    { id: 'infantry', label: 'Пехота' },
    { id: 'tech', label: 'Техника' },
    { id: 'mediumTank', label: 'Средние танки' },
    { id: 'lightTank', label: 'Лёгкие танки' },
    { id: 'artillery', label: 'Артиллерия' },
  ];

  const [unitRuleCards, setUnitRuleCards] = useState<ManualRuleEntry[]>([]);
  const [hexRuleCards, setHexRuleCards] = useState<ManualRuleEntry[]>([]);
  const [chapterRulesBySection, setChapterRulesBySection] = useState<
    Record<ManualChapterSection, ManualRuleEntry[]>
  >(() => emptyChapterRuleBuckets());

  useEffect(() => {
    fetchEditorCatalog()
      .then((d) => {
        const rulesEditor = (d.rulesEditor || []) as Array<Record<string, unknown>>;
        const unitsEditor = (d.unitsEditor || []) as Array<Record<string, unknown>>;
        const hexesEditor = (d.hexesEditor || []) as Array<Record<string, unknown>>;

        const unitById = new Map<number, Record<string, unknown>>();
        for (const u of unitsEditor) {
          const id = Number(u.id);
          if (Number.isFinite(id)) unitById.set(id, u);
        }
        const hexById = new Map<number, Record<string, unknown>>();
        for (const h of hexesEditor) {
          const id = Number(h.id);
          if (Number.isFinite(id)) hexById.set(id, h);
        }

        const nextUnit: ManualRuleEntry[] = [];
        const nextHex: ManualRuleEntry[] = [];
        const chapterBuckets = emptyChapterRuleBuckets();

        for (const r of rulesEditor) {
          const ruleId = Number(r.id);
          if (!Number.isFinite(ruleId)) continue;

          const headRaw = r.chapter ?? r.head ?? '';
          const ref = parseRuleHead(headRaw);
          const description = ruleDescOnly(r);
          const ruleTitle = String(r.title ?? '').trim();
          const imagePath = firstRuleImage(r);
          const imagePath2 = ruleImagePath2(r);
          const imagePath3 = ruleImagePath3(r);

          if (ref?.kind === 'units') {
            const u = unitById.get(ref.entityId);
            const faction = u ? String(u.faction ?? '').trim() : '';
            const ut = u ? String(u.type ?? '').trim() : '';
            const statRows = u ? unitStatRows(u) : [];
            nextUnit.push({
              id: ruleId,
              ruleTitle,
              description,
              imagePath,
              imagePath2,
              imagePath3,
              statRows,
              unitFaction: faction,
              unitType: ut,
            });
            continue;
          }

          if (ref?.kind === 'hexes') {
            const h = hexById.get(ref.entityId);
            const statRows = h ? hexStatRows(h) : [];
            nextHex.push({
              id: ruleId,
              ruleTitle,
              description,
              imagePath,
              imagePath2,
              imagePath3,
              statRows,
            });
            continue;
          }

          const ch = String(headRaw).trim();
          if (ch === 'units' || ch === 'hexes') continue;
          const manualSec = RULE_CHAPTER_TO_MANUAL_SECTION[ch];
          if (manualSec) {
            chapterBuckets[manualSec].push({
              id: ruleId,
              ruleTitle,
              description,
              imagePath,
              imagePath2,
              imagePath3,
              statRows: [],
            });
          }
        }

        setUnitRuleCards(nextUnit);
        setHexRuleCards(nextHex);
        setChapterRulesBySection(chapterBuckets);
      })
      .catch(() => {});
  }, []);

  const filteredUnitRules = unitRuleCards.filter((card) => {
    if (selectedFaction !== 'all' && card.unitFaction !== selectedFaction) return false;
    if (selectedUnitType !== 'all' && card.unitType !== selectedUnitType) return false;
    return true;
  });

  return (
    <div className={styles.manual}>
      <header className={styles.manualHeader}>
        <h1 className={styles.manualName}>Руководство по игре</h1>
      </header>

      <div className={styles.manualLayout}>
        <ManualSidebar onGoMain={() => navigate('/main')} onSelectSection={setSelectedSection} />

        <main className={styles.manualTutorial}>
          {selectedSection === 'units' && (
            <div>
              <div className={styles.sectionTitle}>Юниты</div>
              <div className={styles.filters}>
                <div className={styles.filterGroup}>
                  <div className={styles.filterLabel}>Фракция:</div>
                  <div className={styles.filterButtons}>
                    {factions.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.filterButton} ${selectedFaction === f.id ? styles.active : ''}`}
                        onClick={() => setSelectedFaction(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.filterGroup}>
                  <div className={styles.filterLabel}>Тип:</div>
                  <div className={styles.filterButtons}>
                    {unitTypes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.filterButton} ${selectedUnitType === t.id ? styles.active : ''}`}
                        onClick={() => setSelectedUnitType(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.cardsList}>
                {filteredUnitRules.map((c) => (
                  <ManualRuleCard key={c.id} entry={c} />
                ))}
                {filteredUnitRules.length === 0 && (
                  <div className={styles.noData}>
                    Нет правил с привязкой к юнитам — создайте правило во вкладке «Руководство» и укажите главу{' '}
                    <code>units:id</code> (id созданного юнита).
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedSection === 'hexes' && (
            <ManualCardsSection
              title="Гексы"
              cards={hexRuleCards}
              emptyText={
                <>
                  Нет правил с привязкой к гексам — создайте правило во вкладке «Руководство» и укажите главу{' '}
                  <code>hexes:id</code>.
                </>
              }
            />
          )}

          {selectedSection === 'game_turn' && (
            <ManualCardsSection
              title="Ход игры"
              cards={chapterRulesBySection.game_turn}
              emptyText="Нет записей — в «Редактор объектов» → «Руководство» создайте правило с главой «Ход игры»."
            />
          )}

          {selectedSection === 'general' && (
            <ManualCardsSection title="Общие игровые механики" cards={chapterRulesBySection.general} />
          )}

          {selectedSection === 'orders' && (
            <ManualCardsSection
              title="Приказы"
              cards={chapterRulesBySection.orders}
              emptyText="Нет записей — создайте правило с главой «Приказы»."
            />
          )}

          {selectedSection === 'properties' && (
            <ManualCardsSection
              title="Свойства юнитов"
              cards={chapterRulesBySection.properties}
              emptyText="Нет записей — создайте правило с главой «Свойства»."
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default Manual;

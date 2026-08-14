import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../pages/styleModules/editorUnit.module.css';
import { HEX_ACCURACY_TARGET_TYPES, HEX_ACCURACY_TYPES } from './editorHexTypes';

export type HexAccuracyBonusEntry = {
  id: string;
  unitType: string;
  targetType: string;
  bonus: number;
  melee: boolean;
};

export type HexAccuracyBonusRule = {
  unitType: string;
  targetType: string;
  bonus: number;
  melee: boolean;
};

function newEntryId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeRule(row: unknown): HexAccuracyBonusEntry | null {
  const r = row as { unitType?: unknown; targetType?: unknown; bonus?: unknown; melee?: unknown };
  const unitType = String(r?.unitType ?? '').trim();
  if (!unitType) return null;
  const targetType = String(r?.targetType ?? '').trim();
  const bonus = Number(r?.bonus);
  return {
    id: newEntryId(),
    unitType,
    targetType,
    bonus: Number.isFinite(bonus) ? bonus : 0,
    melee: r?.melee === true,
  };
}

export function buildHexAccuracyEntriesFromExtra(
  rules: unknown,
  acc: Record<string, number> | undefined,
  accMelee: Record<string, boolean> | undefined,
): HexAccuracyBonusEntry[] {
  if (Array.isArray(rules) && rules.length) {
    const out: HexAccuracyBonusEntry[] = [];
    for (let i = 0; i < rules.length; i++) {
      const row = normalizeRule(rules[i]);
      if (row && ((row.bonus !== 0) || row.melee)) out.push(row);
    }
    if (out.length) return out;
  }
  const legacy: HexAccuracyBonusEntry[] = [];
  for (const t of HEX_ACCURACY_TYPES) {
    const bonus = Number(acc?.[t.id]);
    const melee = accMelee?.[t.id] === true;
    if ((Number.isFinite(bonus) && bonus !== 0) || melee) {
      legacy.push({
        id: newEntryId(),
        unitType: t.id,
        targetType: '',
        bonus: Number.isFinite(bonus) ? bonus : 0,
        melee,
      });
    }
  }
  return legacy;
}

export function parseHexAccuracyRulesJson(raw: string | null | undefined): {
  accuracyBonusRules: HexAccuracyBonusRule[];
  accuracyBonusByType: Record<string, number>;
  accuracyBonusMeleeByType: Record<string, boolean>;
} {
  const accuracyBonusRules: HexAccuracyBonusRule[] = [];
  const accuracyBonusByType: Record<string, number> = {};
  const accuracyBonusMeleeByType: Record<string, boolean> = {};
  if (!raw?.trim()) return { accuracyBonusRules, accuracyBonusByType, accuracyBonusMeleeByType };
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return { accuracyBonusRules, accuracyBonusByType, accuracyBonusMeleeByType };
    for (let i = 0; i < arr.length; i++) {
      const row = normalizeRule(arr[i]);
      if (!row) continue;
      accuracyBonusRules.push({
        unitType: row.unitType,
        targetType: row.targetType,
        bonus: row.bonus,
        melee: row.melee,
      });
      if (row.bonus !== 0) accuracyBonusByType[row.unitType] = row.bonus;
      if (row.melee) accuracyBonusMeleeByType[row.unitType] = true;
    }
  } catch {
    /* ignore malformed json */
  }
  return { accuracyBonusRules, accuracyBonusByType, accuracyBonusMeleeByType };
}

type Props = {
  hexKey: string | number;
  rules: unknown;
  acc: Record<string, number>;
  accMelee: Record<string, boolean>;
};

export const HexAccuracyBonusEditor: React.FC<Props> = ({ hexKey, rules, acc, accMelee }) => {
  const [entries, setEntries] = useState<HexAccuracyBonusEntry[]>(() =>
    buildHexAccuracyEntriesFromExtra(rules, acc, accMelee),
  );

  useEffect(() => {
    setEntries(buildHexAccuracyEntriesFromExtra(rules, acc, accMelee));
  }, [hexKey]);

  const rulesJson = useMemo(
    () =>
      JSON.stringify(
        entries.map((e) => ({
          unitType: e.unitType,
          targetType: e.targetType,
          bonus: e.bonus,
          melee: e.melee,
        })),
      ),
    [entries],
  );

  const canAdd = entries.length < 24;

  function addEntry() {
    if (!canAdd) return;
    setEntries((prev) => [
      ...prev,
      { id: newEntryId(), unitType: 'infantry', targetType: '', bonus: 1, melee: false },
    ]);
  }

  function updateEntry(id: string, patch: Partial<Omit<HexAccuracyBonusEntry, 'id'>>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className={styles.hexAccEditor}>
      <input type="hidden" name="hex_accuracy_rules_json" value={rulesJson} readOnly />
      <p className={styles.hexAccHint}>
        Укажите, какой отряд на этом гексе получает бонус к меткости и против какой цели. «Ближний» — тот же бонус в
        ближнем бою на этой клетке.
      </p>
      {entries.length === 0 ? (
        <p className={styles.hexAccEmpty}>Нет правил — добавьте строку.</p>
      ) : (
        <ul className={styles.hexAccList}>
          <li className={styles.hexAccListHeader} aria-hidden="true">
            <span>Отряд (стрелок)</span>
            <span>Бонус</span>
            <span>Ближний</span>
            <span>Против (цель)</span>
            <span />
          </li>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.hexAccListRow}>
              <select
                className={styles.fieldSelect}
                value={entry.unitType}
                onChange={(e) => updateEntry(entry.id, { unitType: e.target.value })}
                aria-label="Отряд (стрелок)"
              >
                {HEX_ACCURACY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className={styles.fieldInput}
                value={entry.bonus}
                onChange={(e) => updateEntry(entry.id, { bonus: Number(e.target.value) || 0 })}
                aria-label="Бонус меткости"
                title="Бонус к меткости"
              />
              <label className={styles.hexAccMeleeCb} title="Бонус также в ближнем бою на этом гексе">
                <input
                  type="checkbox"
                  checked={entry.melee}
                  onChange={(e) => updateEntry(entry.id, { melee: e.target.checked })}
                />
                Ближний
              </label>
              <select
                className={styles.fieldSelect}
                value={entry.targetType}
                onChange={(e) => updateEntry(entry.id, { targetType: e.target.value })}
                aria-label="Против (цель)"
              >
                {HEX_ACCURACY_TARGET_TYPES.map((t) => (
                  <option key={t.id || 'any'} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.hexAccRemoveBtn}
                onClick={() => removeEntry(entry.id)}
                aria-label="Удалить строку"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={styles.hexAccAddBtn} onClick={addEntry} disabled={!canAdd}>
        + Добавить правило
      </button>
    </div>
  );
};

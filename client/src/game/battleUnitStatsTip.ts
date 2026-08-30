
import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { getEffectiveMorDisplay } from './battleHqMorale';
import { terrainDefenseBonusFromCell } from './battleTerrain';

export type UnitStatsTipOptions = {
  /** Приказ юнита в текущем ходе (для бонуса «бой +1 З»). */
  pendingOrderKey?: string | null;
};

export function readUnitStatNumber(unit: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = unit[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function getUnitMinesStock(unit: Record<string, unknown>): number {
  const am = (unit.ammunition as { mine?: unknown } | undefined)?.mine;
  const fromAmmo = Number(am);
  if (Number.isFinite(fromAmmo) && fromAmmo >= 0) return Math.floor(fromAmmo);
  const n = readUnitStatNumber(unit, 'mines');
  return n != null && n >= 0 ? Math.floor(n) : 0;
}

export function getUnitExplosivesStock(unit: Record<string, unknown>): number {
  const am = (unit.ammunition as { explosives?: unknown } | undefined)?.explosives;
  const fromAmmo = Number(am);
  if (Number.isFinite(fromAmmo) && fromAmmo >= 0) return Math.floor(fromAmmo);
  const n = readUnitStatNumber(unit, 'explosives');
  return n != null && n >= 0 ? Math.floor(n) : 0;
}

export function getUnitSmokeShellsStock(unit: Record<string, unknown>): number {
  const n = readUnitStatNumber(unit, 'smokeShells');
  return n != null && n >= 0 ? Math.floor(n) : 0;
}

function desantHalfCombatActive(unit: Record<string, unknown>): boolean {
  const tac = unit.tactical as { desantHalfCombat?: boolean; desantEquipping?: boolean } | undefined;
  return tac?.desantHalfCombat === true || tac?.desantEquipping === true;
}

function readBaseDefense(unit: Record<string, unknown>): number | null {
  return readUnitStatNumber(unit, 'defend', 'def');
}

function formatDefenseLine(base: number, bonuses: number[], desantHalf: boolean): string {
  const parts = [String(base), ...bonuses.filter((b) => b > 0).map(String)];
  let line = parts.join(' + ');
  if (desantHalf) line += ' (×½)';
  return line;
}

function collectDefenseBonusRows(
  unit: Record<string, unknown>,
  unitCell: Cell | null | undefined,
  opts?: UnitStatsTipOptions,
): { key: string; val: string }[] {
  const base = readBaseDefense(unit);
  if (base == null) return [];

  const tac = unit.tactical as
    | {
        desantHalfCombat?: boolean;
        desantEquipping?: boolean;
        inTrench?: boolean;
        defendOrder?: boolean;
        medicalAidReceived?: boolean;
        infantryCover?: boolean;
        trenchDigTurnsLeft?: number;
        sapperJob?: { key?: string; turnsLeft?: number };
      }
    | undefined;

  const rows: { key: string; val: string }[] = [];

  if (Number(tac?.trenchDigTurnsLeft) > 0) {
    rows.push({
      key: 'Защита',
      val: '0 (окапывается)',
    });
    return rows;
  }

  const terrain = unitCell ? terrainDefenseBonusFromCell(unitCell, unit) : 0;
  const orderKey = String(opts?.pendingOrderKey ?? '').trim();
  const moveWar = orderKey === 'moveWar' ? 1 : 0;
  const trenchBonus = tac?.inTrench ? 2 : 0;
  const defendBonus = tac?.defendOrder ? 1 : 0;
  const medicalBonus = tac?.medicalAidReceived ? 1 : 0;
  const coverBonus = tac?.infantryCover ? 1 : 0;
  const defenseBonuses = [terrain, moveWar, trenchBonus, defendBonus, medicalBonus, coverBonus].filter((b) => b > 0);
  const desantHalf = desantHalfCombatActive(unit);

  rows.push({
    key: 'Защита',
    val: formatDefenseLine(base, defenseBonuses, desantHalf),
  });

  return rows;
}

import { unitHasPropKey } from './battleTerrain';

function collectArtilleryStatusRows(unit: Record<string, unknown>): { key: string; val: string }[] {
  if (String(unit.type || '').toLowerCase() !== 'artillery') return [];
  const tac = unit.tactical as { artilleryDeployed?: boolean; artilleryFireSector?: boolean } | undefined;
  const deployed = tac?.artilleryDeployed === true;
  const rows: { key: string; val: string }[] = [
    { key: 'Орудие', val: deployed ? 'Развёрнуто' : 'Свёрнуто' },
  ];
  if (deployed && unitHasPropKey(unit, 'fireSector')) {
    rows.push({
      key: 'Сектор обстрела',
      val: tac?.artilleryFireSector === true ? 'Включён' : 'Задайте направление',
    });
  }
  return rows;
}

export function formatUnitAmmoLine(unit: Record<string, unknown>): string {
  const live = readUnitStatNumber(unit, 'ammoCount');
  if (live != null) {
    const cap = unit.ammoSupply;
    if (typeof cap === 'string' && cap.trim()) {
      const s = cap.trim();
      if (s.includes('/')) {
        const max = s.split('/')[1]?.trim();
        if (max) return `${live}/${max}`;
      } else if (/^\d+$/.test(s)) {
        return `${live}/${s}`;
      }
    }
    return String(live);
  }
  const am = unit.ammunition as { ammo?: unknown } | undefined;
  if (am != null && typeof am.ammo === 'number' && Number.isFinite(am.ammo)) {
    return String(am.ammo);
  }
  const s = unit.ammoSupply;
  if (typeof s === 'string' && s.trim()) return s.trim();
  const a = unit.ammo;
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof a === 'number' && Number.isFinite(a)) return String(a);
  return '—';
}

export function unitStatsRowsForTip(
  unit: Record<string, unknown>,
  cells?: Cell[] | null,
  unitCell?: Cell | null,
  opts?: UnitStatsTipOptions,
): { key: string; val: string }[] {
  const out: { key: string; val: string }[] = [];
  const str = readUnitStatNumber(unit, 'strength', 'str');
  if (str != null) out.push({ key: 'Численность', val: String(str) });

  out.push(...collectArtilleryStatusRows(unit));

  const bdef = readUnitStatNumber(unit, 'baseDefend', 'baseDef');
  if (bdef != null) out.push({ key: 'Базовая защита', val: String(bdef) });

  out.push(...collectDefenseBonusRows(unit, unitCell, opts));

  const tacTip = unit.tactical as {
    inTrench?: boolean;
    defendOrder?: boolean;
    trenchDigTurnsLeft?: number;
    sapperJob?: { key?: string; turnsLeft?: number };
    fireSuppression?: boolean;
    infantryCover?: boolean;
    meleeOpponentInstanceId?: unknown;
  } | undefined;
  if (tacTip?.fireSuppression) {
    out.push({ key: 'Состояние', val: 'Огневое подавление' });
  }
  if (tacTip?.infantryCover) {
    out.push({ key: 'Прикрытие', val: '+1 З / +1 стойкость' });
  }
  const digLeft = Number(tacTip?.trenchDigTurnsLeft);
  if (Number.isFinite(digLeft) && digLeft > 0) {
    out.push({ key: 'Окоп', val: `Копает (${digLeft} ход.)` });
  } else if (tacTip?.inTrench) {
    out.push({
      key: 'Окоп',
      val: tacTip.defendOrder ? 'Занят, оборона (+3 З)' : 'Занят (+2 З)',
    });
  }
  const jobLeft = Number(tacTip?.sapperJob?.turnsLeft);
  if (Number.isFinite(jobLeft) && jobLeft > 0) {
    const jk = String(tacTip?.sapperJob?.key || '');
    const jobLabel =
      jk === 'buildPonton'
        ? 'Переправа'
        : jk === 'cutEj'
          ? 'Снятие ежей'
          : jk === 'demining'
            ? 'Разминирование'
            : jk === 'mining'
              ? 'Минирование'
              : 'Сапёрные работы';
    out.push({ key: jobLabel, val: `Выполняется (${jobLeft} ход.)` });
  }

  const morDisplay = getEffectiveMorDisplay(unit, unitCell, cells);
  if (morDisplay != null) out.push({ key: 'Мораль', val: morDisplay });
  out.push({ key: 'Боезапас', val: formatUnitAmmoLine(unit) });
  const mineStore = getUnitMinesStock(unit);
  if (mineStore > 0) {
    out.push({ key: 'Мины', val: String(mineStore) });
  }
  const expl = readUnitStatNumber(unit, 'explosives');
  if (expl != null && expl > 0) out.push({ key: 'Взрывчатка', val: String(expl) });
  const smoke = readUnitStatNumber(unit, 'smokeShells');
  if (smoke != null && smoke > 0) out.push({ key: 'Дымовые снаряды', val: String(smoke) });
  const fa = unit.fireActions as { range?: number[] } | undefined;
  if (fa?.range && fa.range.length) {
    out.push({ key: 'Дальность (табл.)', val: fa.range.map((x) => String(x)).join(' / ') });
  }
  return out;
}

/** Краткий боевой статус для UI (панель авиации и др.). */
export function formatUnitBattleStatus(unit: Record<string, unknown>): string {
  const str = readUnitStatNumber(unit, 'strength', 'str');
  if (str !== null && str <= 0) return 'Уничтожен';

  const tac = unit.tactical as Record<string, unknown> | undefined;
  const melee = tac?.meleeOpponentInstanceId;
  if (melee != null && melee !== '' && Number.isFinite(Number(melee))) {
    return 'В ближнем бою';
  }
  if (tac?.fireSuppression === true) {
    return 'Огневое подавление';
  }
  if (tac?.desantEquipping === true || tac?.desantEquipScheduled === true) {
    return 'Снаряжение после десантирования';
  }
  const desantMoveLeft = Number(tac?.desantOnlyBattleMoveTurnsLeft);
  if (Number.isFinite(desantMoveLeft) && desantMoveLeft > 0) {
    return 'Только боевое положение (высадка на воду/болото)';
  }
  const emb = tac?.embarkedTransportInstanceId;
  if (emb != null && emb !== '' && Number.isFinite(Number(emb))) {
    return 'В транспорте';
  }

  if (Number(tac?.trenchDigTurnsLeft) > 0) {
    return 'Окапывается';
  }
  const sapperLeft = Number((tac as { sapperJob?: { turnsLeft?: number; key?: string } } | undefined)?.sapperJob?.turnsLeft);
  if (Number.isFinite(sapperLeft) && sapperLeft > 0) {
    const jk = String((tac as { sapperJob?: { key?: string } }).sapperJob?.key || '');
    if (jk === 'buildPonton') return 'Наводит переправу';
    if (jk === 'cutEj') return 'Снимает противотанковые заграждения';
    if (jk === 'demining') return 'Разминирует';
    if (jk === 'mining') return 'Минирует';
    return 'Сапёрные работы';
  }
  if (tac?.inTrench === true) {
    return 'В окопе';
  }

  const ty = String(unit.type || '').toLowerCase();
  if (ty === 'artillery') {
    const dep = (tac as { artilleryDeployed?: boolean } | undefined)?.artilleryDeployed;
    if (dep === true) return 'Орудие развёрнуто';
    return 'Орудие свёрнуто';
  }
  if (ty === 'lightair' || ty === 'heavyair') {
    return 'На позиции вылета';
  }

  return 'В строю';
}

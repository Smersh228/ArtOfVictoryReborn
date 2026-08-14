import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { effectiveElevationLevel } from './cellElevation';

type HexExtra = Record<string, unknown>;

function hexExtraObj(cell: Cell | null | undefined): HexExtra | null {
  const ex = (cell as unknown as { hexExtra?: unknown })?.hexExtra;
  return ex && typeof ex === 'object' ? (ex as HexExtra) : null;
}

export function unitHasPropKey(u: { properties?: unknown } | null | undefined, key: string): boolean {
  const props = u?.properties;
  if (!Array.isArray(props)) return false;
  const want = String(key).trim();
  if (!want) return false;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p && typeof p === 'object' && String((p as { prop_key?: string }).prop_key ?? '').trim() === want) {
      return true;
    }
  }
  return false;
}

export function usesTechMoveCost(type: string): boolean {
  const t = String(type || '');
  return [
    'tech',
    'armor',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'lightAir',
    'heavyAir',
  ].includes(t);
}

function readBaseTerrainEntryCost(cell: Cell, unit: { type?: unknown }): number {
  const ex = hexExtraObj(cell);
  const byType = (ex && ex.moveCostByType) || (cell as unknown as { moveCostByType?: Record<string, number> }).moveCostByType;
  const ut = String(unit?.type ?? '');
  if (byType && typeof byType === 'object' && byType[ut] != null) {
    const n = Number(byType[ut]);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  const mcInf = (cell as unknown as { moveCostInf?: number }).moveCostInf ?? cell.moveCost ?? 1;
  const mcTech = (cell as unknown as { moveCostTech?: number }).moveCostTech ?? cell.moveCost ?? 1;
  if (usesTechMoveCost(ut)) return mcTech;
  return mcInf;
}

function terrainPropBypassEntryCost(
  cell: Cell,
  unit: { properties?: unknown } | null | undefined,
): number | null {
  if (!cell || !unit) return null;
  const ex = hexExtraObj(cell);
  if (!ex) return null;
  if (ex.moveWithSwampProp === true && unitHasPropKey(unit, 'movementThroughTheSwamp')) return 1;
  if (ex.moveWithRiverProp === true && unitHasPropKey(unit, 'crossingAWaterObstacle')) return 1;
  return null;
}

export { effectiveElevationLevel };

export function isHill(cell: Cell | null | undefined): boolean {
  return effectiveElevationLevel(cell) >= 1;
}

export function isRavine(cell: Cell | null | undefined): boolean {
  return effectiveElevationLevel(cell) === -1;
}

export function unitCannotCrossRavine(unit: { type?: unknown } | null | undefined): boolean {
  const t = String(unit?.type ?? '');
  return t === 'tech' || t === 'armor' || t === 'lightTank' || t === 'mediumTank' || t === 'heavyTank';
}

export function isInfantryUnitType(unit: { type?: unknown } | null | undefined): boolean {
  return String(unit?.type ?? '').toLowerCase() === 'infantry';
}

function slopeCategoryByAbsDiff(absDiff: number): 'flat' | 'gentle' | 'steep' | 'vertical' {
  if (absDiff <= 0) return 'flat';
  if (absDiff === 1) return 'gentle';
  if (absDiff === 2) return 'steep';
  return 'vertical';
}

export function slopeTransition(fromCell: Cell, toCell: Cell) {
  const fromE = effectiveElevationLevel(fromCell);
  const toE = effectiveElevationLevel(toCell);
  const diff = toE - fromE;
  const absDiff = Math.abs(diff);
  const category = slopeCategoryByAbsDiff(absDiff);
  let direction: 'flat' | 'up' | 'down' = 'flat';
  if (diff > 0) direction = 'up';
  else if (diff < 0) direction = 'down';
  return { category, direction, absDiff };
}

export function isRavineExitDirection(fromCell: Cell, toCell: Cell): boolean {
  if (!isRavine(fromCell)) return true;
  if (isRavine(toCell)) return true;
  if (effectiveElevationLevel(toCell) === 0) return true;
  return false;
}

export type MoveSlopeCounters = { ravineHexes: number; gentleUp: number; steep: number; vertical: number };

export function createMoveSlopeCounters(): MoveSlopeCounters {
  return { ravineHexes: 0, gentleUp: 0, steep: 0, vertical: 0 };
}

export function canUnitTraverseSlope(
  unit: { type?: unknown; properties?: unknown },
  transition: ReturnType<typeof slopeTransition>,
): boolean {
  const { category } = transition;
  if (category === 'flat' || category === 'gentle') return true;
  if (category === 'steep') return isInfantryUnitType(unit);
  if (category === 'vertical') return unitHasPropKey(unit, 'mountainTroops');
  return false;
}

export function slopeCountersAllow(
  unit: { type?: unknown; properties?: unknown },
  counters: MoveSlopeCounters,
  fromCell: Cell,
  toCell: Cell,
): boolean {
  const tr = slopeTransition(fromCell, toCell);
  if (!canUnitTraverseSlope(unit, tr)) return false;
  if (tr.category === 'gentle' && tr.direction === 'up' && counters.gentleUp >= 1) return false;
  if (tr.category === 'steep' && counters.steep >= 1) return false;
  if (tr.category === 'vertical' && counters.vertical >= 1) return false;
  return true;
}

export function ravineCountersAllow(
  unit: { type?: unknown },
  counters: MoveSlopeCounters,
  fromCell: Cell,
  toCell: Cell,
): boolean {
  if (unitCannotCrossRavine(unit)) {
    if (isRavine(toCell) || isRavine(fromCell)) return false;
  }
  if (isRavine(toCell)) {
    const nextRavine = isRavine(fromCell) ? counters.ravineHexes : counters.ravineHexes + 1;
    if (nextRavine > 1) return false;
  }
  return true;
}

export function applyMoveSlopeCounters(
  counters: MoveSlopeCounters,
  fromCell: Cell,
  toCell: Cell,
): MoveSlopeCounters {
  const next = { ...counters };
  const tr = slopeTransition(fromCell, toCell);
  if (tr.category === 'gentle' && tr.direction === 'up') next.gentleUp += 1;
  if (tr.category === 'steep') next.steep += 1;
  if (tr.category === 'vertical') next.vertical += 1;
  if (isRavine(toCell) && !isRavine(fromCell)) next.ravineHexes += 1;
  return next;
}

export function moveCountersKey(c: MoveSlopeCounters): string {
  return `${c.ravineHexes}:${c.gentleUp}:${c.steep}:${c.vertical}`;
}

export function extendRangeArrayForHill(rangeArray: number[]): number[] {
  if (!rangeArray.length) return rangeArray;
  return [rangeArray[0], ...rangeArray];
}

export function rangeArrayForShooterOnCell(baseRangeArray: number[], shooterCell: Cell | null | undefined): number[] {
  const ra = baseRangeArray.length ? baseRangeArray.slice() : [3, 2, 1];
  if (shooterCell && isHill(shooterCell)) return extendRangeArrayForHill(ra);
  return ra;
}

export function elevationLoSBonusSteps(observer: Cell, target: Cell): number {
  const obsE = effectiveElevationLevel(observer);
  const tgtE = effectiveElevationLevel(target);
  if (obsE <= tgtE) return 0;
  const diff = obsE - tgtE;
  if (diff >= 2) return 2;
  if (diff >= 1) return 1;
  return 0;
}

export function readHqZoneRadiusWithHill(
  unit: { properties?: unknown } | null | undefined,
  hqCell: Cell | null | undefined,
): number {
  let r = 0;
  if (unitHasPropKey(unit, 'hqZoneOfAction3')) r = 3;
  else if (unitHasPropKey(unit, 'hqZoneOfAction2')) r = 2;
  if (r > 0 && hqCell && isHill(hqCell)) r += 1;
  return r;
}

/** Стоимость входа на гекс (как на сервере, с учётом свойств юнита). */
export function terrainEntryCost(cell: Cell, unit: { type?: unknown; properties?: unknown }): number {
  if (isRavine(cell) && unitCannotCrossRavine(unit)) return 0;
  const base = readBaseTerrainEntryCost(cell, unit);
  if (base > 0) return base;
  const bypass = terrainPropBypassEntryCost(cell, unit);
  return bypass != null ? bypass : 0;
}

export function normalizeUnitTypeForHexExtra(unitType: unknown): string {
  const lower = String(unitType ?? '')
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    lighttank: 'lightTank',
    mediumtank: 'mediumTank',
    heavytank: 'heavyTank',
    lightair: 'lightAir',
    heavyair: 'heavyAir',
  };
  if (map[lower]) return map[lower];
  if (lower === 'infantry') return 'infantry';
  if (lower === 'artillery') return 'artillery';
  if (lower === 'tech') return 'tech';
  if (lower === 'armor') return 'armor';
  return String(unitType ?? '').trim();
}

function readAccuracyBonusForUnitType(ex: HexExtra, unitType: unknown): number {
  const byType = ex?.accuracyBonusByType;
  if (!byType || typeof byType !== 'object') return 0;
  const key = normalizeUnitTypeForHexExtra(unitType);
  const n = Number((byType as Record<string, unknown>)[key]);
  return Number.isFinite(n) ? n : 0;
}

function ruleTargetMatches(ruleTargetType: unknown, targetUnit: Record<string, unknown> | null | undefined): boolean {
  const wanted = String(ruleTargetType ?? '').trim();
  if (!wanted || wanted === '*') return true;
  if (!targetUnit) return wanted === 'build';
  return normalizeUnitTypeForHexExtra(targetUnit.type) === wanted;
}

function pickAccuracyBonusFromRules(
  rules: unknown[],
  shooterUnit: Record<string, unknown>,
  targetUnit: Record<string, unknown> | null | undefined,
  forMelee: boolean,
): number {
  const shooterKey = normalizeUnitTypeForHexExtra(shooterUnit?.type);
  let anyRule: { bonus: unknown; targetType?: unknown } | null = null;
  let specificRule: { bonus: unknown; targetType?: unknown } | null = null;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || typeof rule !== 'object') continue;
    const r = rule as { unitType?: unknown; targetType?: unknown; bonus?: unknown; melee?: unknown };
    if (normalizeUnitTypeForHexExtra(r.unitType) !== shooterKey) continue;
    if (forMelee && r.melee !== true) continue;
    if (!ruleTargetMatches(r.targetType, targetUnit ?? undefined)) continue;
    const bonus = Number(r.bonus);
    if (!Number.isFinite(bonus) || bonus === 0) continue;
    const isSpecific = Boolean(String(r.targetType ?? '').trim());
    if (isSpecific) {
      if (!specificRule || Math.abs(bonus) > Math.abs(Number(specificRule.bonus))) specificRule = r;
    } else if (!anyRule) {
      anyRule = r;
    }
  }
  const picked = specificRule || anyRule;
  return picked ? Number(picked.bonus) : 0;
}

/** Бонус меткости с гекса стрелка; forMelee — только если включён «ближний бой» в правиле. */
export function terrainAccuracyBonusFromCell(
  shooterCell: Cell | null | undefined,
  shooterUnit: Record<string, unknown> | null | undefined,
  targetUnit: Record<string, unknown> | null | undefined,
  forMelee: boolean,
): number {
  if (!shooterCell || !shooterUnit) return 0;
  const ex = hexExtraObj(shooterCell);
  if (!ex) return 0;
  const rules = ex.accuracyBonusRules;
  if (Array.isArray(rules) && rules.length) {
    return pickAccuracyBonusFromRules(rules, shooterUnit, targetUnit, forMelee);
  }
  const bonus = readAccuracyBonusForUnitType(ex, shooterUnit?.type);
  if (bonus === 0) return 0;
  if (forMelee) {
    const meleeFlags = ex.accuracyBonusMeleeByType;
    if (!meleeFlags || typeof meleeFlags !== 'object') return 0;
    const key = normalizeUnitTypeForHexExtra(shooterUnit?.type);
    if ((meleeFlags as Record<string, unknown>)[key] !== true) return 0;
  }
  return bonus;
}

/** Бонус защиты с гекса (как на сервере). */
export function terrainDefenseBonusFromCell(
  targetCell: Cell | null | undefined,
  targetUnit: { type?: unknown } | null | undefined,
): number {
  if (!targetCell || !targetUnit) return 0;
  const ex = hexExtraObj(targetCell);
  const cellAny = targetCell as unknown as {
    defBonusByType?: Record<string, number>;
    defBonusInf?: number;
    defBonusTech?: number;
    baseDefend?: { infantry?: number; technics?: number };
  };
  const byType = (ex && ex.defBonusByType) || cellAny.defBonusByType;
  const ut = String(targetUnit?.type ?? '');
  if (byType && typeof byType === 'object' && byType[ut] != null) {
    return Math.max(0, Number(byType[ut]) || 0);
  }
  const usesTech = usesTechMoveCost(ut);
  let bi = Math.max(0, Number(cellAny.defBonusInf) || 0);
  let bt = Math.max(0, Number(cellAny.defBonusTech) || 0);
  if (bi === 0 && bt === 0 && cellAny.baseDefend != null && typeof cellAny.baseDefend === 'object') {
    bi = Math.max(0, Number(cellAny.baseDefend.infantry) || 0);
    bt = Math.max(0, Number(cellAny.baseDefend.technics) || 0);
  }
  return usesTech ? bt : bi;
}

export function hillMeleeDefenseBonus(defenderCell: Cell | null | undefined): number {
  return defenderCell && isHill(defenderCell) ? 1 : 0;
}

export function terrainDefenseLabel(cell: Cell | null | undefined): string {
  if (!cell) return 'местность';
  const ex = hexExtraObj(cell);
  const fromExtra = ex?.name ?? ex?.title ?? ex?.label;
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  const t = String((cell as unknown as { type?: string }).type ?? '').trim();
  return t || 'местность';
}

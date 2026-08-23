import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { findReachableCells, findBattleUnitByInstanceId, findUnitCellByInstanceId, type BattleMovePreviewUnit } from './battleMovePreview';
import { rangeArrayForShooterOnCell, terrainAccuracyBonusFromCell } from './battleTerrain';
import { isCellVisibleToAnyFriendly } from './battleFireAdjustment';
import { isHexVisible } from './hexVisibility';
import {
  canDesantHalfCombatShootTarget,
  effectiveFireDistanceForAccuracy,
  isArmoredVehicleTarget,
  isFireDistanceOutOfRange,
} from './battleDesantCombat';
import { isInfantryUnitType } from './battleTerrain';
import { isCellInArtillerySector, getArtillerySectorCellIdSet } from './battleDefendSector';
import {
  computeDotFireHighlights,
  dotIntensityForTarget,
  dotRangeArrayForUnit,
  isDotFireShooter,
  unitFiresFromDot,
} from './cellDot';

export { isArmoredVehicleTarget } from './battleDesantCombat';

export function targetTypeToFireKey(t: unknown): string {
  const x = String(t || '').toLowerCase();
  const m: Record<string, string> = {
    infantry: 'inf',
    artillery: 'art',
    tech: 'tech',
    armor: 'armor',
    lighttank: 'lt',
    mediumtank: 'mt',
    heavytank: 'ht',
    lightair: 'sa',
    heavyair: 'ba',
  };
  return m[x] || 'inf';
}

function getIntensityDiceForTarget(
  attacker: Record<string, unknown>,
  target: Record<string, unknown>,
): number {
  const dotInt = dotIntensityForTarget(attacker, target.type);
  if (dotInt != null) return dotInt;
  const ft = normalizeFireObject(rawFireFromUnit(attacker));
  const key = targetTypeToFireKey(target.type);
  const arr = ft[key as keyof typeof ft]?.length ? ft[key as keyof typeof ft] : ft.inf;
  const ia = arr && arr.length ? arr : [1, 2, 2, 3];
  const strength = Math.max(1, getStr(attacker));
  const len = ia.length;
  if (!len) return 1;
  const descending = Number(ia[0]) > Number(ia[len - 1]);
  if (strength > len) {
    return descending ? Number(ia[0]) || 1 : Number(ia[len - 1]) || 1;
  }
  if (descending) return Number(ia[len - strength]) || 1;
  return Number(ia[strength - 1]) || 1;
}

function isFireRowMeleeOnlyForTarget(
  attacker: Record<string, unknown>,
  target: Record<string, unknown>,
): boolean {
  const key = targetTypeToFireKey(target.type);
  const opts = attacker.fireRowOptions as Record<string, { melee?: boolean } | undefined> | undefined;
  return Boolean(opts?.[key]?.melee);
}

function isMeleeLinkedOpponent(
  attacker: Record<string, unknown>,
  target: Record<string, unknown>,
): boolean {
  const meleeId = Number(
    (attacker.tactical as { meleeOpponentInstanceId?: unknown } | undefined)?.meleeOpponentInstanceId,
  );
  const tid = Number(target.instanceId);
  return Number.isFinite(meleeId) && Number.isFinite(tid) && meleeId === tid;
}

/** Можно ли назначить дальний огонь по цели (меткость, IO, тип, ближний оппонент). */
export function canRangedFireAtTarget(
  attacker: Record<string, unknown>,
  attackerCell: Cell,
  target: Record<string, unknown>,
  distanceHex: number,
  orderKey: 'fire' | 'fireHard' | 'attack',
): boolean {
  if (orderKey !== 'fire' && orderKey !== 'fireHard') return true;
  if (isInfantryUnitType(attacker) && isArmoredVehicleTarget(target)) return false;
  if (isFireRowMeleeOnlyForTarget(attacker, target)) return false;
  if (getIntensityDiceForTarget(attacker, target) <= 0) return false;
  if (isMeleeLinkedOpponent(attacker, target)) {
    if (!canDesantHalfCombatShootTarget(attacker, target, distanceHex)) return false;
  }
  const ra = rangeArrayForUnitAtCell(attacker, attackerCell);
  const rMode = fireRangeTableMode(ra);
  if (isFireDistanceOutOfRange(ra, rMode, distanceHex, attacker, target)) return false;
  return effectiveShootingAccuracy(attacker, attackerCell, target, distanceHex, false) > 0;
}

function collectOpposingUnitsForFire(
  cells: Cell[],
  attackerUnit: Record<string, unknown>,
): Array<{ unit: Record<string, unknown>; cell: Cell }> {
  const af = String(attackerUnit.faction ?? '');
  const attackerId = Number(attackerUnit.instanceId);
  const out: Array<{ unit: Record<string, unknown>; cell: Cell }> = [];
  const visit = (raw: Record<string, unknown>, cell: Cell) => {
    const tid = Number(raw.instanceId);
    if (Number.isFinite(attackerId) && tid === attackerId) return;
    if (getStr(raw) <= 0) return;
    if (!factionsOpposedOnMap(af, String(raw.faction ?? ''))) return;
    out.push({ unit: raw, cell });
    const tac = raw.tactical as { carriedUnits?: unknown[] } | undefined;
    const carried = tac?.carriedUnits;
    if (Array.isArray(carried)) {
      for (const cu of carried) {
        if (cu && typeof cu === 'object') visit(cu as Record<string, unknown>, cell);
      }
    }
  };
  for (const cell of cells) {
    for (const u of cell.units || []) {
      visit(u as unknown as Record<string, unknown>, cell);
    }
  }
  return out;
}

function normFaction(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}


export function factionsOpposedOnMap(fa: string, fb: string): boolean {
  const a = normFaction(fa);
  const b = normFaction(fb);
  const sov = a === 'ussr' || a === 'rkka';
  const axis = a === 'germany' || a === 'wehrmacht';
  const sovB = b === 'ussr' || b === 'rkka';
  const axisB = b === 'germany' || b === 'wehrmacht';
  return (sov && axisB) || (axis && sovB);
}

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

function normalizeFireObject(f: unknown) {
  const src = f && typeof f === 'object' ? (f as unknown as Record<string, unknown>) : {};
  const g = (k: string, fb: string) => {
    const raw = src[k];
    const primary = raw != null && raw !== '' ? raw : fb;
    let nums = splitNums(primary);
    if (!nums.length) nums = splitNums(fb);
    return nums;
  };
  return {
    range: g('range', '3,2,1'),
    inf: g('inf', '1,2,2,3'),
    art: g('art', '1,1,2,2'),
    tech: g('tech', '1,1,2,2'),
    armor: g('armor', '1,1,2,2'),
    lt: g('lt', '1,1,2,2'),
    mt: g('mt', '1,1,2,2'),
    ht: g('ht', '1,1,2,2'),
    sa: g('sa', '1,1,2'),
    ba: g('ba', '1,1,2'),
    build: g('build', '0,0,1'),
  };
}

function rawFireFromUnit(u: Record<string, unknown>): Record<string, unknown> | null {
  const fp = u.fireParsed;
  if (fp && typeof fp === 'object') return fp as unknown as Record<string, unknown>;
  const fire = u.fire;
  if (fire && typeof fire === 'object') return fire as unknown as Record<string, unknown>;
  return null;
}

export function rangeArrayForUnit(attacker: Record<string, unknown>): number[] {
  const dotRa = dotRangeArrayForUnit(attacker);
  if (dotRa) return dotRa;
  const ft = normalizeFireObject(rawFireFromUnit(attacker));
  return ft.range && ft.range.length ? ft.range : [3, 2, 1];
}

export function rangeArrayForUnitAtCell(
  attacker: Record<string, unknown>,
  shooterCell: Cell | null | undefined,
): number[] {
  return rangeArrayForShooterOnCell(rangeArrayForUnit(attacker), shooterCell ?? undefined);
}


export function fireRangeTableMode(rangeArray: number[]): 'ranged' | 'direct' {
  return rangeArray.length >= 2 ? 'ranged' : 'direct';
}


export function getAccuracyAtShootingDistance(rangeArray: number[], distanceHex: number): number {
  const mode = fireRangeTableMode(rangeArray);
  const d = Number(distanceHex);
  if (!Number.isFinite(d)) return 0;
  if (mode === 'ranged') {
    if (d < 1 || d >= rangeArray.length) return 0;
    const v = Number(rangeArray[d]);
    return Number.isFinite(v) ? v : 0;
  }
  const index = d - 1;
  if (index >= 0 && index < rangeArray.length) {
    const v = Number(rangeArray[index]);
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

/** Меткость с учётом бонуса местности на гексе стрелка и типа цели (как на сервере). */
export function effectiveShootingAccuracy(
  attacker: Record<string, unknown>,
  attackerCell: Cell,
  target: Record<string, unknown> | null | undefined,
  distanceHex: number,
  forMelee = false,
): number {
  const ra = rangeArrayForUnitAtCell(attacker, attackerCell);
  const effD = effectiveFireDistanceForAccuracy(attacker, target, distanceHex);
  const base = getAccuracyAtShootingDistance(ra, effD);
  const bonus = terrainAccuracyBonusFromCell(attackerCell, attacker, target ?? undefined, forMelee);
  return base + Math.max(0, bonus);
}

function cellHasShootableHostileAtDistance(
  attacker: Record<string, unknown>,
  attackerCell: Cell,
  cell: Cell,
  distanceHex: number,
  forMelee: boolean,
): boolean {
  const af = String(attacker.faction ?? '');
  for (const u of cell.units || []) {
    const raw = u as unknown as Record<string, unknown>;
    if (getStr(raw) <= 0) continue;
    if (!factionsOpposedOnMap(af, String(raw.faction ?? ''))) continue;
    if (effectiveShootingAccuracy(attacker, attackerCell, raw, distanceHex, forMelee) > 0) return true;
  }
  if (!forMelee && effectiveShootingAccuracy(attacker, attackerCell, null, distanceHex, false) > 0) {
    return true;
  }
  return false;
}


export function maxShootRangeStepsForUnit(
  attacker: Record<string, unknown>,
  shooterCell?: Cell | null,
): number {
  const ra = shooterCell
    ? rangeArrayForUnitAtCell(attacker, shooterCell)
    : rangeArrayForUnit(attacker);
  return fireRangeTableMode(ra) === 'ranged' ? Math.max(0, ra.length - 1) : ra.length;
}

/** Совпадает с сервером: авиация на карте не ограничена дальностью линии полёта таблицами огня/разведки. */
const AIR_MISSION_UNLIMITED_HEX_STEPS = 99999999;

/** Дальность линии полёта для «Авиационной разведки» по таблице intelligenceAirRange (как строка дальности огня). */
export function maxIntelligenceAirFlightHexStepsForUnit(attacker: Record<string, unknown>): number {
  const raw = attacker.intelligenceAirRange ?? attacker.intelligence_air_range;
  let nums: number[] = [];
  if (raw != null && String(raw).trim() !== '') {
    nums = String(raw)
      .split(',')
      .map((x) => Number(String(x).trim()))
      .filter((n) => Number.isFinite(n));
  }
  const ra = nums.length ? nums : rangeArrayForUnit(attacker);
  return fireRangeTableMode(ra) === 'ranged' ? Math.max(0, ra.length - 1) : ra.length;
}

/** Макс. дистанция гексов для авиазадания с выбором клетки (разведка + прочие авиаприказы). */
export function maxAirMissionHexStepsForUnit(attacker: Record<string, unknown>): number {
  const ty = String(attacker.type ?? '').trim();
  if (ty === 'lightAir' || ty === 'heavyAir') return AIR_MISSION_UNLIMITED_HEX_STEPS;
  const ia = maxIntelligenceAirFlightHexStepsForUnit(attacker);
  const sh = maxShootRangeStepsForUnit(attacker);
  return Math.max(ia, sh, 3);
}

export function battleUnitHasPropKey(u: Record<string, unknown>, propKey: string): boolean {
  const props = u.properties;
  if (!Array.isArray(props)) return false;
  const want = String(propKey).trim();
  if (!want) return false;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p && typeof p === 'object' && String((p as { prop_key?: string }).prop_key ?? '').trim() === want) {
      return true;
    }
  }
  return false;
}


export function findAreaFireReachableCellIds(
  attackerCell: Cell,
  cells: Cell[],
  maxDistance: number,
  fogRevealedCellIds: Set<number> | null | undefined,
  applyFogFilter: boolean,
): Set<number> {
  const out = new Set<number>();
  if (maxDistance < 1) return out;
  for (const cell of cells) {
    if (cell.id === attackerCell.id) continue;
    const d = hexDistCells(attackerCell, cell);
    if (d < 1 || d > maxDistance) continue;
    if (applyFogFilter && fogRevealedCellIds && !fogRevealedCellIds.has(cell.id)) continue;
    out.add(cell.id);
  }
  return out;
}

export function hexDistCells(a: Cell, b: Cell): number {
  return Math.max(
    Math.abs(a.coor.x - b.coor.x),
    Math.abs(a.coor.y - b.coor.y),
    Math.abs(a.coor.z - b.coor.z),
  );
}

function getStr(u: Record<string, unknown>): number {
  const n = Number(u.str ?? u.strength);
  return Number.isFinite(n) ? n : 1;
}

function getMoveCapClient(u: Record<string, unknown>): number {
  const n = Number(u.mov ?? u.moveCap ?? 4);
  return Number.isFinite(n) && n > 0 ? n : 4;
}


function attackReachBudgetClient(u: Record<string, unknown>): number {
  return Math.max(0, getMoveCapClient(u) - 1);
}


export function findHostileUnitsInShootingRange(
  attackerUnit: Record<string, unknown>,
  attackerCell: Cell,
  cells: Cell[],
  orderKey: 'fire' | 'fireHard' | 'attack',
  fogRevealedCellIds?: FogVisibleCellIds,
): Set<number> {
  const attackerId = Number(attackerUnit.instanceId);
  const af = String(attackerUnit.faction ?? '');
  const out = new Set<number>();
  const ra = rangeArrayForUnitAtCell(attackerUnit, attackerCell);
  const maxD =
    orderKey === 'attack' ? 999 : ra.length >= 2 ? ra.length - 1 : ra.length;

  const profile: BattleMovePreviewUnit = {
    type: String(attackerUnit.type ?? 'infantry'),
    faction: String(attackerUnit.faction ?? ''),
  };
  const attackBudget = orderKey === 'attack' ? attackReachBudgetClient(attackerUnit) : 0;
  const fogSet =
    fogRevealedCellIds == null
      ? null
      : Array.isArray(fogRevealedCellIds)
        ? new Set(fogRevealedCellIds)
        : fogRevealedCellIds;
  const reachIds =
    orderKey === 'attack'
      ? new Set(
          findReachableCells(attackerCell, attackBudget, cells, profile, fogSet).map(
            (c) => c.id,
          ),
        )
      : null;

  for (const { unit: raw, cell } of collectOpposingUnitsForFire(cells, attackerUnit)) {
    const tid = Number(raw.instanceId);
    if (!Number.isFinite(tid)) continue;
    const d = hexDistCells(attackerCell, cell);
    if (orderKey === 'attack') {
      if (d > maxD) continue;
    }
    if (orderKey === 'fire' || orderKey === 'fireHard') {
      if (!canRangedFireAtTarget(attackerUnit, attackerCell, raw, d, orderKey)) continue;
    } else if (isFireDistanceOutOfRange(ra, fireRangeTableMode(ra), d, attackerUnit, raw)) {
      continue;
    }
    if (orderKey === 'attack') {
      const us = cell.units || [];
      let opposingOnHex = 0;
      for (const u of us) {
        const r = u as unknown as Record<string, unknown>;
        if (getStr(r) <= 0) continue;
        if (factionsOpposedOnMap(af, String(r.faction ?? ''))) opposingOnHex++;
      }
      if (opposingOnHex !== 1) continue;
      const adjacentToEnemy =
        hexDistCells(attackerCell, cell) <= 1 ||
        cells.some((c) => hexDistCells(cell, c) === 1 && reachIds!.has(c.id));
      if (!adjacentToEnemy) continue;
    }
    out.add(tid);
  }
  return out;
}


export function countLivingOnBattleCell(cell: Cell): number {
  let n = 0;
  for (const raw of cell.units || []) {
    if (getStr(raw as unknown as Record<string, unknown>) > 0) n++;
  }
  return n;
}

export type BattleFireHighlights = {
  instanceIds: Set<number>;
  areaCellIds: Set<number> | null;
};

type FogVisibleCellIds = Set<number> | number[] | null;

export type BattleFireHighlightOptions = {
  useFireAdjustment?: boolean;
  viewerFaction?: string;
};

function losAllowsShot(
  attackerCell: Cell,
  targetCell: Cell,
  cells: Cell[],
  concealedTargetOk: boolean,
  options: BattleFireHighlightOptions | undefined,
  orderKey: 'fire' | 'fireHard' | 'attack',
  isArt: boolean,
): boolean {
  if (isHexVisible(attackerCell, targetCell, cells)) return true;
  if (concealedTargetOk) return true;
  if (
    options?.useFireAdjustment &&
    orderKey === 'fire' &&
    isArt &&
    options.viewerFaction &&
    isCellVisibleToAnyFriendly(cells, options.viewerFaction, targetCell)
  ) {
    return true;
  }
  return false;
}

function fogHas(fogRevealedCellIds: FogVisibleCellIds, cellId: number): boolean {
  if (fogRevealedCellIds == null) return true;
  if (Array.isArray(fogRevealedCellIds)) return fogRevealedCellIds.includes(cellId);
  return fogRevealedCellIds.has(cellId);
}

export function explainNoFireTargets(
  attackerUnit: Record<string, unknown>,
  attackerCell: Cell,
  cells: Cell[],
  orderKey: 'fire' | 'fireHard',
  fogRevealedCellIds: FogVisibleCellIds,
): string {
  const concealedTargetOk = battleUnitHasPropKey(attackerUnit, 'concealedTargetFire');
  const isInfantry = isInfantryUnitType(attackerUnit);
  const isArt = String(attackerUnit.type || '').toLowerCase() === 'artillery';

  let hostile = 0;
  let fireAllowed = 0;
  let fogAllowed = 0;
  let losAllowed = 0;
  let artAllowed = 0;

  for (const { unit: raw, cell } of collectOpposingUnitsForFire(cells, attackerUnit)) {
    hostile++;
    const d = hexDistCells(attackerCell, cell);
    if (!canRangedFireAtTarget(attackerUnit, attackerCell, raw, d, orderKey)) continue;
    fireAllowed++;

    if (!fogHas(fogRevealedCellIds, cell.id) && !concealedTargetOk) continue;
    fogAllowed++;

    const losOk = isHexVisible(attackerCell, cell, cells);
    if (!losOk && !concealedTargetOk) continue;
    losAllowed++;

    if (isArt && !unitFiresFromDot(attackerUnit)) {
      const tac = attackerUnit.tactical as { artilleryDeployed?: boolean } | undefined;
      if (tac?.artilleryDeployed !== true) continue;
      if (!isCellInArtillerySector(attackerUnit, attackerCell, cells, cell.id)) continue;
    }
    artAllowed++;
  }

  if (hostile === 0) return 'Рядом нет живых вражеских юнитов.';
  if (fireAllowed === 0) {
    if (isInfantry) return 'Нет доступных целей (дистанция, меткость, тип цели или ближний бой).';
    return 'Вражеские юниты вне дальности огня или меткость 0.';
  }
  if (fogAllowed === 0) return 'Цели скрыты туманом войны.';
  if (losAllowed === 0)
    return concealedTargetOk
      ? 'Цели недоступны для выбора в текущем положении.'
      : 'Нет прямой видимости на цель.';
  if (isArt && !unitFiresFromDot(attackerUnit) && artAllowed === 0) {
    return 'Для артиллерии требуется развёртывание и цель в секторе обстрела.';
  }
  return orderKey === 'fireHard'
    ? 'Нет доступных целей для огня на подавление.'
    : 'Нет доступных целей для огня.';
}


export function computeBattleFireHighlights(
  attackerUnit: Record<string, unknown>,
  attackerCell: Cell,
  cells: Cell[],
  orderKey: 'fire' | 'fireHard' | 'attack',
  fogRevealedCellIds: FogVisibleCellIds,
  options?: BattleFireHighlightOptions,
): BattleFireHighlights {
  if (orderKey === 'attack') {
    const raw = findHostileUnitsInShootingRange(
      attackerUnit,
      attackerCell,
      cells,
      orderKey,
      fogRevealedCellIds,
    );
    const filtered = new Set<number>();
    const isArt = String(attackerUnit.type || '').toLowerCase() === 'artillery';
    const artTac0 = attackerUnit.tactical as { artilleryDeployed?: boolean } | undefined;
    if (isArt && artTac0?.artilleryDeployed === true) {
      return { instanceIds: filtered, areaCellIds: null };
    }
    for (const tid of raw) {
      const live = findUnitCellByInstanceId(cells, tid);
      if (!live) continue;
      if (!fogHas(fogRevealedCellIds, live.cell.id)) continue;
      filtered.add(tid);
    }
    return { instanceIds: filtered, areaCellIds: null };
  }

  if (orderKey !== 'fire' && orderKey !== 'fireHard') {
    return { instanceIds: new Set(), areaCellIds: null };
  }

  const isArt = String(attackerUnit.type || '').toLowerCase() === 'artillery';
  if (isDotFireShooter(attackerUnit, attackerCell, cells)) {
    const dotH = computeDotFireHighlights(attackerUnit, attackerCell, cells, fogRevealedCellIds);
    return {
      instanceIds: dotH.instanceIds,
      areaCellIds: dotH.areaCellIds.size > 0 ? dotH.areaCellIds : null,
    };
  }
  const fromDot = false;
  if (battleUnitHasPropKey(attackerUnit, 'areaFire') && isArt && !fromDot) {
    const maxD = maxShootRangeStepsForUnit(attackerUnit, attackerCell);
    if (maxD < 1) return { instanceIds: new Set(), areaCellIds: null };
    const fogSet =
      fogRevealedCellIds == null
        ? null
        : Array.isArray(fogRevealedCellIds)
          ? new Set(fogRevealedCellIds)
          : fogRevealedCellIds;
    let set = findAreaFireReachableCellIds(
      attackerCell,
      cells,
      maxD,
      fogSet,
      false,
    );
    const artSec = getArtillerySectorCellIdSet(attackerUnit, attackerCell, cells);
    if (artSec) {
      if (artSec.size === 0) {
        return { instanceIds: new Set(), areaCellIds: null };
      }
      set = new Set([...set].filter((id) => artSec.has(id)));
    }
    const concealedTargetOk = battleUnitHasPropKey(attackerUnit, 'concealedTargetFire');
    set = new Set(
      [...set].filter((id) => {
        const c = cells.find((x) => x.id === id);
        if (!c) return false;
        const d = hexDistCells(attackerCell, c);
        if (!cellHasShootableHostileAtDistance(attackerUnit, attackerCell, c, d, false)) return false;
        return losAllowsShot(attackerCell, c, cells, concealedTargetOk, options, orderKey, isArt);
      }),
    );
    return { instanceIds: new Set(), areaCellIds: set.size > 0 ? set : null };
  }

  const raw = findHostileUnitsInShootingRange(
    attackerUnit,
    attackerCell,
    cells,
    orderKey,
    fogRevealedCellIds,
  );
  const filtered = new Set<number>();
  const concealedTargetOk = battleUnitHasPropKey(attackerUnit, 'concealedTargetFire');
  for (const tid of raw) {
    const live = findBattleUnitByInstanceId(cells, tid) ?? findUnitCellByInstanceId(cells, tid);
    if (!live) continue;
    if (
      !fogHas(fogRevealedCellIds, live.cell.id) && !concealedTargetOk
    ) {
      continue;
    }
    const losOk = losAllowsShot(
      attackerCell,
      live.cell,
      cells,
      concealedTargetOk,
      options,
      orderKey,
      isArt,
    );
    if (!losOk && !concealedTargetOk) continue;
    if (isArt && !fromDot) {
      const tac2 = attackerUnit.tactical as { artilleryDeployed?: boolean } | undefined;
      if (tac2?.artilleryDeployed !== true) continue;
      if (!isCellInArtillerySector(attackerUnit, attackerCell, cells, live.cell.id)) continue;
    }
    filtered.add(tid);
  }
  return { instanceIds: filtered, areaCellIds: null };
}

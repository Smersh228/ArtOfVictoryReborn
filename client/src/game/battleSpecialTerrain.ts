import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { effectiveElevationLevel } from './cellElevation';
import { isRiverCell } from './cellPonton';

type HexExtra = Record<string, unknown>;

function hexExtraOf(cell: Cell | null | undefined): HexExtra | null {
  const ex = cell && (cell as { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as HexExtra) : null;
}

function cellBlob(cell: Cell | null | undefined): string {
  const ex = hexExtraOf(cell);
  const name = String(cell?.name || (ex && (ex.name || ex.label)) || '');
  const type = String(cell?.type || '');
  return `${type} ${name}`;
}

function unitHasPropKey(u: { properties?: unknown } | null | undefined, key: string): boolean {
  const props = u?.properties;
  if (!Array.isArray(props)) return false;
  const want = String(key).trim();
  if (!want) return false;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (
      p &&
      typeof p === 'object' &&
      String((p as { prop_key?: string; key?: string }).prop_key ?? (p as { key?: string }).key ?? '').trim() === want
    ) {
      return true;
    }
  }
  return false;
}

export function isAirBattleUnit(unit: { type?: unknown } | null | undefined): boolean {
  const t = String(unit?.type ?? '')
    .trim()
    .toLowerCase();
  return t === 'lightair' || t === 'heavyair';
}

export function isFordHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (ex && ex.isFord === true) return true;
  return /брод|ford/i.test(cellBlob(cell));
}

export function isDestroyedBridgeHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (
    ex &&
    (ex.isDestroyedBridge === true ||
      ex.destroyedBridge === true ||
      ex.editorDestroyedBridge === true)
  ) {
    return true;
  }
  const hp = cell.builds && (cell.builds as { structureHp?: { kind?: string; str?: unknown } }).structureHp;
  if (hp && typeof hp === 'object') {
    const kind = String(hp.kind || '');
    if ((kind === 'bridge' || kind === 'railBridge') && Number(hp.str) <= 0) return true;
  }
  return false;
}

/** С каталога / старых карт: разрушенность только с ПКМ редактора (`editorDestroyed*`). */
export function clearInheritedDestroyedHexFlags(ex: Record<string, unknown> | null | undefined): void {
  if (!ex) return;
  if (ex.editorDestroyedBridge !== true) {
    delete ex.isDestroyedBridge;
    delete ex.destroyedBridge;
  }
  if (ex.editorDestroyedRailway !== true) {
    delete ex.isDestroyedRailway;
    delete ex.railwayDestroyed;
  }
}

export function isRailwayBridgeHex(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (ex && (ex.isRailwayBridge === true || ex.railBridge === true)) return true;
  if (ex && ex.isBridge === true && (ex.isRailway === true || ex.railway === true || ex.rail === true)) {
    return true;
  }
  return /железнодорожн(?:ый|ого)?\s*мост|rail(?:way)?\s*bridge/i.test(cellBlob(cell));
}

export function isIntactBridgeHex(cell: Cell | null | undefined): boolean {
  if (!cell || isDestroyedBridgeHex(cell)) return false;
  if (isRailwayBridgeHex(cell)) return true;
  const ex = hexExtraOf(cell);
  if (ex && ex.isBridge === true) return true;
  const blob = cellBlob(cell);
  if (/понтон/i.test(blob)) return false;
  return /(?:^|[^\u0400-\u04FF])мост|bridge/i.test(blob) && !/разрушен/i.test(blob);
}

export function isWaterObstacleHex(cell: Cell | null | undefined): boolean {
  const ex = hexExtraOf(cell);
  return !!(ex && (ex.moveWithRiverProp === true || ex.moveWithRiverProp === 'true' || ex.moveWithRiverProp === 1));
}

export function isSwampPropHex(cell: Cell | null | undefined): boolean {
  const ex = hexExtraOf(cell);
  return !!(ex && (ex.moveWithSwampProp === true || ex.moveWithSwampProp === 'true' || ex.moveWithSwampProp === 1));
}

export function isWaterUnitRiverHex(cell: Cell | null | undefined): boolean {
  const ex = hexExtraOf(cell);
  return !!(
    ex &&
    (ex.moveWithWaterUnitProp === true || ex.moveWithWaterUnitProp === 'true' || ex.moveWithWaterUnitProp === 1)
  );
}

export function cellAllowsWaterUnitMove(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  if (isIntactBridgeHex(cell) || isDestroyedBridgeHex(cell)) return true;
  if (isWaterUnitRiverHex(cell) || isWaterObstacleHex(cell)) return true;
  return isRiverCell(cell);
}

export function waterCraftOnWaterCell(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  cell: Cell | null | undefined,
): boolean {
  if (!unitHasPropKey(unit, 'waterUnit')) return false;
  if (isAirBattleUnit(unit)) return false;
  return isWaterUnitRiverHex(cell);
}

export function waterUnitCanEnterCell(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  cell: Cell | null | undefined,
): boolean {
  if (!unitHasPropKey(unit, 'waterUnit')) return true;
  if (isAirBattleUnit(unit)) return true;
  return isWaterUnitRiverHex(cell);
}

export function unitCanEnterDestroyedBridge(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  cell: Cell | null | undefined,
): boolean {
  if (!isDestroyedBridgeHex(cell)) return true;
  if (!unit) return false;
  if (isAirBattleUnit(unit)) return true;
  return unitHasPropKey(unit, 'waterUnit');
}

export function stepUsesLimitedSpecialMove(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  fromCell: Cell | null | undefined,
  toCell: Cell | null | undefined,
): boolean {
  if (!unit || isAirBattleUnit(unit)) return false;
  if (unitHasPropKey(unit, 'crossingAWaterObstacle')) {
    if (isWaterObstacleHex(fromCell) || isWaterObstacleHex(toCell)) return true;
  }
  if (unitHasPropKey(unit, 'movementThroughTheSwamp')) {
    if (isSwampPropHex(fromCell) || isSwampPropHex(toCell)) return true;
  }
  if (unitHasPropKey(unit, 'mountainTroops')) {
    const a = effectiveElevationLevel(fromCell ?? { hexExtra: undefined });
    const b = effectiveElevationLevel(toCell ?? { hexExtra: undefined });
    if (a !== b && (a === 3 || b === 3)) return true;
  }
  return false;
}

export function canEnterElevation3(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  toCell: Cell | null | undefined,
): boolean {
  if (!toCell || isAirBattleUnit(unit)) return true;
  if (effectiveElevationLevel(toCell) !== 3) return true;
  return unitHasPropKey(unit, 'mountainTroops');
}

export function specialMoveCountersAllow(
  unit: { properties?: unknown; type?: unknown } | null | undefined,
  counters: { limitedSpecial?: number; stepsTaken?: number } | null | undefined,
  fromCell: Cell | null | undefined,
  toCell: Cell | null | undefined,
): boolean {
  if (!counters) return true;
  if (Number(counters.limitedSpecial) >= 1) return false;
  if (stepUsesLimitedSpecialMove(unit, fromCell, toCell) && Number(counters.stepsTaken) >= 1) return false;
  return true;
}

export function unitInvolvesWaterUnit(
  a: { properties?: unknown } | null | undefined,
  b?: { properties?: unknown } | null,
): boolean {
  return unitHasPropKey(a, 'waterUnit') || unitHasPropKey(b, 'waterUnit');
}

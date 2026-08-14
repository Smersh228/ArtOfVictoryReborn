import { fireRangeTableMode, rangeArrayForUnit } from './battleFirePreview';

/** Есть ли у юнита дальний огонь по таблице меткости (range). */
export function unitCanUseRangedFireOrders(unit: Record<string, unknown> | null | undefined): boolean {
  if (!unit) return false;
  const ra = rangeArrayForUnit(unit);
  if (!ra.length) return false;
  if (fireRangeTableMode(ra) === 'ranged') {
    for (let d = 1; d < ra.length; d++) {
      if (Number(ra[d]) > 0) return true;
    }
    return false;
  }
  return Number(ra[0]) > 0;
}

/** Блок «Огонь» / «Огонь на подавление», если на всех дистанциях меткость 0. */
export function unitHasMeleeOnlyFireRowOptions(unit: Record<string, unknown> | null | undefined): boolean {
  return !unitCanUseRangedFireOrders(unit);
}

export const MELEE_ONLY_FIRE_ORDER_BLOCK_TITLE =
  'Нет дальнего огня (меткость 0 на всех дистанциях) — «Огонь» и «Огонь на подавление» недоступны';

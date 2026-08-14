export function isArmoredVehicleTarget(u: Record<string, unknown>): boolean {
  const t = String(u.type || '').toLowerCase();
  return (
    t === 'tech' ||
    t === 'armor' ||
    t === 'lighttank' ||
    t === 'mediumtank' ||
    t === 'heavytank'
  );
}

function desantLandingHalfCombatActive(unit: Record<string, unknown>): boolean {
  const tac = unit.tactical as
    | { desantHalfCombat?: boolean; desantEquipping?: boolean; desantEquipScheduled?: boolean }
    | undefined;
  if (tac?.desantEquipping || tac?.desantEquipScheduled) return false;
  return tac?.desantHalfCombat === true;
}

export function allowsDesantHalfCombatFireOrder(
  unit: Record<string, unknown>,
  orderKey: string,
): boolean {
  const ok = String(orderKey || '').trim();
  if (ok !== 'fire' && ok !== 'fireHard') return false;
  return desantLandingHalfCombatActive(unit);
}

export function canDesantHalfCombatShootTarget(
  attacker: Record<string, unknown>,
  target: Record<string, unknown>,
  distanceHex: number,
): boolean {
  const d = Number(distanceHex);
  if (!Number.isFinite(d) || d !== 0) return false;
  if (!desantLandingHalfCombatActive(attacker)) return false;
  if (String(attacker.type || '').toLowerCase() !== 'infantry') return false;
  if (isArmoredVehicleTarget(target)) return false;
  const meleeId = Number((attacker.tactical as { meleeOpponentInstanceId?: unknown })?.meleeOpponentInstanceId);
  const tid = Number(target.instanceId);
  if (Number.isFinite(meleeId) && Number.isFinite(tid) && meleeId === tid) return false;
  return true;
}

export function effectiveFireDistanceForAccuracy(
  attacker: Record<string, unknown>,
  target: Record<string, unknown> | null | undefined,
  distanceHex: number,
): number {
  const d = Number(distanceHex);
  if (target && canDesantHalfCombatShootTarget(attacker, target, d)) return 1;
  return d;
}

export function isFireDistanceOutOfRange(
  rangeArray: number[],
  rMode: 'ranged' | 'direct',
  distanceHex: number,
  attacker: Record<string, unknown>,
  target: Record<string, unknown> | null | undefined,
): boolean {
  const d = Number(distanceHex);
  if (target && canDesantHalfCombatShootTarget(attacker, target, d)) {
    return rMode === 'ranged' ? d >= rangeArray.length : false;
  }
  return rMode === 'ranged' ? d < 1 || d >= rangeArray.length : d > rangeArray.length;
}

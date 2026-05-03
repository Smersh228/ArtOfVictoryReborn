import type { RoomDetailResponse } from '../api/rooms';

type BattleLogEntry = NonNullable<RoomDetailResponse['battleLog']>[number];

export function shouldHideRawBattleReportLine(line: string): boolean {
  return (
    line.startsWith('Атака-подход:') ||
    line.startsWith('Огонь — попаданий:') ||
    line.startsWith('Огонь на подавление — попаданий:') ||
    line === 'Приказы:' ||
    line === '— Итог —' ||
    line.startsWith('· ')
  );
}

export function isDirectFireHiddenByGrouped(entry: BattleLogEntry, visibleLog: BattleLogEntry[]): boolean {
  const fireLine = entry.meta?.fireLine;
  if (!fireLine || fireLine.groupedFire === true || fireLine.groupedAreaFire === true) return false;
  const attackerId = Number(fireLine.attackerId);
  const targetId = Number(fireLine.targetId);
  if (!Number.isFinite(attackerId) || !Number.isFinite(targetId)) return false;
  return visibleLog.some((candidate) => {
    const cfl = candidate.meta?.fireLine;
    if (!cfl || (cfl.groupedFire !== true && cfl.groupedAreaFire !== true)) return false;
    if (Number(cfl.targetId) !== targetId) return false;
    const shooterIds = Array.isArray(cfl.shooterIds) ? cfl.shooterIds : [];
    if (shooterIds.length === 0) return true;
    return shooterIds.some((sid) => Number(sid) === attackerId);
  });
}

export function shouldHideFormattedBattleReport(_formatted: { order?: string } | null | undefined): boolean {
  return false;
}

import type { RoomDetailResponse } from '../api/rooms';

type BattleLogEntry = NonNullable<RoomDetailResponse['battleLog']>[number];

function intelligenceAirReconTurnForUnit(visibleLog: BattleLogEntry[], unitInstanceId: number): BattleLogEntry | null {
  const uid = Number(unitInstanceId);
  if (!Number.isFinite(uid)) return null;
  for (let i = 0; i < visibleLog.length; i++) {
    const rl = visibleLog[i]?.meta?.reconLine;
    if (!rl || String(rl.orderKey || '').trim() !== 'intelligenceAir') continue;
    if (Number(rl.unitInstanceId) === uid) return visibleLog[i];
  }
  return null;
}

/** Скрыть отдельную строку вылета, если в том же ходу уже есть сводка разведки по этому самолёту. */
export function isIntelligenceAirLaunchHiddenByRecon(entry: BattleLogEntry, visibleLog: BattleLogEntry[]): boolean {
  const text = String(entry.text ?? '').trim();
  const aml = entry.meta?.airMissionLine;
  const isLaunchText = /^Авиационная разведка: юнит \d+ — вылет с кл\. \d+, точка кл\. \d+, \d+ х\.$/.test(text);
  const isLaunchMeta =
    aml &&
    String(aml.orderKey || '').trim() === 'intelligenceAir' &&
    !entry.meta?.reconLine;
  if (!isLaunchText && !isLaunchMeta) return false;
  const uid = Number(aml?.unitInstanceId ?? text.match(/^Авиационная разведка: юнит (\d+)/)?.[1]);
  if (!Number.isFinite(uid)) return false;
  return intelligenceAirReconTurnForUnit(visibleLog, uid) != null;
}

/** Скрыть детальные строки залпа, если в том же ходу уже есть сводка airCombatLine. */
export function isAirCombatDetailHiddenBySummary(entry: BattleLogEntry, visibleLog: BattleLogEntry[]): boolean {
  const text = String(entry.text ?? '').trim();
  const isDetail = /^Воздушный бой: \d+ → \d+ ·/.test(text);
  if (!isDetail) return false;
  const turn = entry.turn;
  for (let i = 0; i < visibleLog.length; i++) {
    const e = visibleLog[i];
    if (e.turn !== turn) continue;
    const acl = e.meta?.airCombatLine;
    if (acl && Array.isArray(acl.roundShots) && acl.roundShots.length > 0) return true;
  }
  return false;
}

/** Скрыть «приказ прерван», если в том же ходу есть сводка залпа воздушного боя. */
export function isAirCombatInterruptHiddenByRoundSummary(
  entry: BattleLogEntry,
  visibleLog: BattleLogEntry[],
): boolean {
  const acl = entry.meta?.airCombatLine;
  if (!acl || acl.interrupted !== true) return false;
  const turn = entry.turn;
  for (let i = 0; i < visibleLog.length; i++) {
    const e = visibleLog[i];
    if (e.turn !== turn) continue;
    const round = e.meta?.airCombatLine;
    if (round && Array.isArray(round.roundShots) && round.roundShots.length > 0) return true;
  }
  return false;
}

/** Скрыть «нет боеприпасов» в возdушном бою (устаревший лог). */
export function isAirCombatNoAmmoHidden(entry: BattleLogEntry): boolean {
  return /^Воздушный бой: юнит \d+ — нет БК$/.test(String(entry.text ?? '').trim());
}

/** Скрыть дубль «задание завершено · возвращение», если в том же ходу уже есть «Возвращение на базу». */
export function isAirMissionDoneHiddenByReturn(
  entry: BattleLogEntry,
  visibleLog: BattleLogEntry[],
): boolean {
  const text = String(entry.text ?? '').trim();
  const isDone =
    /^Патруль\/разведка завершены: юнит \d+ — возвращение на базу$/.test(text) ||
    /^Авиационная разведка завершена: юнит \d+ — возвращение на базу$/.test(text);
  if (!isDone) return false;
  const uid = Number(text.match(/юнит (\d+)/)?.[1]);
  if (!Number.isFinite(uid)) return false;
  const turn = entry.turn;
  return visibleLog.some((e) => {
    if (e.turn !== turn) return false;
    const aml = e.meta?.airMissionLine;
    if (!aml || String(aml.orderKey || '').trim() !== 'airReturn') return false;
    return Number(aml.unitInstanceId) === uid;
  });
}

/** Скрыть повтор «на задании», если в том же ходу уже есть сводка «На задании: …». */
export function isPatrolActiveHiddenByMissionOnStation(
  entry: BattleLogEntry,
  visibleLog: BattleLogEntry[],
): boolean {
  const text = String(entry.text ?? '').trim();
  const patrolActiveM = text.match(/^Патрулирование: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  const intelActiveM = text.match(/^Авиационная разведка: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  const uid = Number(patrolActiveM?.[1] ?? intelActiveM?.[1]);
  if (!Number.isFinite(uid)) return false;
  const turn = entry.turn;
  return visibleLog.some((e) => {
    if (e.turn !== turn) return false;
    const other = String(e.text ?? '').trim();
    return new RegExp(`^На задании: юнит ${uid} — «`).test(other);
  });
}

export function shouldHideRawBattleReportLine(line: string): boolean {
  if (line.startsWith('Авиационная разведка:')) {
    if (/^Авиационная разведка: юнит \d+ — на задании, осталось \d+ х\.$/.test(line)) return true;
    if (/^Авиационная разведка завершена:/.test(line)) return true;
    return false;
  }
  if (line.startsWith('Патрулирование:')) {
    if (/^Патрулирование: юнит \d+ — на задании, осталось \d+ х\.$/.test(line)) return true;
    if (/^Патруль\/разведка завершены:/.test(line)) return true;
    return false;
  }
  if (line.startsWith('Полёт:')) return true;
  if (/^В небе появился самолёт:/.test(line)) return true;
  if (line.startsWith('Вылет:') && line.includes('маршрут')) return true;
  if (/^Патрулирование: юнит \d+, вылет \d+ → назначение \d+/.test(line)) return true;
  if (/^Авиационная разведка: юнит \d+ — вылет с кл\./.test(line)) return true;
  if (/^Десант · ход 1\/3 — вылет:/.test(line)) return true;
  if (/^Десант · (?:ход 2\/3 — )?десантирование: юнит \d+ → кл\. \d+$/.test(line)) return true;
  if (/^На задании: юнит \d+ — «(patrol|intelligenceAir|attackAir|bombardment|interception|desant|airSupply|accompaniment)»/.test(line)) return true;
  if (line.startsWith('Воздушный бой')) {
    if (/^Воздушный бой · гекс \d+:/.test(line)) return true;
    if (/^Воздушный бой: \d+ → \d+ ·/.test(line)) return true;
    if (/^Воздушный бой: юнит \d+ — нет БК$/.test(line)) return true;
    if (/^Воздушный бой · стойкость:/.test(line)) return true;
    return false;
  }
  if (/^На задании: юнит \d+ — «intelligenceAir»/.test(line)) return true;
  if (/^На задании: юнит \d+ — «patrol»/.test(line)) return true;
  if (line.startsWith('Разведка:') && line.includes('ход ')) return false;
  if (line.startsWith('Радиоперехват:') && line.includes('ход ')) return false;
  return (
    line.startsWith('Атака-подход:') ||
    line.startsWith('Огонь — попаданий:') ||
    line.startsWith('Огонь на подавление — попаданий:') ||
    line.startsWith('Авиаприказ «') ||
    /^Отзыв: юнит \d+ — возвращение на базу$/.test(line) ||
    line.includes('; траектория:') ||
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

export function shouldHideFormattedBattleReport(formatted: { order?: string; detail?: string } | null | undefined): boolean {
  if (!formatted) return false;
  if (formatted.detail === "—" && (formatted.order === "Штурмовка" || formatted.order === "Бомбардировка")) return true;
  return false;
}

import { useMemo } from 'react';
import type { RoomDetailResponse, LobbyFaction } from '../../api/rooms';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import { findBattleUnitByInstanceId } from '../../game/battleMovePreview';
import { teamFromUnit } from '../../game/editorMapTeam';
import {
  battleLogEntryReplayWithFallback,
  battleReportEntryShouldOmit,
  collectSyntheticAirAppearanceReportRows,
  formatBattleReportLines,
  isBattleWeatherLogText,
} from '../battleReportLog';
import { formatEnvironmentReport } from '../../game/battleEnvironment';
import {
  isDirectFireHiddenByGrouped,
  isIntelligenceAirLaunchHiddenByRecon,
  isAirCombatDetailHiddenBySummary,
  isAirCombatInterruptHiddenByRoundSummary,
  isAirCombatNoAmmoHidden,
  isAirMissionDoneHiddenByReturn,
  isPatrolActiveHiddenByMissionOnStation,
  shouldHideFormattedBattleReport,
  shouldHideRawBattleReportLine,
} from '../battleReportVisibility';

type BattleLogEntry = NonNullable<RoomDetailResponse['battleLog']>[number];

export type BattleReportActorFaction = 'rkka' | 'wehrmacht';

export type BattleReportRow = {
  key: string;
  isMeta: boolean;
  isTurnHeader: boolean;
  formatted: {
    order?: string;
    detail?: string;
    stats?: string;
  } | null;
  line: string;
  logEntry?: BattleLogEntry;
  replay?: unknown;
  interactive: boolean;
  bucket: 'general' | 'team';
  actorFaction: BattleReportActorFaction | null;
  actorTeam: number | null;
};

function reportUnitFaction(unit: { faction?: unknown } | null | undefined): BattleReportActorFaction | null {
  const f = String(unit?.faction || '').toLowerCase();
  if (f === 'germany' || f === 'wehrmacht') return 'wehrmacht';
  if (f === 'ussr' || f === 'rkka') return 'rkka';
  return null;
}

function extractReportActorUnitId(entry: BattleLogEntry | undefined): number | null {
  const m = (entry?.meta || {}) as Record<string, any>;
  const candidates = [
    m.unitInstanceId,
    m.fireLine?.attackerId,
    m.attackLine?.attackerId,
    m.reconLine?.unitInstanceId,
    m.airSortieLine?.unitInstanceId,
    m.airMissionLine?.unitInstanceId,
    m.airCombatLine?.unitInstanceId,
    m.airStrikeLine?.unitInstanceId,
    m.logisticsLine?.fromInstanceId,
  ];
  for (const raw of candidates) {
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const text = String(entry?.text || '');
  const hit = text.match(/(?:[Юю]нит|юнит|Ход:)\s*(\d+)/);
  if (hit) {
    const id = Number(hit[1]);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

function reportRowActor(
  entry: BattleLogEntry | undefined,
  cells: Cell[],
): { faction: BattleReportActorFaction; team: number } | null {
  const uid = extractReportActorUnitId(entry);
  const live = uid != null ? findBattleUnitByInstanceId(cells, uid) : null;
  if (live?.unit) {
    const faction = reportUnitFaction(live.unit);
    if (faction) return { faction, team: teamFromUnit(live.unit, 6) };
  }
  const metaFac = String((entry?.meta as { unitFaction?: unknown } | undefined)?.unitFaction || '')
    .trim()
    .toLowerCase();
  if (metaFac === 'rkka' || metaFac === 'ussr') return { faction: 'rkka', team: 1 };
  if (metaFac === 'wehrmacht' || metaFac === 'germany') return { faction: 'wehrmacht', team: 2 };
  return null;
}

function battleLogLatestTurn(log: BattleLogEntry[] | undefined): number | null {
  if (!log?.length) return null;
  let max = -Infinity;
  for (const e of log) {
    if (typeof e.turn === 'number' && Number.isFinite(e.turn)) max = Math.max(max, e.turn);
  }
  return Number.isFinite(max) && max >= 0 ? max : null;
}

function battleLogEntriesLatestTurn(log: BattleLogEntry[] | undefined): BattleLogEntry[] {
  const latestTurn = battleLogLatestTurn(log);
  if (latestTurn == null) return log ?? [];
  return (log ?? []).filter((e) => e.turn === latestTurn);
}

function extractDestroyedUnitName(detail: string): string | null {
  const m = String(detail || '').match(/^(.*?)\s+уничтожен(?:\s*\(.*\))?$/i);
  if (!m) return null;
  const name = String(m[1] || '').trim();
  return name || null;
}

function inferDestroyedFactionByName(name: string): 'rkka' | 'wehrmacht' | null {
  const s = String(name || '').toLowerCase();
  if (!s) return null;
  if (s.includes('совет') || s.includes('ркка') || s.includes('ussr')) return 'rkka';
  if (s.includes('немец') || s.includes('вермахт') || s.includes('wehr') || s.includes('german')) return 'wehrmacht';
  return null;
}

function inferDestroyedFactionFromMeta(meta: unknown): 'rkka' | 'wehrmacht' | null {
  const m = (meta || {}) as { unitFaction?: unknown };
  const f = String(m.unitFaction || '').trim().toLowerCase();
  if (f === 'rkka' || f === 'ussr') return 'rkka';
  if (f === 'wehrmacht' || f === 'germany') return 'wehrmacht';
  return null;
}

export function useBattleReportRows(params: {
  battleLog: RoomDetailResponse['battleLog'] | undefined;
  battleTurnIndex: number;
  cells: Cell[];
  viewerBattleFaction: LobbyFaction;
  battleFogRevealedCellIds: Set<number> | null;
  hasGrid: boolean;
}) {
  const { battleLog, battleTurnIndex, cells, viewerBattleFaction, battleFogRevealedCellIds, hasGrid } = params;

  const battleReportVisibleLog = useMemo(() => battleLogEntriesLatestTurn(battleLog), [battleLog]);

  const battleReportRows = useMemo(() => {
    const baseRows: BattleReportRow[] = [];
    for (let i = 0; i < battleReportVisibleLog.length; i++) {
      const entry = battleReportVisibleLog[i];
      if (battleReportEntryShouldOmit(entry, cells, viewerBattleFaction, battleFogRevealedCellIds)) continue;
      if (isDirectFireHiddenByGrouped(entry, battleReportVisibleLog)) continue;
      if (isIntelligenceAirLaunchHiddenByRecon(entry, battleReportVisibleLog)) continue;
      if (isAirCombatDetailHiddenBySummary(entry, battleReportVisibleLog)) continue;
      if (isAirCombatInterruptHiddenByRoundSummary(entry, battleReportVisibleLog)) continue;
      if (isAirCombatNoAmmoHidden(entry)) continue;
      if (isAirMissionDoneHiddenByReturn(entry, battleReportVisibleLog)) continue;
      if (isPatrolActiveHiddenByMissionOnStation(entry, battleReportVisibleLog)) continue;
      const isMeta = entry.phase === -1;
      const line = String(entry.text ?? '').trim() || '—';
      if (isBattleWeatherLogText(line)) continue;
      const isTurnHeader = isMeta && line.startsWith('——');
      const formatted = formatBattleReportLines(entry, cells, {
        viewerFaction: viewerBattleFaction,
        fogRevealedCellIds: battleFogRevealedCellIds,
      });
      if (shouldHideRawBattleReportLine(line) && !formatted) continue;
      if (shouldHideFormattedBattleReport(formatted)) continue;
      const replay = battleLogEntryReplayWithFallback(entry, cells, battleReportVisibleLog);
      const interactive = replay != null && hasGrid;
      const actor = isMeta || isTurnHeader ? null : reportRowActor(entry, cells);
      baseRows.push({
        key: `${entry.t ?? 0}-${i}-${line.slice(0, 24)}`,
        isMeta,
        isTurnHeader,
        formatted,
        line,
        logEntry: entry,
        replay,
        interactive,
        bucket: actor ? 'team' : 'general',
        actorFaction: actor?.faction ?? null,
        actorTeam: actor?.team ?? null,
      });
    }

    for (const synth of collectSyntheticAirAppearanceReportRows(cells, battleTurnIndex, battleLog)) {
      const airUnit = findBattleUnitByInstanceId(cells, synth.unitInstanceId);
      const airFac = reportUnitFaction(airUnit?.unit);
      baseRows.push({
        key: `synthetic-air-${synth.unitInstanceId}`,
        isMeta: false,
        isTurnHeader: false,
        formatted: synth.formatted,
        line: synth.formatted.detail,
        replay: synth.replay,
        interactive: hasGrid,
        bucket: airFac ? 'team' : 'general',
        actorFaction: airFac,
        actorTeam: airUnit?.unit ? teamFromUnit(airUnit.unit, 6) : null,
      });
    }

    const destroyedWithReason = new Set<string>();
    for (const row of baseRows) {
      const order = String(row.formatted?.order || '').trim();
      const detail = String(row.formatted?.detail || '').trim();
      if (order !== 'Потери') continue;
      if (!/уничтожен\s*\(/i.test(detail)) continue;
      const n = extractDestroyedUnitName(detail);
      if (n) destroyedWithReason.add(n.toLowerCase());
    }

    const filteredRows = baseRows.filter((row) => {
      const order = String(row.formatted?.order || '').trim();
      const detail = String(row.formatted?.detail || '').trim();
      if (order !== 'Потери') return true;
      if (!/уничтожен$/i.test(detail)) return true;
      const n = extractDestroyedUnitName(detail);
      if (!n) return true;
      return !destroyedWithReason.has(n.toLowerCase());
    });

    return { rows: filteredRows };
  }, [battleReportVisibleLog, battleTurnIndex, battleLog, cells, viewerBattleFaction, battleFogRevealedCellIds, hasGrid]);

  const weatherRows = useMemo(() => {
    const log = battleLog ?? [];
    const rows: BattleReportRow[] = [];
    let lastTurn: number | null = null;
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      const line = String(entry?.text ?? '').trim();
      if (!isBattleWeatherLogText(line)) continue;
      const turn = typeof entry.turn === 'number' && Number.isFinite(entry.turn) ? entry.turn : null;
      if (turn != null && turn !== lastTurn) {
        lastTurn = turn;
        rows.push({
          key: `weather-turn-${turn}`,
          isMeta: true,
          isTurnHeader: true,
          formatted: null,
          line: `—— Ход ${turn + 1} ——`,
          interactive: false,
          bucket: 'general',
          actorFaction: null,
          actorTeam: null,
        });
      }
      const formatted = formatEnvironmentReport(line.replace(/^Условия:\s*/, '').trim())
      rows.push({
        key: `weather-${entry.t ?? 0}-${i}`,
        isMeta: true,
        isTurnHeader: false,
        formatted,
        line,
        logEntry: entry,
        interactive: false,
        bucket: 'general',
        actorFaction: null,
        actorTeam: null,
      });
    }
    return rows;
  }, [battleLog]);

  const battleReportLatestTurn = useMemo(() => battleLogLatestTurn(battleLog), [battleLog]);

  const battleReportActionCount = useMemo(
    () => battleReportRows.rows.filter((row) => !row.isMeta && !row.isTurnHeader).length,
    [battleReportRows.rows],
  );

  const destroyedSummary = useMemo(() => {
    const rkka = new Map<string, number>();
    const wehr = new Map<string, number>();
    const seenDestroyedInstanceIds = new Set<number>();
    const addDestroyedUnit = (bucket: Map<string, number>, name: string) => {
      const key = String(name || '').trim();
      if (!key) return;
      bucket.set(key, (bucket.get(key) || 0) + 1);
    };
    const fullLog = battleLog ?? [];
    for (const entry of fullLog) {
      const text = String(entry?.text || '').trim();
      const meta = (entry?.meta || {}) as {
        destroyed?: unknown;
        unitName?: unknown;
        unitInstanceId?: unknown;
      };
      const isDestroyedLog = meta.destroyed === true || /^[Юю]нит \d+ уничтожен(?:\s*\(.*\))?$/i.test(text);
      if (!isDestroyedLog) continue;
      const textInstanceIdMatch = text.match(/^[Юю]нит (\d+) уничтожен/i);
      const metaInstanceId = Number(meta.unitInstanceId);
      const destroyedInstanceId = Number.isFinite(metaInstanceId)
        ? metaInstanceId
        : textInstanceIdMatch
          ? Number(textInstanceIdMatch[1])
          : null;
      if (destroyedInstanceId != null) {
        if (seenDestroyedInstanceIds.has(destroyedInstanceId)) continue;
        seenDestroyedInstanceIds.add(destroyedInstanceId);
      }
      const metaName = typeof meta.unitName === 'string' ? meta.unitName.trim() : '';
      const n = metaName || (textInstanceIdMatch ? `Юнит ${textInstanceIdMatch[1]}` : '');
      if (!n) continue;
      const side = inferDestroyedFactionFromMeta(entry?.meta) ?? inferDestroyedFactionByName(n);
      if (side === 'rkka') addDestroyedUnit(rkka, n);
      else if (side === 'wehrmacht') addDestroyedUnit(wehr, n);
    }
    const toList = (bucket: Map<string, number>) => [...bucket.entries()].map(([name, count]) => `${name} x${count}`);
    return {
      rkka: toList(rkka),
      wehrmacht: toList(wehr),
    };
  }, [battleLog]);

  return { battleReportRows, weatherRows, destroyedSummary, battleReportLatestTurn, battleReportActionCount };
}

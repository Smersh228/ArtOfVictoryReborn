import { useMemo } from 'react';
import type { RoomDetailResponse, LobbyFaction } from '../../api/rooms';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import {
  battleLogEntryReplayWithFallback,
  battleReportEntryShouldOmit,
  formatBattleReportLines,
} from '../battleReportLog';
import {
  isDirectFireHiddenByGrouped,
  shouldHideFormattedBattleReport,
  shouldHideRawBattleReportLine,
} from '../battleReportVisibility';

type BattleLogEntry = NonNullable<RoomDetailResponse['battleLog']>[number];

function battleLogEntriesLatestTurn(log: BattleLogEntry[] | undefined): BattleLogEntry[] {
  if (!log?.length) return [];
  let max = -Infinity;
  for (const e of log) {
    if (typeof e.turn === 'number' && Number.isFinite(e.turn)) max = Math.max(max, e.turn);
  }
  if (!Number.isFinite(max) || max < 0) return log;
  return log.filter((e) => e.turn === max);
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
  cells: Cell[];
  viewerBattleFaction: LobbyFaction;
  battleFogRevealedCellIds: Set<number> | null;
  hasGrid: boolean;
}) {
  const { battleLog, cells, viewerBattleFaction, battleFogRevealedCellIds, hasGrid } = params;

  const battleReportVisibleLog = useMemo(() => battleLogEntriesLatestTurn(battleLog), [battleLog]);

  const battleReportRows = useMemo(() => {
    const baseRows: Array<{
      key: string;
      isMeta: boolean;
      isTurnHeader: boolean;
      formatted: any;
      line: string;
      replay: any;
      interactive: boolean;
    }> = [];
    for (let i = 0; i < battleReportVisibleLog.length; i++) {
      const entry = battleReportVisibleLog[i];
      if (battleReportEntryShouldOmit(entry, cells, viewerBattleFaction, battleFogRevealedCellIds)) continue;
      if (isDirectFireHiddenByGrouped(entry, battleReportVisibleLog)) continue;
      const isMeta = entry.phase === -1;
      const line = String(entry.text ?? '').trim() || '—';
      if (shouldHideRawBattleReportLine(line)) continue;
      const isTurnHeader = isMeta && line.startsWith('——');
      const formatted = formatBattleReportLines(entry, cells, {
        viewerFaction: viewerBattleFaction,
        fogRevealedCellIds: battleFogRevealedCellIds,
      });
      if (shouldHideFormattedBattleReport(formatted)) continue;
      const replay = battleLogEntryReplayWithFallback(entry, cells);
      const interactive = replay != null && hasGrid;
      baseRows.push({
        key: `${entry.t ?? 0}-${i}-${line.slice(0, 24)}`,
        isMeta,
        isTurnHeader,
        formatted,
        line,
        replay,
        interactive,
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
  }, [battleReportVisibleLog, cells, viewerBattleFaction, battleFogRevealedCellIds, hasGrid]);

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

  return { battleReportRows, destroyedSummary };
}

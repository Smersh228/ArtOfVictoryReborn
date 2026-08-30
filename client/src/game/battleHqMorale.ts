import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { LobbyFaction } from '../api/rooms';
import { battleUnitHasPropKey } from './battleFirePreview';
import { readHqZoneRadiusWithHill } from './battleTerrain';
import { hexDistCells } from './battleLogisticsUi';
import { unitIsMineOnMap } from '../pages/battlePageUtils';

export const HQ_ZONE_MORALE_BONUS = 2;

function unitStrength(unit: Record<string, unknown>): number {
  const n = Number(unit.str ?? unit.strength ?? unit.count);
  return Number.isFinite(n) ? n : 0;
}

export function unitFactionKey(unit: Record<string, unknown>): string {
  const raw = String(unit.faction ?? '').trim().toLowerCase();
  if (raw === 'ussr' || raw === 'rkka') return 'ussr';
  if (raw === 'germany' || raw === 'wehrmacht') return 'germany';
  return raw;
}

export function readHqZoneRadiusFromUnit(
  unit: Record<string, unknown> | null | undefined,
  hqCell?: Cell | null,
): number {
  return readHqZoneRadiusWithHill(unit, hqCell ?? undefined);
}

export function collectFriendlyHqZoneCellIdsForFaction(cells: Cell[], factionKey: string): Set<number> {
  const out = new Set<number>();
  const fac = String(factionKey || '').trim();
  if (!fac) return out;
  for (const c of cells) {
    for (const u of c.units ?? []) {
      const unit = u as Record<string, unknown>;
      if (unitStrength(unit) <= 0) continue;
      if (unitFactionKey(unit) !== fac) continue;
      const radius = readHqZoneRadiusFromUnit(unit, c);
      if (radius <= 0) continue;
      for (const tc of cells) {
        if (hexDistCells(c, tc) <= radius) out.add(Number(tc.id));
      }
    }
  }
  return out;
}

export function collectFriendlyHqZoneCellIds(cells: Cell[], viewerFaction: LobbyFaction): Set<number> {
  if (viewerFaction === 'none') {
    const out = new Set<number>();
    for (const c of cells) {
      for (const u of c.units ?? []) {
        if (unitStrength(u as Record<string, unknown>) <= 0) continue;
        const radius = readHqZoneRadiusFromUnit(u as Record<string, unknown>, c);
        if (radius <= 0) continue;
        for (const tc of cells) {
          if (hexDistCells(c, tc) <= radius) out.add(Number(tc.id));
        }
      }
    }
    return out;
  }
  const fac = viewerFaction === 'wehrmacht' ? 'germany' : 'ussr';
  return collectFriendlyHqZoneCellIdsForFaction(cells, fac);
}

export function isCellInFriendlyHqZoneForFaction(
  cellId: number,
  cells: Cell[],
  factionKey: string,
): boolean {
  return collectFriendlyHqZoneCellIdsForFaction(cells, factionKey).has(Number(cellId));
}

export function isCellInFriendlyHqZone(
  cellId: number,
  cells: Cell[],
  viewerFaction: LobbyFaction,
): boolean {
  return collectFriendlyHqZoneCellIds(cells, viewerFaction).has(Number(cellId));
}

/** +2 в зоне штаба; от нескольких штабов не суммируется — только один бонус. */
export function getHqMoraleZoneBonus(
  unit: Record<string, unknown>,
  unitCell: Cell | null | undefined,
  cells: Cell[] | null | undefined,
): number {
  if (!unitCell || !cells?.length || unitStrength(unit) <= 0) return 0;
  const fac = unitFactionKey(unit);
  for (const hqCell of cells) {
    for (const hq of hqCell.units ?? []) {
      const staff = hq as Record<string, unknown>;
      if (unitStrength(staff) <= 0) continue;
      if (unitFactionKey(staff) !== fac) continue;
      const radius = readHqZoneRadiusFromUnit(staff, hqCell);
      if (radius <= 0) continue;
      if (hexDistCells(hqCell, unitCell) > radius) continue;
      return HQ_ZONE_MORALE_BONUS;
    }
  }
  return 0;
}

export function getHqMoraleBonusForUnit(
  unit: Record<string, unknown>,
  unitCell: Cell,
  cells: Cell[],
): number {
  return getHqMoraleZoneBonus(unit, unitCell, cells);
}

export function getEffectiveMorDisplay(
  unit: Record<string, unknown>,
  unitCell: Cell | null | undefined,
  cells: Cell[] | null | undefined,
): string | null {
  const base = Number(unit.mor ?? unit.morale);
  if (!Number.isFinite(base)) return null;
  const zone = getHqMoraleZoneBonus(unit, unitCell, cells);
  const cover = unit.tactical && (unit.tactical as { infantryCover?: boolean }).infantryCover ? 1 : 0;
  const extra = zone + cover;
  if (extra > 0) return `${base} +${extra}`;
  return String(base);
}

export function hasFriendlyAviationChallengeOnField(
  cells: Cell[],
  viewerFaction: LobbyFaction,
): boolean {
  for (const c of cells) {
    for (const u of c.units ?? []) {
      const unit = u as Record<string, unknown>;
      if (unitStrength(unit) <= 0) continue;
      if (!battleUnitHasPropKey(unit, 'aviationChallenge')) continue;
      if (viewerFaction === 'none' || unitIsMineOnMap(unit, viewerFaction)) return true;
    }
  }
  return false;
}

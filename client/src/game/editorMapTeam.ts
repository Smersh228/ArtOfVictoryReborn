export function teamLimitCap(limit: unknown): 2 | 4 | 6 {
  const n = Number(limit)
  return n === 4 || n === 6 ? n : 2
}

export function teamsForLimit(limit: unknown): number[] {
  const cap = teamLimitCap(limit)
  return Array.from({ length: cap }, (_, i) => i + 1)
}

export function factionForTeam(team: number): 'ussr' | 'germany' {
  return Number(team) % 2 === 1 ? 'ussr' : 'germany'
}

export function teamSideLabel(team: number): string {
  return factionForTeam(team) === 'ussr' ? 'СССР' : 'Вермахт'
}

export function normalizeUnitTeam(raw: unknown, limit: unknown = 6): number {
  const cap = teamLimitCap(limit)
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, cap)
}

export function isWehrmachtFaction(faction: unknown): boolean {
  const f = String(faction || '').toLowerCase()
  return f === 'germany' || f === 'wehrmacht'
}

export function teamsForFaction(faction: unknown, limit: unknown): number[] {
  const wehr = isWehrmachtFaction(faction)
  return teamsForLimit(limit).filter((team) => (wehr ? team % 2 === 0 : team % 2 === 1))
}

export function teamFromUnit(
  unit: { team?: unknown; faction?: unknown },
  limit: unknown = 6,
): number {
  const existing = Math.floor(Number(unit.team))
  if (Number.isFinite(existing) && existing >= 1) return normalizeUnitTeam(existing, limit)
  const side = teamsForFaction(unit.faction, limit)
  return side[0] ?? 1
}

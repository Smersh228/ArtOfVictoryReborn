export type WeatherSpec = {
  enabled: boolean
  chance: number
  duration: number
}

export type BattleEnvironmentLive = {
  nightEnabled: boolean
  nightFromFirst: boolean
  isNight: boolean
  fogActive: boolean
  rainActive: boolean
  strongWindActive: boolean
  visionPenalty: number
  accuracyShift: number
  intensityPenalty: number
  labels: string[]
}

const EMPTY_LIVE: BattleEnvironmentLive = {
  nightEnabled: false,
  nightFromFirst: true,
  isNight: false,
  fogActive: false,
  rainActive: false,
  strongWindActive: false,
  visionPenalty: 0,
  accuracyShift: 0,
  intensityPenalty: 0,
  labels: [],
}

let live: BattleEnvironmentLive = EMPTY_LIVE

export function setLiveBattleEnvironment(next: BattleEnvironmentLive | null | undefined) {
  live = next && typeof next === 'object' ? next : EMPTY_LIVE
  ;(globalThis as unknown as { __aovBattleEnv?: BattleEnvironmentLive }).__aovBattleEnv = live
}

export function getLiveBattleEnvironment(): BattleEnvironmentLive {
  return live || EMPTY_LIVE
}

export function applyVisionPenalty(range: number): number {
  const base = Number.isFinite(range) ? range : 0
  const pen = Number(getLiveBattleEnvironment().visionPenalty) || 0
  return Math.max(0, base - pen)
}

export function applyAccuracyRangeShift(rangeArray: number[]): number[] {
  const ra = Array.isArray(rangeArray) && rangeArray.length ? rangeArray.slice() : [3, 2, 1]
  const shift = Number(getLiveBattleEnvironment().accuracyShift) || 0
  if (shift <= 0) return ra
  const keep = Math.max(1, ra.length - shift)
  return ra.slice(0, keep)
}

export function applyIntensityPenalty(dice: number): number {
  const base = Number.isFinite(dice) ? dice : 0
  const pen = Number(getLiveBattleEnvironment().intensityPenalty) || 0
  return Math.max(0, base - pen)
}

function isRoadCell(cell: { type?: unknown } | null | undefined): boolean {
  const t = String(cell?.type ?? '')
    .trim()
    .toLowerCase()
  return t === 'road' || t === 'дорога'
}

function isInfantryUnit(unit: { type?: unknown } | null | undefined): boolean {
  return String(unit?.type ?? '')
    .trim()
    .toLowerCase() === 'infantry'
}

export function rainEntryExtra(cell: { type?: unknown } | null | undefined, unit: { type?: unknown } | null | undefined): number {
  if (!getLiveBattleEnvironment().rainActive) return 0
  if (isInfantryUnit(unit)) return 0.5
  if (isRoadCell(cell)) return 0.5
  return 1
}

export function applyRainEntryCost(
  cell: { type?: unknown } | null | undefined,
  unit: { type?: unknown } | null | undefined,
  baseCost: number,
): number {
  const base = Number(baseCost)
  if (!Number.isFinite(base) || base <= 0) return base > 0 ? base : 0
  return base + rainEntryExtra(cell, unit)
}

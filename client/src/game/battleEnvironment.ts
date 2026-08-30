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
  return Math.max(1, base - pen)
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

export const WEATHER_REPORT_TITLE = 'Погодные и временные условия'

const ENVIRONMENT_DEBUFFS: Record<string, string[]> = {
  Ночь: ['обзор −2', 'дальность точности −1 клетка', 'интенсивность огня −2 (не ниже 1)'],
  День: ['штрафов нет'],
  Туман: ['обзор −1', 'дальность точности −1 клетка', 'интенсивность огня −1 (не ниже 1)'],
  Дождь: ['вход в клетку: +0,5 ОД пехота и дорога, +1 остальные'],
}

export function parseEnvironmentLabelList(raw: string): string[] {
  return String(raw || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function environmentDebuffText(labels: string[]): string {
  return labels
    .map((name) => {
      const fx = ENVIRONMENT_DEBUFFS[name]
      if (!fx?.length) return null
      return `${name}: ${fx.join('; ')}`
    })
    .filter((row): row is string => Boolean(row))
    .join('\n')
}

export function formatEnvironmentReport(labelsOrRaw: string[] | string): {
  order: string
  detail: string
  stats?: string
} {
  const labels = Array.isArray(labelsOrRaw) ? labelsOrRaw : parseEnvironmentLabelList(labelsOrRaw)
  const stats = environmentDebuffText(labels)
  return {
    order: WEATHER_REPORT_TITLE,
    detail: labels.join(', ') || '—',
    stats: stats || undefined,
  }
}

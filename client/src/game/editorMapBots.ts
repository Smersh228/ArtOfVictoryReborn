export type BotDifficulty = 'easy' | 'normal' | 'hard'
export type BotSlotKind = 'player' | 'bot'

export type MapBotSlot = {
  team: number
  kind: BotSlotKind
}

export type MapBotsState = {
  enabled: boolean
  difficulty: BotDifficulty
  slots: MapBotSlot[]
}

export const DEFAULT_MAP_BOTS: MapBotsState = {
  enabled: false,
  difficulty: 'normal',
  slots: [],
}

export function botsSlotsForLimit(teamLimit: 2 | 4 | 6, prev: MapBotSlot[] = []): MapBotSlot[] {
  return Array.from({ length: teamLimit }, (_, i) => {
    const team = i + 1
    const found = prev.find((s) => s.team === team)
    return { team, kind: found?.kind === 'bot' ? 'bot' : 'player' }
  })
}

export function parseBotsFromPayload(raw: unknown, teamLimit: 2 | 4 | 6): MapBotsState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const difficulty = o.difficulty === 'easy' || o.difficulty === 'hard' ? o.difficulty : 'normal'
  const rawSlots = Array.isArray(o.slots) ? o.slots : []
  const prev: MapBotSlot[] = []
  for (const item of rawSlots) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const team = Number(s.team)
    if (!Number.isFinite(team) || team < 1) continue
    prev.push({ team: Math.trunc(team), kind: s.kind === 'bot' ? 'bot' : 'player' })
  }
  return {
    enabled: o.enabled === true,
    difficulty,
    slots: botsSlotsForLimit(teamLimit, prev),
  }
}

export function botsToPayload(state: MapBotsState, teamLimit: 2 | 4 | 6) {
  return {
    enabled: Boolean(state?.enabled),
    difficulty: state?.difficulty === 'easy' || state?.difficulty === 'hard' ? state.difficulty : 'normal',
    slots: botsSlotsForLimit(teamLimit, state?.slots),
  }
}

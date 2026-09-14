export type MapWeatherSpec = {
  enabled: boolean
  chance: string
  duration: string
}

export type MapEnvironmentFlags = {
  night: boolean
  nightFromFirst: boolean
  fog: MapWeatherSpec
  rain: MapWeatherSpec
  strongWind: MapWeatherSpec
}

const DEFAULT_WEATHER_SPEC: MapWeatherSpec = { enabled: false, chance: '30', duration: '3' }

export const DEFAULT_MAP_ENVIRONMENT: MapEnvironmentFlags = {
  night: false,
  nightFromFirst: true,
  fog: { ...DEFAULT_WEATHER_SPEC },
  rain: { ...DEFAULT_WEATHER_SPEC },
  strongWind: { ...DEFAULT_WEATHER_SPEC },
}

function weatherSpecFromRaw(raw: unknown): MapWeatherSpec {
  if (raw === true) return { enabled: true, chance: '30', duration: '3' }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEATHER_SPEC }
  const o = raw as Record<string, unknown>
  const chanceN = Number(o.chance)
  const durationN = Number(o.duration)
  return {
    enabled: o.enabled === true,
    chance: String(Number.isFinite(chanceN) ? Math.max(0, Math.min(100, Math.trunc(chanceN))) : 30),
    duration: String(Number.isFinite(durationN) && durationN > 0 ? Math.trunc(durationN) : 3),
  }
}

export function parseEnvironmentFromPayload(raw: unknown): MapEnvironmentFlags {
  const env = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    night: env.night === true,
    nightFromFirst: env.nightFromFirst !== false,
    fog: weatherSpecFromRaw(env.fog),
    rain: weatherSpecFromRaw(env.rain),
    strongWind: weatherSpecFromRaw(env.strongWind),
  }
}

function weatherSpecToPayload(spec: MapWeatherSpec) {
  const chance = Number(spec.chance)
  const duration = Number(spec.duration)
  return {
    enabled: spec.enabled,
    chance: Number.isFinite(chance) ? Math.max(0, Math.min(100, Math.trunc(chance))) : 30,
    duration: Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 3,
  }
}

export function environmentToPayload(env: MapEnvironmentFlags) {
  return {
    night: env.night,
    nightFromFirst: env.nightFromFirst,
    fog: weatherSpecToPayload(env.fog),
    rain: weatherSpecToPayload(env.rain),
    strongWind: { enabled: false, chance: 30, duration: 3 },
  }
}

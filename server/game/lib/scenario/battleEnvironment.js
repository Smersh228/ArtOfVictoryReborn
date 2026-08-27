'use strict'

const { AsyncLocalStorage } = require('async_hooks')

const envAls = new AsyncLocalStorage()

const WEATHER_KEYS = ['fog', 'rain', 'strongWind']
const WEATHER_LABELS = {
  fog: 'Туман',
  rain: 'Дождь',
  strongWind: 'Сильный ветер',
}

const EMPTY_LIVE = {
  nightEnabled: false,
  nightFromFirst: true,
  isNight: false,
  fogActive: false,
  rainActive: false,
  strongWindActive: false,
  visionPenalty: 0,
  accuracyShift: 0,
  intensityPenalty: 0,
}

function withBattleEnv(room, fn) {
  const snap = room && room.battleStartedAt != null ? snapshotFromRoom(room) : { ...EMPTY_LIVE }
  return envAls.run(snap, fn)
}

function bindLiveFromRoom(room) {
  return withBattleEnv(room, () => snapshotFromRoom(room))
}

function getLiveEnvironment() {
  return envAls.getStore() || EMPTY_LIVE
}

function clampChance(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 30
  return Math.max(0, Math.min(100, Math.trunc(x)))
}

function clampDuration(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 1) return 3
  return Math.trunc(x)
}

function parseWeatherSpec(raw) {
  if (raw === true) return { enabled: true, chance: 30, duration: 3 }
  if (!raw || typeof raw !== 'object') return { enabled: false, chance: 30, duration: 3 }
  const enabled = raw.enabled === true
  return {
    enabled,
    chance: clampChance(raw.chance),
    duration: clampDuration(raw.duration),
  }
}

function parseEnvironmentConfig(conditions) {
  const env =
    conditions && typeof conditions === 'object' && conditions.environment && typeof conditions.environment === 'object'
      ? conditions.environment
      : {}
  return {
    night: env.night === true,
    nightFromFirst: env.nightFromFirst !== false,
    fog: parseWeatherSpec(env.fog),
    rain: parseWeatherSpec(env.rain),
    strongWind: parseWeatherSpec(env.strongWind),
  }
}

function isNightTurn(turnIndex, config) {
  if (!config || !config.night) return false
  const t = Number(turnIndex)
  const idx = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
  if (config.nightFromFirst) return idx % 2 === 0
  return idx % 2 === 1
}

function effectiveMaxTurns(conditions) {
  if (!conditions || typeof conditions !== 'object') return null
  const n = Number(String(conditions.maxTurns ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  const base = Math.floor(n)
  const cfg = parseEnvironmentConfig(conditions)
  return cfg.night ? base * 2 : base
}

function emptyWeatherState() {
  return {
    fog: { active: false, turnsLeft: 0 },
    rain: { active: false, turnsLeft: 0 },
    strongWind: { active: false, turnsLeft: 0 },
  }
}

function visionPenaltyOf(snap) {
  let n = 0
  if (snap.isNight) n += 2
  if (snap.fogActive) n += 1
  return n
}

function accuracyShiftOf(snap) {
  let n = 0
  if (snap.isNight) n += 1
  if (snap.fogActive) n += 1
  return n
}

function intensityPenaltyOf(snap) {
  let n = 0
  if (snap.isNight) n += 2
  if (snap.fogActive) n += 1
  return n
}

function snapshotFromRoom(room) {
  const cfg = parseEnvironmentConfig(room && room.battleMapConditions)
  const weather = (room && room.battleWeather) || emptyWeatherState()
  const turnIndex = room && room.battleStartedAt != null ? Number(room.battleTurnIndex) || 0 : 0
  const isNight = room && room.battleStartedAt != null ? isNightTurn(turnIndex, cfg) : false
  const snap = {
    nightEnabled: cfg.night,
    nightFromFirst: cfg.nightFromFirst,
    isNight,
    fogActive: Boolean(weather.fog && weather.fog.active),
    rainActive: Boolean(weather.rain && weather.rain.active),
    strongWindActive: Boolean(weather.strongWind && weather.strongWind.active),
    visionPenalty: 0,
    accuracyShift: 0,
    intensityPenalty: 0,
  }
  snap.visionPenalty = visionPenaltyOf(snap)
  snap.accuracyShift = accuracyShiftOf(snap)
  snap.intensityPenalty = intensityPenaltyOf(snap)
  return snap
}

function publicSnapshot(room) {
  const cfg = parseEnvironmentConfig(room && room.battleMapConditions)
  const snap = snapshotFromRoom(room)
  const labels = []
  if (cfg.night) labels.push(snap.isNight ? 'Ночь' : 'День')
  if (snap.fogActive) labels.push('Туман')
  if (snap.rainActive) labels.push('Дождь')
  if (snap.strongWindActive) labels.push('Сильный ветер')
  return {
    ...snap,
    labels,
    fog: cfg.fog,
    rain: cfg.rain,
    strongWind: cfg.strongWind,
  }
}

function environmentLogText(room) {
  const labels = publicSnapshot(room).labels
  if (!labels.length) return ''
  return `Условия: ${labels.join(', ')}`
}

function applyVisionPenalty(range) {
  const n = Number(range)
  const base = Number.isFinite(n) ? n : 0
  const pen = Number(getLiveEnvironment().visionPenalty) || 0
  return Math.max(0, base - pen)
}

function applyAccuracyRangeShift(rangeArray) {
  const ra = Array.isArray(rangeArray) && rangeArray.length ? rangeArray.slice() : [3, 2, 1]
  const shift = Number(getLiveEnvironment().accuracyShift) || 0
  if (shift <= 0) return ra
  const keep = Math.max(1, ra.length - shift)
  return ra.slice(0, keep)
}

function applyIntensityPenalty(dice) {
  const n = Number(dice)
  const base = Number.isFinite(n) ? n : 0
  const pen = Number(getLiveEnvironment().intensityPenalty) || 0
  return Math.max(0, base - pen)
}

function isRoadCell(cell) {
  const t = String(cell && cell.type ? cell.type : '')
    .trim()
    .toLowerCase()
  return t === 'road' || t === 'дорога'
}

function isInfantryUnit(unit) {
  return String(unit && unit.type ? unit.type : '')
    .trim()
    .toLowerCase() === 'infantry'
}

function rainEntryExtra(cell, unit) {
  if (!getLiveEnvironment().rainActive) return 0
  if (isInfantryUnit(unit)) return 0.5
  if (isRoadCell(cell)) return 0.5
  return 1
}

function applyRainEntryCost(cell, unit, baseCost) {
  const base = Number(baseCost)
  if (!Number.isFinite(base) || base <= 0) return base > 0 ? base : 0
  return base + rainEntryExtra(cell, unit)
}

function tickWeather(room) {
  const cfg = parseEnvironmentConfig(room && room.battleMapConditions)
  if (!room.battleWeather || typeof room.battleWeather !== 'object') {
    room.battleWeather = emptyWeatherState()
  }
  const events = []
  for (const key of WEATHER_KEYS) {
    const spec = cfg[key]
    if (!room.battleWeather[key] || typeof room.battleWeather[key] !== 'object') {
      room.battleWeather[key] = { active: false, turnsLeft: 0 }
    }
    const st = room.battleWeather[key]
    const label = WEATHER_LABELS[key]
    if (!spec.enabled) {
      if (st.active) events.push(`Погода: ${label} закончился`)
      st.active = false
      st.turnsLeft = 0
      continue
    }
    if (st.active) {
      st.turnsLeft -= 1
      if (st.turnsLeft <= 0) {
        st.active = false
        st.turnsLeft = 0
        events.push(`Погода: ${label} закончился`)
      }
    }
    if (!st.active) {
      const roll = Math.random() * 100
      if (roll < spec.chance) {
        st.active = true
        st.turnsLeft = spec.duration
        events.push(`Погода: ${label} (${spec.duration} ход.)`)
      }
    }
  }
  return events
}

function initBattleEnvironment(room) {
  room.battleWeather = emptyWeatherState()
  return tickWeather(room)
}

module.exports = {
  parseEnvironmentConfig,
  isNightTurn,
  effectiveMaxTurns,
  emptyWeatherState,
  snapshotFromRoom,
  publicSnapshot,
  environmentLogText,
  bindLiveFromRoom,
  withBattleEnv,
  getLiveEnvironment,
  applyVisionPenalty,
  applyAccuracyRangeShift,
  applyIntensityPenalty,
  applyRainEntryCost,
  tickWeather,
  initBattleEnvironment,
}

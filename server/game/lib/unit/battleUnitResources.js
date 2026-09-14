'use strict'

/** Для авиации на поле боя ОД не ограничивают дальность хода (как «бесконечный» запас). */
const AIR_BATTLE_EFFECTIVE_MOVE_POINTS = 99999999

function isBattleAirUnitType(u) {
  const t = String(u?.type ?? '')
  return t === 'lightAir' || t === 'heavyAir'
}

function getMoveCap(u) {
  if (u != null && typeof u === 'object' && isBattleAirUnitType(u)) {
    return AIR_BATTLE_EFFECTIVE_MOVE_POINTS
  }
  const n = Number(u.mov ?? u.moveCap ?? 4)
  return Number.isFinite(n) && n > 0 ? n : 4
}

function getAmmo(u) {
  if (typeof u.ammoCount === 'number' && Number.isFinite(u.ammoCount)) return u.ammoCount
  const am = u.ammunition && typeof u.ammunition === 'object' ? u.ammunition.ammo : undefined
  if (typeof am === 'number' && Number.isFinite(am)) return am
  const raw = u.ammo
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.split(/[\/,]/)[0])
    if (Number.isFinite(n)) return n
  }
  return 999
}

function setAmmo(u, n) {
  const v = Math.max(0, n)
  u.ammoCount = v
  u.ammo = String(v)
  if (u.ammunition && typeof u.ammunition === 'object') {
    u.ammunition.ammo = v
  }
}

function getMines(u) {
  if (!u || typeof u !== 'object') return 0
  const am = u.ammunition && typeof u.ammunition === 'object' ? Number(u.ammunition.mine) : NaN
  if (Number.isFinite(am) && am >= 0) return Math.floor(am)
  const n = Number(u.mines)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function setMines(u, n) {
  if (!u || typeof u !== 'object') return
  const v = Math.max(0, Math.floor(Number(n) || 0))
  u.mines = v
  if (!u.ammunition || typeof u.ammunition !== 'object') u.ammunition = {}
  u.ammunition.mine = v
}

function getExplosives(u) {
  if (!u || typeof u !== 'object') return 0
  const am = u.ammunition && typeof u.ammunition === 'object' ? Number(u.ammunition.explosives) : NaN
  if (Number.isFinite(am) && am >= 0) return Math.floor(am)
  const n = Number(u.explosives)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function setExplosives(u, n) {
  if (!u || typeof u !== 'object') return
  const v = Math.max(0, Math.floor(Number(n) || 0))
  u.explosives = v
  if (!u.ammunition || typeof u.ammunition !== 'object') u.ammunition = {}
  u.ammunition.explosives = v
}

function getMovePoint(u) {
  if (u == null || typeof u !== 'object') return 0
  if (isBattleAirUnitType(u)) return AIR_BATTLE_EFFECTIVE_MOVE_POINTS
  if (!('movePoint' in u) || u.movePoint === undefined || u.movePoint === null) {
    return getMoveCap(u)
  }
  const n = Number(u.movePoint)
  return Number.isFinite(n) ? Math.max(0, n) : getMoveCap(u)
}

function setMovePoint(u, n) {
  if (u != null && typeof u === 'object' && isBattleAirUnitType(u)) {
    u.movePoint = AIR_BATTLE_EFFECTIVE_MOVE_POINTS
    return
  }
  u.movePoint = Math.max(0, n)
}

function parseAmmoMaxFromRaw(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  if (/[/,]/.test(s)) {
    const mx = Number(String(s.split(/[/,]/)[1] || '').trim())
    if (Number.isFinite(mx) && mx >= 0) return mx
    return null
  }
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseAmmoCapacityMax(u) {
  const fromSupply = parseAmmoMaxFromRaw(u.ammoSupply)
  if (fromSupply != null) return fromSupply
  const ammo = u.ammo
  if (typeof ammo === 'string' && /[/,]/.test(ammo)) return parseAmmoMaxFromRaw(ammo)
  return null
}

const DEFAULT_UNIT_AMMO_CAP = 10
const DEFAULT_TRUCK_AMMO_CAP = 40
const DEFAULT_TRUCK_SPECIAL_CAP = 10
const DEFAULT_UNIT_MINES_CAP = 4
const DEFAULT_UNIT_EXPLOSIVES_CAP = 2

function readStoredCap(u, key) {
  const n = Number(u && u[key])
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function getSpecialCapacityMax(u, have, capKey, unitDefault, receiveOrderKeys) {
  const stored = readStoredCap(u, capKey)
  const { isTruckUnit, unitHasOrderKey } = require('../../core/battleUnitType')
  if (isTruckUnit(u)) return Math.max(DEFAULT_TRUCK_SPECIAL_CAP, stored ?? 0, have)
  if (stored != null) return Math.max(stored, have)
  let canReceive = have > 0
  if (!canReceive && Array.isArray(receiveOrderKeys)) {
    for (const k of receiveOrderKeys) {
      if (unitHasOrderKey(u, k)) {
        canReceive = true
        break
      }
    }
  }
  if (canReceive) return Math.max(unitDefault, have)
  return 0
}

function getMinesCapacityMax(u) {
  return getSpecialCapacityMax(u, getMines(u), 'minesMax', DEFAULT_UNIT_MINES_CAP, ['mining', 'explomost'])
}

function getExplosivesCapacityMax(u) {
  return getSpecialCapacityMax(u, getExplosives(u), 'explosivesMax', DEFAULT_UNIT_EXPLOSIVES_CAP, ['explomost'])
}

function getAmmoCapacityMax(u) {
  const c = parseAmmoCapacityMax(u)
  if (c != null && Number.isFinite(c) && c >= 0) return c
  const { isTruckUnit } = require('../../core/battleUnitType')
  if (isTruckUnit(u)) {
    const have =
      typeof u.ammoCount === 'number' && Number.isFinite(u.ammoCount) ? u.ammoCount : 0
    return Math.max(DEFAULT_TRUCK_AMMO_CAP, have)
  }
  return DEFAULT_UNIT_AMMO_CAP
}

module.exports = {
  getMoveCap,
  getAmmo,
  setAmmo,
  getMines,
  setMines,
  getExplosives,
  setExplosives,
  getMovePoint,
  setMovePoint,
  getAmmoCapacityMax,
  getMinesCapacityMax,
  getExplosivesCapacityMax,
  DEFAULT_TRUCK_SPECIAL_CAP,
}

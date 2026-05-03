'use strict'

function getMoveCap(u) {
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

function getMovePoint(u) {
  if (u == null || typeof u !== 'object') return 0
  if (!('movePoint' in u) || u.movePoint === undefined || u.movePoint === null) {
    return getMoveCap(u)
  }
  const n = Number(u.movePoint)
  return Number.isFinite(n) ? Math.max(0, n) : getMoveCap(u)
}

function setMovePoint(u, n) {
  u.movePoint = Math.max(0, n)
}

function parseAmmoCapacityMax(u) {
  const s = u.ammoSupply
  if (typeof s === 'string' && s.includes('/')) {
    const mx = Number(String(s.split('/')[1] || '').trim())
    if (Number.isFinite(mx) && mx >= 0) return mx
  }
  return null
}

const DEFAULT_UNIT_AMMO_CAP = 10

function getAmmoCapacityMax(u) {
  const c = parseAmmoCapacityMax(u)
  if (c != null && Number.isFinite(c) && c >= 0) return c
  return DEFAULT_UNIT_AMMO_CAP
}

module.exports = {
  getMoveCap,
  getAmmo,
  setAmmo,
  getMovePoint,
  setMovePoint,
  getAmmoCapacityMax,
}

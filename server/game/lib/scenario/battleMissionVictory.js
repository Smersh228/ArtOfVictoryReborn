'use strict'

const { getStr, unitFaction, opposing, findUnitOnField } = require('../unit/battleUnitField')

function parseIdList(raw) {
  if (raw == null || raw === '') return []
  return String(raw)
    .split(',')
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n))
}

function normalizeStruggleFaction(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase()
  if (s === 'rkka' || s === 'ussr' || s === 'soviet') return 'rkka'
  if (s === 'wehrmacht' || s === 'germany' || s === 'axis') return 'wehrmacht'
  return 'wehrmacht'
}

function oppositeFaction(f) {
  return f === 'wehrmacht' ? 'rkka' : 'wehrmacht'
}

function isInstanceAliveAnywhere(cells, instanceId) {
  if (findUnitOnField(cells, instanceId)) return true
  const id = Number(instanceId)
  if (!Number.isFinite(id)) return false
  for (const cell of cells) {
    for (const u of cell.units || []) {
      const tac = u.tactical
      if (!tac || !Array.isArray(tac.carriedUnits)) continue
      for (const c of tac.carriedUnits) {
        if (Number(c.instanceId) === id && getStr(c) > 0) return true
      }
    }
  }
  return false
}

function hasLivingOpposingUnit(struggle, cells) {
  const seen = new Set()
  function consider(u) {
    if (!u || getStr(u) <= 0) return false
    const iid = Number(u.instanceId)
    if (!Number.isFinite(iid) || seen.has(iid)) return false
    seen.add(iid)
    return opposing(struggle, unitFaction(u))
  }
  for (const cell of cells) {
    for (const u of cell.units || []) {
      if (consider(u)) return true
      const tac = u.tactical
      if (tac && Array.isArray(tac.carriedUnits)) {
        for (const c of tac.carriedUnits) {
          if (consider(c)) return true
        }
      }
    }
  }
  return false
}

function isCaptureZonesSatisfied(conditions, struggleFaction, cells) {
  if (!conditions || typeof conditions !== 'object' || !Array.isArray(cells) || cells.length === 0) {
    return false
  }
  const struggle = normalizeStruggleFaction(struggleFaction || conditions.struggleFaction)
  const cap = conditions.axisCapture
  if (!cap || typeof cap !== 'object' || !cap.enabled) return false

  const hexIdArrRaw = parseIdList(cap.hexes)
  const objectiveHexIds = [...new Set(hexIdArrRaw)]
  if (objectiveHexIds.length === 0) return false
  const need = Math.max(1, Number(cap.requiredUnits) || 1)

  function countStruggleOnHex(hid) {
    let n = 0
    for (const cell of cells) {
      if (Number(cell.id) !== hid) continue
      const us = cell.units || []
      for (const u of us) {
        if (getStr(u) > 0 && unitFaction(u) === struggle) n += 1
        const tac = u.tactical
        if (tac && Array.isArray(tac.carriedUnits)) {
          for (const c of tac.carriedUnits) {
            if (getStr(c) > 0 && unitFaction(c) === struggle) n += 1
          }
        }
      }
    }
    return n
  }

  let total = 0
  for (const hid of objectiveHexIds) {
    total += countStruggleOnHex(hid)
  }
  return total >= need
}

function parseCaptureHoldTurnsRequired(conditions) {
  const cap = conditions && conditions.axisCapture
  if (!cap || typeof cap !== 'object' || !cap.enabled) return 1
  const n = Number(String(cap.turns ?? '').trim())
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function isEliminationObjectiveMet(conditions, struggleFaction, cells) {
  if (!conditions || typeof conditions !== 'object' || !Array.isArray(cells) || cells.length === 0) {
    return false
  }
  const struggle = normalizeStruggleFaction(struggleFaction || conditions.struggleFaction)
  const elim = conditions.axisElimination
  if (!elim || typeof elim !== 'object' || !elim.enabled) return false

  const t = elim.type === 'specific' ? 'specific' : 'all'
  if (t === 'specific') {
    const ids = parseIdList(elim.specificUnits)
    if (ids.length === 0) return false
    for (const id of ids) {
      if (isInstanceAliveAnywhere(cells, id)) return false
    }
    return true
  }
  return !hasLivingOpposingUnit(struggle, cells)
}

function captureHoldProgressLine(streak, needHold) {
  return `Сценарий — захват: удержание ${streak}/${needHold} полных ход(ов) подряд`
}

function parseMaxTurns(conditions) {
  if (!conditions || typeof conditions !== 'object') return null
  const n = Number(String(conditions.maxTurns ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function isMissionTurnLimitReached(conditions, battleTurnIndexAfterIncrement) {
  const max = parseMaxTurns(conditions)
  if (max == null) return false
  return battleTurnIndexAfterIncrement >= max
}

module.exports = {
  isCaptureZonesSatisfied,
  parseCaptureHoldTurnsRequired,
  captureHoldProgressLine,
  isEliminationObjectiveMet,
  parseMaxTurns,
  isMissionTurnLimitReached,
  oppositeFaction,
  normalizeStruggleFaction,
}

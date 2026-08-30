'use strict'

const PONTON_COMPLETE_SECTIONS = 4

function ensureBuilds(builds) {
  if (!builds || typeof builds !== 'object') return {}
  return builds
}

function pontonSections(builds) {
  return Math.max(0, Math.floor(Number(ensureBuilds(builds).pontonBridge) || 0))
}

function isPontonBuilding(builds) {
  const n = pontonSections(builds)
  return Boolean(ensureBuilds(builds).pontonBuilding) && n > 0 && n < PONTON_COMPLETE_SECTIONS
}

function isPontonComplete(builds) {
  const n = pontonSections(builds)
  if (n <= 0) return false
  if (n >= PONTON_COMPLETE_SECTIONS) return true
  return !ensureBuilds(builds).pontonBuilding
}

function hasPontonOnCell(builds) {
  return pontonSections(builds) > 0
}

function isRiverCell(cell) {
  if (!cell) return false
  const rawType = String(cell.type || '').trim()
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '')
  if (t === 'river' || t === 'rivers') return true
  const name = String(cell.name || '')
  const blob = `${rawType} ${name}`
  if (!/река/i.test(blob)) return false
  if (/озер|озёр|болот/i.test(blob)) return false
  return true
}

function addPontonSection(cell) {
  if (!cell) return { sections: 0, complete: false, already: false }
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  if (isPontonComplete(cell.builds)) {
    return {
      sections: Math.max(pontonSections(cell.builds), PONTON_COMPLETE_SECTIONS),
      complete: true,
      already: true,
    }
  }
  const next = Math.min(PONTON_COMPLETE_SECTIONS, pontonSections(cell.builds) + 1)
  cell.builds.pontonBridge = next
  if (next >= PONTON_COMPLETE_SECTIONS) {
    delete cell.builds.pontonBuilding
    return { sections: next, complete: true, already: false }
  }
  cell.builds.pontonBuilding = true
  return { sections: next, complete: false, already: false }
}

function destroyPonton(cell, le, ph, reason) {
  if (!cell || !hasPontonOnCell(cell.builds)) return false
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  cell.builds.pontonBridge = 0
  delete cell.builds.pontonBuilding
  if (typeof le === 'function') {
    le(ph, `Понтонный мост на кл. ${cell.id} уничтожен (${reason || 'подрыв'})`)
  }
  return true
}

function tryDestroyPontonFromFire(targetCell, attacker, shooterCell, distance, deps, le, ph) {
  if (!targetCell || !attacker || !hasPontonOnCell(targetCell.builds)) return false
  const { intensityArrayFor, rangeArrayForAtCell, computeShoot } = deps
  const virtualTarget = { type: 'build', def: 0, str: 1 }
  const intensity = intensityArrayFor(attacker, virtualTarget)
  const buildPower = intensity && intensity.length ? Number(intensity[0]) : 0
  if (!(buildPower > 0)) return false
  const rangeArray = rangeArrayForAtCell(attacker, shooterCell)
  const result = computeShoot(
    attacker,
    virtualTarget,
    targetCell,
    distance,
    [buildPower],
    rangeArray,
    false,
    null,
    0,
    0,
    false,
    1,
  )
  if (result.hits > 0 || result.damages > 0) {
    destroyPonton(targetCell, le, ph, 'огонь по инженерным сооружениям')
    return true
  }
  if (le && ph) {
    le(ph, `Огонь по понтону кл. ${targetCell.id}: попаданий ${result.hits}`)
  }
  return true
}

module.exports = {
  PONTON_COMPLETE_SECTIONS,
  pontonSections,
  isPontonBuilding,
  isPontonComplete,
  hasPontonOnCell,
  isRiverCell,
  addPontonSection,
  destroyPonton,
  tryDestroyPontonFromFire,
}

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

function hexExtraOf(cell) {
  return cell && cell.hexExtra && typeof cell.hexExtra === 'object' ? cell.hexExtra : null
}

function hexDistRobust(a, b) {
  if (!a || !b || !a.coor || !b.coor) return Number.POSITIVE_INFINITY
  const ax = Number(a.coor.x)
  const az = Number(a.coor.z)
  const bx = Number(b.coor.x)
  const bz = Number(b.coor.z)
  const dq = ax - bx
  const dr = az - bz
  const axial = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
  const ay = Number(a.coor.y)
  const by = Number(b.coor.y)
  if (Number.isFinite(ay) && Number.isFinite(by)) {
    const cube = Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
    return Math.min(cube, axial)
  }
  return axial
}

function isRiverCell(cell) {
  if (!cell) return false
  const ex = hexExtraOf(cell)
  if (ex) {
    if (ex.moveWithRiverProp === true) return true
    if (ex.isRiver === true || ex.river === true) return true
    const cat = String(ex.category || '').trim().toLowerCase()
    if (cat === 'rivers' || cat === 'river' || cat === 'water' || cat === 'waters') return true
    const plc = ex.placementAllowed
    if (plc && typeof plc === 'object' && plc.pontonBridge === true) return true
  }
  const rawType = String(cell.type || '').trim()
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '')
  if (t === 'river' || t === 'rivers' || t === 'water') return true
  if (/^hex\d+$/.test(t) === false && /river|water/.test(t)) return true
  const name = String(cell.name || (ex && (ex.name || ex.label)) || '')
  const img = String(cell.img || cell.imagePath || (ex && (ex.image_path || ex.img || ex.imagePath)) || '')
  const blob = `${rawType} ${name} ${img}`
  if (/река|руч(?:ей|ья|ью)?|канал|речн|водн|брод|river|water|ford/i.test(blob) && !/озер|озёр|болот|swamp|marsh|lake/i.test(blob)) {
    return true
  }
  return false
}

function isAdjacentRiverTarget(fromCell, riverCell) {
  if (!fromCell || !riverCell || !isRiverCell(riverCell)) return false
  return hexDistRobust(fromCell, riverCell) <= 1
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

function completePonton(cell) {
  if (!cell) return false
  if (!cell.builds || typeof cell.builds !== 'object') cell.builds = {}
  cell.builds.pontonBridge = PONTON_COMPLETE_SECTIONS
  delete cell.builds.pontonBuilding
  return true
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
  isAdjacentRiverTarget,
  hexDistRobust,
  addPontonSection,
  completePonton,
  destroyPonton,
  tryDestroyPontonFromFire,
}

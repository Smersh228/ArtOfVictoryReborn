'use strict'

const PHASE_KEYS = {
  defend: 1,
  fireHard: 2,
  fire: 3,
  air: 4,
  attack: 5,
  ambush: 6,
  special: 7,
  move: 8,
  steadfastnessFlush: 9,
}
const AIR_PHASE_ORDER_KEYS = new Set([
  'attackAir',
  'bombardment',
  'patrol',
  'accompaniment',
  'interception',
  'desant',
  'intelligenceAir',
  'airSupply',
  'airRecall',
])
function phaseForOrderKey(key) {
  const k = String(key || '').trim()
  if (k === 'defend') return PHASE_KEYS.defend
  if (k === 'ambush') return PHASE_KEYS.ambush
  if (k === 'fireHard') return PHASE_KEYS.fireHard
  if (k === 'fire') return PHASE_KEYS.fire
  if (AIR_PHASE_ORDER_KEYS.has(k)) return PHASE_KEYS.air
  if (k === 'attack') return PHASE_KEYS.attack
  if (k === 'move' || k === 'moveWar') return PHASE_KEYS.move
  return PHASE_KEYS.special
}
function logEntry(phase, text, turnIndex, meta) {
  const e = { phase, text, t: Date.now() }
  if (turnIndex != null && turnIndex !== '') e.turn = turnIndex
  if (meta && typeof meta === 'object') e.meta = meta
  return e
}
module.exports = { PHASE_KEYS, phaseForOrderKey, logEntry }

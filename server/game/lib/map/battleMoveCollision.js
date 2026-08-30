'use strict'

const morale = require('../../core/battleMorale')

function rollD6(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  return Math.floor(rand() * 6) + 1
}

function lastCell(path) {
  return path && path.length ? path[path.length - 1] : null
}

function truncatePath(path, lastIndex) {
  if (!path || !path.length) return path
  const idx = Math.max(0, lastIndex)
  return path.slice(0, idx + 1)
}

function opposingIntents(a, b) {
  return a && b && a.faction && b.faction && a.faction !== 'none' && a.faction !== b.faction
}

function applyIntersections(intents, le, ph) {
  for (let i = 0; i < intents.length; i++) {
    for (let j = i + 1; j < intents.length; j++) {
      const A = intents[i]
      const B = intents[j]
      if (!opposingIntents(A, B)) continue
      if (!A.path || A.path.length < 2 || !B.path || B.path.length < 2) continue
      const idsB = new Map()
      for (let bj = 1; bj < B.path.length; bj++) idsB.set(Number(B.path[bj].id), bj)
      let hit = null
      for (let ai = 1; ai < A.path.length; ai++) {
        const bj = idsB.get(Number(A.path[ai].id))
        if (bj == null) continue
        hit = { ai, bj, hex: A.path[ai] }
        break
      }
      if (!hit) continue
      const destA = lastCell(A.path)
      const destB = lastCell(B.path)
      const bothDest =
        destA && destB && Number(hit.hex.id) === Number(destA.id) && Number(hit.hex.id) === Number(destB.id)
      if (bothDest) continue
      A.path = truncatePath(A.path, hit.ai - 1)
      B.path = truncatePath(B.path, hit.bj - 1)
      if (typeof le === 'function') {
        le(
          ph,
          `Столкновение: юниты ${A.unitId} и ${B.unitId} — маршруты пересеклись у кл. ${hit.hex.id}, остановка на соседних`,
        )
      }
    }
  }
}

function applySameDestContests(intents, le, ph, deps) {
  const { cells, findUnitOnField, rng } = deps || {}
  const groups = new Map()
  for (const it of intents) {
    if (!it.path || it.path.length < 2) continue
    const dest = lastCell(it.path)
    if (!dest) continue
    const id = Number(dest.id)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(it)
  }
  for (const [destId, group] of groups) {
    const facs = new Set(group.map((g) => g.faction).filter((f) => f && f !== 'none'))
    if (facs.size < 2) continue
    const rolls = group.map((it) => {
      const pack = findUnitOnField && findUnitOnField(cells, it.unitId)
      const unit = pack ? pack.unit : it.unit
      const d6 = rollD6(rng)
      const mor = morale.getEffectiveMor(unit, cells, findUnitOnField)
      return { it, d6, mor, score: d6 + mor, faction: it.faction }
    })
    for (const row of rolls) {
      let oppMax = 0
      for (const other of rolls) {
        if (other.faction === row.faction) continue
        if (other.score > oppMax) oppMax = other.score
      }
      if (row.score <= oppMax) {
        row.it.path = truncatePath(row.it.path, row.it.path.length - 2)
        if (typeof le === 'function') {
          le(
            ph,
            `Столкновение: юнит ${row.it.unitId} не занял кл. ${destId} (куб ${row.d6}+стойк. ${row.mor}=${row.score}, противник ${oppMax})`,
          )
        }
      } else if (typeof le === 'function') {
        le(
          ph,
          `Столкновение: юнит ${row.it.unitId} занимает кл. ${destId} (куб ${row.d6}+стойк. ${row.mor}=${row.score})`,
        )
      }
    }
  }
}

function resolveMovementCollisions(intents, le, ph, deps) {
  if (!Array.isArray(intents) || intents.length < 2) return intents
  applyIntersections(intents, le, ph)
  applySameDestContests(intents, le, ph, deps)
  return intents
}

module.exports = {
  resolveMovementCollisions,
  truncatePath,
}

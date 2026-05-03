'use strict'

function splitNums(v) {
  if (v == null || v === '') return []
  if (Array.isArray(v)) return v.map((x) => Number(x) || 0)
  return String(v)
    .split(',')
    .map((x) => {
      const n = Number(String(x).trim())
      return Number.isFinite(n) ? n : 0
    })
}

function normalizeFireObject(f) {
  const src = f && typeof f === 'object' ? f : {}
  const g = (k, fb) => {
    const raw = src[k]
    const primary = raw != null && raw !== '' ? raw : fb
    let nums = splitNums(primary)
    if (!nums.length) nums = splitNums(fb)
    return nums
  }
  return {
    range: g('range', '3,2,1'),
    inf: g('inf', '1,2,2,3'),
    art: g('art', '1,1,2,2'),
    tech: g('tech', '1,1,2,2'),
    armor: g('armor', '1,1,2,2'),
    lt: g('lt', '1,1,2,2'),
    mt: g('mt', '1,1,2,2'),
    ht: g('ht', '1,1,2,2'),
    sa: g('sa', '1,1,2'),
    ba: g('ba', '1,1,2'),
    build: g('build', '0,0,1'),
  }
}

function targetTypeToFireKey(t) {
  const x = String(t || '').toLowerCase()
  const m = {
    infantry: 'inf',
    artillery: 'art',
    tech: 'tech',
    armor: 'armor',
    lighttank: 'lt',
    mediumtank: 'mt',
    heavytank: 'ht',
    lightair: 'sa',
    heavyair: 'ba',
  }
  return m[x] || 'inf'
}

module.exports = {
  splitNums,
  normalizeFireObject,
  targetTypeToFireKey,
}

'use strict'

const { unitFaction } = require('../unit/battleUnitField')

function cellToCube(c) {
  return { x: c.coor.x, y: c.coor.y, z: c.coor.z }
}

function cubeDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z))
}

function parseRangeCsv(raw) {
  if (raw == null || String(raw).trim() === '') return []
  return String(raw)
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n))
}

/**
 * Порог успеха по дистанции от точки приказа (кубическая):
 * 0 = точка приказа (1-я колонка редактора), 1 = 2-я колонка («2 кл.») и т.д.
 */
function successThresholdAtDistance(rangeArray, distance) {
  const d = Number(distance)
  if (!Number.isFinite(d) || d < 0) return 0
  if (d >= rangeArray.length) return 0
  return Number(rangeArray[d]) || 0
}

/** Число колонок таблицы = число колец, где 1-е кольцо — точка приказа. */
function maxReconRingSteps(rangeArray) {
  return rangeArray.length
}

/** Макс. кубическая дистанция от точки приказа (без учёта самой точки как «0»). */
function maxReconHexDistance(rangeArray) {
  return Math.max(0, rangeArray.length - 1)
}

function rollD6(rng) {
  const rand = typeof rng === 'function' ? rng : Math.random
  return Math.floor(rand() * 6) + 1
}

function rangeFieldForOrderKey(orderKey) {
  const k = String(orderKey || '').trim()
  if (k === 'intelligenceAir') return 'intelligenceAirRange'
  if (k === 'razvedka') return 'razvedkaRange'
  if (k === 'svzy') return 'svzyRange'
  return null
}

function readRangeCsvFromUnit(unit, orderKey) {
  const field = rangeFieldForOrderKey(orderKey)
  if (!field) return []
  const snake = field.replace(/([A-Z])/g, '_$1').toLowerCase()
  const raw = unit[field] ?? unit[snake]
  const nums = parseRangeCsv(raw)
  return nums.length ? nums : [1, 2, 3]
}

/**
 * Бросок d6 по клеткам в зоне разведки.
 * 1-я колонка таблицы — точка приказа (открывается всегда); далее 2…N-я колонки — кольца вокруг.
 */
function resolveReconRevealCellIds(cells, centerCell, rangeArray, rng) {
  const detailed = resolveReconRevealDetailed(cells, centerCell, rangeArray, rng)
  return detailed.revealedCellIds
}

function resolveReconRevealDetailed(cells, centerCell, rangeArray, rng) {
  if (!centerCell || !Array.isArray(cells) || !cells.length) {
    return { revealedCellIds: [], rolls: [] }
  }
  if (!rangeArray.length) {
    return { revealedCellIds: [Number(centerCell.id)], rolls: [] }
  }
  const maxDist = maxReconHexDistance(rangeArray)
  const centerCube = cellToCube(centerCell)
  const revealed = new Set([Number(centerCell.id)])
  const rolls = []

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.id === centerCell.id) continue
    const d = cubeDistance(centerCube, cellToCube(c))
    if (d < 1 || d > maxDist) continue
    const threshold = successThresholdAtDistance(rangeArray, d)
    if (threshold <= 0) continue
    const roll = rollD6(rng)
    const success = roll <= threshold
    rolls.push({
      cellId: Number(c.id),
      distance: d,
      ringSteps: d + 1,
      roll,
      threshold,
      success,
    })
    if (success) revealed.add(Number(c.id))
  }

  return { revealedCellIds: [...revealed], rolls }
}

/** Все клетки зоны: точка приказа + кольца до (N−1) гексов (N = число колонок таблицы). */
function computeReconZoneCellIds(cells, centerCell, rangeArray) {
  if (!centerCell || !Array.isArray(cells) || !cells.length) return []
  if (!rangeArray.length) return [Number(centerCell.id)]
  const maxDist = maxReconHexDistance(rangeArray)
  if (maxDist < 1) return [Number(centerCell.id)]
  const centerCube = cellToCube(centerCell)
  const ids = new Set([Number(centerCell.id)])
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const d = cubeDistance(centerCube, cellToCube(c))
    if (d >= 1 && d <= maxDist) ids.add(Number(c.id))
  }
  return [...ids]
}

function computeReconZoneForUnit(cells, centerCell, unit, orderKey) {
  return computeReconZoneCellIds(cells, centerCell, readRangeCsvFromUnit(unit, orderKey))
}

function mergeReconIntoUnitTactical(unit, cellIds, orderKey) {
  if (!unit || !Array.isArray(cellIds) || !cellIds.length) return { prevIds: [], newlyRevealedCellIds: [] }
  if (!unit.tactical || typeof unit.tactical !== 'object') unit.tactical = {}
  const k = String(orderKey || '').trim()
  /** Авиаразведка — только на время задания; после возврата туман снова закрывает клетки. */
  const field = k === 'intelligenceAir' ? 'intelligenceAirRevealedCellIds' : 'reconRevealedCellIds'
  const prev = Array.isArray(unit.tactical[field]) ? unit.tactical[field] : []
  const prevSet = new Set(prev.map((x) => Number(x)).filter((n) => Number.isFinite(n)))
  const set = new Set(prevSet)
  const newlyRevealedCellIds = []
  for (const id of cellIds) {
    const n = Number(id)
    if (!Number.isFinite(n)) continue
    if (!set.has(n)) newlyRevealedCellIds.push(n)
    set.add(n)
  }
  unit.tactical[field] = [...set]
  return { prevIds: [...prevSet], newlyRevealedCellIds }
}

function formatReconRollsSummary(rolls) {
  if (!rolls.length) return 'бросков нет'
  const ok = rolls.filter((r) => r.success)
  const parts = ok.slice(0, 8).map((r) => {
    const ring = Number(r.ringSteps) || Number(r.distance) + 1
    return `кл.${r.cellId} (${ring} кл., ${r.roll}≤${r.threshold})`
  })
  let s = parts.join(', ')
  if (ok.length > 8) s += ` … +${ok.length - 8}`
  if (ok.length < rolls.length) {
    s += `; промахов ${rolls.length - ok.length}`
  }
  return s
}

function parseTurnHint(turnHint) {
  const m = String(turnHint || '').match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return { turnNum: null, turnMax: null }
  return { turnNum: Number(m[1]), turnMax: Number(m[2]) }
}

function unitDisplayName(unit) {
  if (!unit) return '—'
  for (const k of ['name', 'unitName', 'title', 'label']) {
    const v = unit[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const t = unit.type
  if (typeof t === 'string' && t.trim()) return t.trim()
  const id = unit.instanceId
  return id != null ? `Юнит ${id}` : '—'
}

function collectDiscoveredEnemyUnits(cells, cellIds, observerFaction) {
  if (!Array.isArray(cells) || !Array.isArray(cellIds) || !cellIds.length) return []
  const idSet = new Set(cellIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)))
  const out = []
  const seen = new Set()
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    if (!idSet.has(Number(cell.id))) continue
    const us = cell.units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      const uf = unitFaction(u)
      if (uf === 'none' || uf === observerFaction) continue
      const uid = Number(u.instanceId)
      if (!Number.isFinite(uid) || seen.has(uid)) continue
      seen.add(uid)
      out.push({
        cellId: Number(cell.id),
        unitInstanceId: uid,
        unitName: unitDisplayName(u),
      })
    }
  }
  return out
}

function resolveReconMission({ unit, centerCell, cells, orderKey, le, ph, label, rng, turnHint, extraReconMeta }) {
  const rangeArray = readRangeCsvFromUnit(unit, orderKey)
  const { revealedCellIds, rolls } = resolveReconRevealDetailed(cells, centerCell, rangeArray, rng)
  const { newlyRevealedCellIds } = mergeReconIntoUnitTactical(unit, revealedCellIds, orderKey)
  const fac = unitFaction(unit)
  const name = String(label || orderKey || 'Разведка')
  const hint = turnHint ? `, ${turnHint}` : ''
  const okRolls = rolls.filter((r) => r.success)
  const missCount = rolls.length - okRolls.length
  const turnParts = parseTurnHint(turnHint)
  const reconZoneCellIds = computeReconZoneCellIds(cells, centerCell, rangeArray)
  const discoveredUnits = collectDiscoveredEnemyUnits(cells, newlyRevealedCellIds, fac)
  const extra = extraReconMeta && typeof extraReconMeta === 'object' ? extraReconMeta : {}
  le(
    ph,
    `${name}: юнит ${unit.instanceId}${hint} — всего открыто ${revealedCellIds.length} кл., новых ${newlyRevealedCellIds.length}; ${formatReconRollsSummary(rolls)}`,
    {
      reconLine: {
        orderKey: String(orderKey || ''),
        unitInstanceId: Number(unit.instanceId),
        centerCellId: Number(centerCell.id),
        reconZoneCellIds,
        revealedCellIds,
        newlyRevealedCellIds,
        rolls,
        successCount: okRolls.length,
        missCount,
        turnNum: turnParts.turnNum,
        turnMax: turnParts.turnMax,
        maxReconRingSteps: rangeArray.length,
        faction: fac,
        discoveredUnits,
        ...extra,
      },
    },
  )
  return revealedCellIds
}

function readIntelligenceAirCenterCell(unit, cells) {
  const tac = unit.tactical && typeof unit.tactical === 'object' ? unit.tactical : {}
  const targetId = Number(
    tac.intelligenceAirTargetCellId ?? tac.airMissionTargetCellId ?? tac.airSortie?.reconCenterCellId,
  )
  if (!Number.isFinite(targetId)) return null
  return cells.find((c) => Number(c.id) === targetId) || null
}

/** Снимок разведанных клеток по фракциям — сохраняется после возврата авиации. */
function syncBattleReconByFaction(room, cells) {
  if (!room || !Array.isArray(cells)) return
  const buckets = { rkka: new Set(), wehrmacht: new Set() }
  for (let ci = 0; ci < cells.length; ci++) {
    const us = cells[ci].units || []
    for (let ui = 0; ui < us.length; ui++) {
      const u = us[ui]
      const fac = unitFaction(u)
      if (fac === 'none') continue
      const ids = u.tactical?.reconRevealedCellIds
      if (!Array.isArray(ids)) continue
      for (let ii = 0; ii < ids.length; ii++) {
        const n = Number(ids[ii])
        if (Number.isFinite(n)) buckets[fac].add(n)
      }
    }
  }
  room.battleReconByFaction = {
    rkka: [...buckets.rkka],
    wehrmacht: [...buckets.wehrmacht],
  }
}

/** Один ход авиаразведки: бросок d6 по кольцам вокруг точки назначения. */
function resolveIntelligenceAirReconTurn({ unit, cells, le, ph, rng, turnHint }) {
  const centerCell = readIntelligenceAirCenterCell(unit, cells)
  if (!centerCell) {
    le(ph, `Авиационная разведка: юнит ${unit.instanceId} — точка разведки не найдена`)
    return []
  }
  const sortie = unit.tactical?.airSortie
  const extraReconMeta = {}
  if (sortie && typeof sortie === 'object') {
    const dep = Number(sortie.departureCellId)
    if (Number.isFinite(dep)) extraReconMeta.fromCellId = dep
    const maxT = Number(sortie.patrolTurnsMax)
    if (Number.isFinite(maxT) && maxT > 0) extraReconMeta.patrolTurnsMax = maxT
  }
  return resolveReconMission({
    unit,
    centerCell,
    cells,
    orderKey: 'intelligenceAir',
    le,
    ph,
    label: 'Авиационная разведка',
    rng,
    turnHint,
    extraReconMeta,
  })
}

module.exports = {
  parseRangeCsv,
  successThresholdAtDistance,
  maxReconRingSteps,
  maxReconHexDistance,
  readRangeCsvFromUnit,
  resolveReconRevealCellIds,
  resolveReconRevealDetailed,
  mergeReconIntoUnitTactical,
  resolveReconMission,
  resolveIntelligenceAirReconTurn,
  readIntelligenceAirCenterCell,
  computeReconZoneCellIds,
  computeReconZoneForUnit,
  syncBattleReconByFaction,
}

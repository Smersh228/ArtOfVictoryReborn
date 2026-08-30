'use strict'

const ponton = require('./battlePonton')
const mines = require('./battleMines')
const at = require('./battleAntiTankEdges')
const { getMines, setMines } = require('../unit/battleUnitResources')

const PONTON_MIN_STR = 2
const DEFAULT_PONTON_TURNS = 4
const DEFAULT_CUT_EJ_TURNS = 2
const DEFAULT_DEMINE_TURNS = 2
const DEFAULT_MINE_TURNS = 2

function readOrderDuration(unit, orderKey, fallback) {
  const orders = unit && unit.orders
  if (Array.isArray(orders)) {
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i]
      if (!o || typeof o !== 'object') continue
      const k = String(o.order_key || o.key || '').trim()
      if (k !== orderKey) continue
      for (const field of ['turns', 'duration', 'time', 'orderTurns', 'turns_count', 'number']) {
        const n = Number(o[field])
        if (Number.isFinite(n) && n >= 1) return Math.floor(n)
      }
      const m = String(o.name || '').match(/(\d+)/)
      if (m) {
        const n = Number(m[1])
        if (Number.isFinite(n) && n >= 1) return Math.floor(n)
      }
    }
  }
  return fallback
}

function isSapperBusy(unit) {
  const trench = require('./battleTrench')
  if (trench.isTrenchDigging(unit)) return true
  const job = unit && unit.tactical && unit.tactical.sapperJob
  if (!job || typeof job !== 'object') return false
  const left = Number(job.turnsLeft)
  return Number.isFinite(left) && left > 0
}

function sapperBusyReason(unit) {
  const trench = require('./battleTrench')
  if (trench.isTrenchDigging(unit)) return 'окапывается'
  const job = unit && unit.tactical && unit.tactical.sapperJob
  if (!job || Number(job.turnsLeft) <= 0) return null
  const k = String(job.key || '')
  if (k === 'buildPonton') return 'наводит переправу'
  if (k === 'cutEj') return 'снимает противотанковые заграждения'
  if (k === 'demining') return 'разминирует'
  if (k === 'mining') return 'минирует'
  return 'сапёрные работы'
}

function ensureTac(unit) {
  if (!unit.tactical) unit.tactical = {}
  return unit.tactical
}

function clearSapperJob(unit) {
  if (unit && unit.tactical) delete unit.tactical.sapperJob
}

function mineTeamFromUnit(unit) {
  const t = Math.floor(Number(unit && unit.team))
  if (Number.isFinite(t) && t >= 1) return t
  const f = String((unit && unit.faction) || '').toLowerCase()
  if (f === 'germany' || f === 'wehrmacht') return 2
  return 1
}

function riverAcceptsSapper(cell, unit, getStr, unitFaction) {
  if (!cell || !unit) return false
  const us = cell.units || []
  let live = 0
  for (let i = 0; i < us.length; i++) {
    const u = us[i]
    if (getStr(u) <= 0) continue
    if (u && u.tactical && u.tactical.inDot) continue
    live++
    if (unitFaction(u) !== unitFaction(unit)) return false
  }
  return live < 3
}

function startJob(unit, job) {
  ensureTac(unit).sapperJob = job
}

function forceMoveOnto(cur, dest, deps) {
  const { removeUnitFromCell, addUnitToCell, syncUnitCoor } = deps
  if (Number(cur.cell.id) === Number(dest.id)) return
  removeUnitFromCell(cur.cell, cur.unit.instanceId)
  addUnitToCell(dest, cur.unit)
  syncUnitCoor(cur.unit, dest)
  cur.cell = dest
}

function startBuildPonton(cells, cur, o, le, ph, deps) {
  const { getStr, hexDistCells, unitFaction } = deps
  if (isSapperBusy(cur.unit)) {
    le(ph, `Наведение переправы: ${cur.unit.instanceId} — ${sapperBusyReason(cur.unit)}`)
    return
  }
  if (getStr(cur.unit) < PONTON_MIN_STR) {
    le(ph, `Наведение переправы: ${cur.unit.instanceId} — нужна численность не менее ${PONTON_MIN_STR}`)
    return
  }
  const tid = o.targetCellId
  if (tid == null) {
    le(ph, `Наведение переправы: ${cur.unit.instanceId} — укажите гекс реки`)
    return
  }
  const river = cells.find((c) => Number(c.id) === Number(tid))
  if (!river || !ponton.isRiverCell(river)) {
    le(ph, `Наведение переправы: ${cur.unit.instanceId} — цель не река`)
    return
  }
  if (hexDistCells(cur.cell, river) !== 1) {
    le(ph, `Наведение переправы: ${cur.unit.instanceId} — отряд должен стоять на соседнем с рекой гексе`)
    return
  }
  if (ponton.isPontonComplete(river.builds)) {
    le(ph, `Наведение переправы: на кл. ${river.id} переправа уже наведена`)
    return
  }
  if (!riverAcceptsSapper(river, cur.unit, getStr, unitFaction)) {
    le(ph, `Наведение переправы: кл. ${river.id} занята`)
    return
  }
  forceMoveOnto(cur, river, deps)
  const duration = readOrderDuration(cur.unit, 'buildPonton', DEFAULT_PONTON_TURNS)
  startJob(cur.unit, {
    key: 'buildPonton',
    turnsLeft: duration,
    stayCellId: Number(river.id),
    workCellId: Number(river.id),
  })
  le(ph, `Наведение переправы: юнит ${cur.unit.instanceId} вышел на реку кл. ${river.id} (${duration} ход.)`, {
    sapperJob: 'buildPonton',
    sapperJobTurnsLeft: duration,
    sapperWorkCellId: Number(river.id),
    unitInstanceId: Number(cur.unit.instanceId),
  })
}

function startCutEj(cells, cur, o, le, ph, deps) {
  const { hexDistCells } = deps
  if (isSapperBusy(cur.unit)) {
    le(ph, `Снятие ежей: ${cur.unit.instanceId} — ${sapperBusyReason(cur.unit)}`)
    return
  }
  const tid = o.targetCellId
  if (tid == null) {
    le(ph, `Снятие ежей: ${cur.unit.instanceId} — не указана цель`)
    return
  }
  const tgt = cells.find((c) => Number(c.id) === Number(tid))
  if (!tgt) {
    le(ph, `Снятие ежей: ${cur.unit.instanceId} — клетка не найдена`)
    return
  }
  const dist = hexDistCells(cur.cell, tgt)
  if (dist > 1) {
    le(ph, `Снятие ежей: ${cur.unit.instanceId} — только свой или соседний гекс`)
    return
  }
  let edgeDir = null
  if (dist === 0) {
    const raw = Math.floor(Number(o.wireEdgeDir != null ? o.wireEdgeDir : o.trenchEdgeDir))
    if (!Number.isFinite(raw) || raw < 0 || raw > 5 || !at.hasAntiTankOnEdge(tgt.builds, raw)) {
      le(ph, `Снятие ежей: ${cur.unit.instanceId} — укажите грань с заграждением`)
      return
    }
    edgeDir = raw
  } else {
    const dir = at.findMoveDir(cur.cell, tgt)
    if (dir < 0) {
      le(ph, `Снятие ежей: ${cur.unit.instanceId} — не соседний гекс`)
      return
    }
    const oppDir = (dir + 3) % 6
    const hasShared =
      at.hasAntiTankOnMoveDir(cur.cell.builds, dir) || at.hasAntiTankOnMoveDir(tgt.builds, oppDir)
    if (!hasShared) {
      le(ph, `Снятие ежей: на общей грани нет заграждения`)
      return
    }
  }
  const duration = readOrderDuration(cur.unit, 'cutEj', DEFAULT_CUT_EJ_TURNS)
  startJob(cur.unit, {
    key: 'cutEj',
    turnsLeft: duration,
    stayCellId: Number(cur.cell.id),
    workCellId: Number(tgt.id),
    edgeDir,
  })
  le(ph, `Снятие ежей: юнит ${cur.unit.instanceId} начал снятие на кл. ${tgt.id} (${duration} ход.)`, {
    sapperJob: 'cutEj',
    sapperJobTurnsLeft: duration,
    sapperWorkCellId: Number(tgt.id),
    unitInstanceId: Number(cur.unit.instanceId),
  })
}

function startDemining(cells, cur, o, le, ph, deps) {
  const { hexDistCells } = deps
  if (isSapperBusy(cur.unit)) {
    le(ph, `Разминирование: ${cur.unit.instanceId} — ${sapperBusyReason(cur.unit)}`)
    return
  }
  const tid = o.targetCellId != null ? o.targetCellId : cur.cell.id
  const tgt = cells.find((c) => Number(c.id) === Number(tid))
  if (!tgt) {
    le(ph, `Разминирование: ${cur.unit.instanceId} — клетка не найдена`)
    return
  }
  const dist = hexDistCells(cur.cell, tgt)
  if (dist > 1) {
    le(ph, `Разминирование: ${cur.unit.instanceId} — только свой или соседний гекс`)
    return
  }
  if (!mines.isMineDiscoveredForUnit(tgt, cur.unit)) {
    le(ph, `Разминирование: минное поле на кл. ${tgt.id} не обнаружено`)
    return
  }
  const duration = readOrderDuration(cur.unit, 'demining', DEFAULT_DEMINE_TURNS)
  startJob(cur.unit, {
    key: 'demining',
    turnsLeft: duration,
    stayCellId: Number(cur.cell.id),
    workCellId: Number(tgt.id),
  })
  le(ph, `Разминирование: юнит ${cur.unit.instanceId} начал разминирование кл. ${tgt.id} (${duration} ход.)`, {
    sapperJob: 'demining',
    sapperJobTurnsLeft: duration,
    sapperWorkCellId: Number(tgt.id),
    unitInstanceId: Number(cur.unit.instanceId),
  })
}

function startMining(cells, cur, o, le, ph) {
  if (isSapperBusy(cur.unit)) {
    le(ph, `Минирование: ${cur.unit.instanceId} — ${sapperBusyReason(cur.unit)}`)
    return
  }
  const stock = getMines(cur.unit)
  if (stock < 1) {
    le(ph, `Минирование: ${cur.unit.instanceId} — нет мин в запасе`)
    return
  }
  if (mines.hasMineOnCell(cur.cell.builds)) {
    le(ph, `Минирование: на кл. ${cur.cell.id} уже есть минное поле`)
    return
  }
  setMines(cur.unit, stock - 1)
  const duration = readOrderDuration(cur.unit, 'mining', DEFAULT_MINE_TURNS)
  startJob(cur.unit, {
    key: 'mining',
    turnsLeft: duration,
    stayCellId: Number(cur.cell.id),
    workCellId: Number(cur.cell.id),
    mineKind: 'infantry',
    mineTeam: mineTeamFromUnit(cur.unit),
  })
  le(
    ph,
    `Минирование: юнит ${cur.unit.instanceId} начал минирование кл. ${cur.cell.id} (${duration} ход., мин осталось ${stock - 1})`,
    {
      sapperJob: 'mining',
      sapperJobTurnsLeft: duration,
      sapperWorkCellId: Number(cur.cell.id),
      sapperMinesLeft: stock - 1,
      unitInstanceId: Number(cur.unit.instanceId),
    },
  )
}

function completeCutEj(cells, unit, job, le, ph) {
  const stay = cells.find((c) => Number(c.id) === Number(job.stayCellId))
  const work = cells.find((c) => Number(c.id) === Number(job.workCellId))
  if (!stay || !work) return false
  if (Number(stay.id) === Number(work.id)) {
    const edge = Math.floor(Number(job.edgeDir))
    if (!Number.isFinite(edge) || !at.cutAntiTankOnCellEdge(work, edge)) return false
  } else if (!at.cutAntiTankAlongSharedEdge(stay, work)) {
    return false
  }
  le(ph, `Снятие ежей: юнит ${unit.instanceId} убрал заграждение у кл. ${work.id}`, {
    sapperJobDone: 'cutEj',
    sapperWorkCellId: Number(work.id),
    unitInstanceId: Number(unit.instanceId),
  })
  return true
}

function completeDemining(cells, unit, job, le, ph) {
  const work = cells.find((c) => Number(c.id) === Number(job.workCellId))
  if (!work || !mines.hasMineOnCell(work.builds)) return false
  const kind = mines.getMineKind(work.builds)
  mines.removeMineFromCell(work)
  le(ph, `Разминирование: юнит ${unit.instanceId} снял минное поле с кл. ${work.id}`, {
    sapperJobDone: 'demining',
    sapperWorkCellId: Number(work.id),
    mineKind: kind,
    unitInstanceId: Number(unit.instanceId),
  })
  return true
}

function completeMining(cells, unit, job, le, ph) {
  const work = cells.find((c) => Number(c.id) === Number(job.workCellId))
  if (!work) return false
  if (mines.hasMineOnCell(work.builds)) return false
  mines.placeMineOnCell(work, {
    kind: job.mineKind === 'tank' ? 'tank' : 'infantry',
    team: job.mineTeam,
  })
  le(ph, `Минирование: юнит ${unit.instanceId} установил минное поле на кл. ${work.id}`, {
    sapperJobDone: 'mining',
    sapperWorkCellId: Number(work.id),
    mineKind: mines.getMineKind(work.builds),
    unitInstanceId: Number(unit.instanceId),
  })
  return true
}

function tickSapperJobs(cells, le, ph) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      const job = u && u.tactical && u.tactical.sapperJob
      if (!job || typeof job !== 'object') continue
      let left = Number(job.turnsLeft)
      if (!Number.isFinite(left) || left <= 0) {
        clearSapperJob(u)
        continue
      }
      if (Number(c.id) !== Number(job.stayCellId)) {
        le(ph, `Сапёрные работы: юнит ${u.instanceId} покинул гекс — приказ прерван`)
        clearSapperJob(u)
        continue
      }
      left -= 1
      if (job.key === 'buildPonton') {
        const work = cells.find((x) => Number(x.id) === Number(job.workCellId)) || c
        const added = ponton.addPontonSection(work)
        le(
          ph,
          `Наведение переправы: юнит ${u.instanceId} — секция ${added.sections}/${ponton.PONTON_COMPLETE_SECTIONS} на кл. ${work.id}`,
          {
            sapperJob: 'buildPonton',
            pontonSections: added.sections,
            pontonComplete: added.complete,
            sapperWorkCellId: Number(work.id),
            unitInstanceId: Number(u.instanceId),
          },
        )
        if (added.complete || left <= 0) {
          if (added.complete) {
            le(ph, `Наведение переправы: юнит ${u.instanceId} полностью навел мост на кл. ${work.id}`, {
              sapperJobDone: 'buildPonton',
              sapperWorkCellId: Number(work.id),
              unitInstanceId: Number(u.instanceId),
            })
          }
          clearSapperJob(u)
          continue
        }
        job.turnsLeft = left
        continue
      }
      if (left > 0) {
        job.turnsLeft = left
        le(ph, `Сапёрные работы: юнит ${u.instanceId} — «${job.key}», осталось ${left} ход.`, {
          sapperJob: job.key,
          sapperJobTurnsLeft: left,
          sapperWorkCellId: Number(job.workCellId),
          unitInstanceId: Number(u.instanceId),
        })
        continue
      }
      if (job.key === 'cutEj') completeCutEj(cells, u, job, le, ph)
      else if (job.key === 'demining') completeDemining(cells, u, job, le, ph)
      else if (job.key === 'mining') completeMining(cells, u, job, le, ph)
      clearSapperJob(u)
    }
  }
}

module.exports = {
  PONTON_MIN_STR,
  DEFAULT_PONTON_TURNS,
  DEFAULT_CUT_EJ_TURNS,
  DEFAULT_DEMINE_TURNS,
  DEFAULT_MINE_TURNS,
  isSapperBusy,
  sapperBusyReason,
  clearSapperJob,
  startBuildPonton,
  startCutEj,
  startDemining,
  startMining,
  tickSapperJobs,
  mineTeamFromUnit,
  getMines,
}

'use strict'

const {
  isCaptureZonesSatisfied,
  parseCaptureHoldTurnsRequired,
  captureHoldProgressLine,
  isEliminationObjectiveMet,
  isMissionTurnLimitReached,
  oppositeFaction,
  normalizeStruggleFaction,
  hasLivingFactionUnits,
} = require('./battleMissionVictory')
const { hasPendingReinforcementsForFaction } = require('../map/battleReinforcements')

function factionTitle(faction) {
  return faction === 'wehrmacht' ? 'Вермахта' : 'РККА'
}

function pushScenarioLog(room, turnMeta, makeLogMeta, msg) {
  const line = makeLogMeta(turnMeta, msg)
  if (!Array.isArray(room.battleLog)) room.battleLog = []
  room.battleLog.push(line)
  if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
}

function endScenario(room, winner, reason, turnMeta, makeLogMeta, msg) {
  room.battleScenarioEndSeq = 1
  room.battleScenarioWinnerFaction = winner
  room.battleScenarioReason = reason
  pushScenarioLog(room, turnMeta, makeLogMeta, msg)
}

function resolveWipeVictory(room) {
  if (room && room.battleDeployPhase && room.battleDeployPhase.active) return null
  const cells = room && room.battleCells
  if (!Array.isArray(cells) || cells.length === 0) return null
  const rkkaAlive = hasLivingFactionUnits('rkka', cells)
  const wehrAlive = hasLivingFactionUnits('wehrmacht', cells)
  const rkkaForce = rkkaAlive || hasPendingReinforcementsForFaction(room, 'rkka')
  const wehrForce = wehrAlive || hasPendingReinforcementsForFaction(room, 'wehrmacht')
  if (rkkaAlive && !wehrForce) return 'rkka'
  if (wehrAlive && !rkkaForce) return 'wehrmacht'
  return null
}

function applyScenarioResolution(room, { turnMeta, makeLogMeta }) {
  if ((room.battleScenarioEndSeq ?? 0) > 0) return

  const wipeWinner = resolveWipeVictory(room)
  if (wipeWinner) {
    endScenario(
      room,
      wipeWinner,
      'wipe',
      turnMeta,
      makeLogMeta,
      `—— Уничтожение войск — победа ${factionTitle(wipeWinner)} ——`,
    )
    return
  }

  const cond = room.battleMapConditions
  if (!cond) return

  const struggle = normalizeStruggleFaction(cond.struggleFaction)
  const cellsNow = room.battleCells
  const cap = cond.axisCapture
  const elim = cond.axisElimination
  let objectiveMet = false

  if (cap && typeof cap === 'object' && cap.enabled) {
    const zonesOk =
      Array.isArray(cellsNow) &&
      cellsNow.length > 0 &&
      isCaptureZonesSatisfied(cond, struggle, cellsNow)
    const needHold = parseCaptureHoldTurnsRequired(cond)
    if (zonesOk) {
      room.battleCaptureHoldStreak = (room.battleCaptureHoldStreak ?? 0) + 1
    } else {
      room.battleCaptureHoldStreak = 0
    }
    objectiveMet = zonesOk && room.battleCaptureHoldStreak >= needHold
    if (zonesOk && !objectiveMet) {
      pushScenarioLog(room, turnMeta, makeLogMeta, captureHoldProgressLine(room.battleCaptureHoldStreak, needHold))
    }
  } else {
    room.battleCaptureHoldStreak = 0
    if (elim && typeof elim === 'object' && elim.enabled) {
      objectiveMet =
        Array.isArray(cellsNow) &&
        cellsNow.length > 0 &&
        isEliminationObjectiveMet(cond, struggle, cellsNow)
      if (objectiveMet && elim.type !== 'specific') {
        if (hasPendingReinforcementsForFaction(room, oppositeFaction(struggle))) {
          objectiveMet = false
        }
      }
    }
  }

  const timedOut = isMissionTurnLimitReached(cond, room.battleTurnIndex)

  if (objectiveMet) {
    const capOn = cap && typeof cap === 'object' && cap.enabled
    const msg = capOn
      ? `—— Сценарий: победа ${factionTitle(struggle)} (захват удержан) ——`
      : `—— Сценарий: победа ${factionTitle(struggle)} (уничтожение целей) ——`
    endScenario(room, struggle, 'objective', turnMeta, makeLogMeta, msg)
  } else if (timedOut) {
    const winner = oppositeFaction(struggle)
    endScenario(
      room,
      winner,
      'timeout',
      turnMeta,
      makeLogMeta,
      `—— Сценарий: лимит ходов — победа ${factionTitle(winner)} ——`,
    )
  }
}

module.exports = {
  applyScenarioResolution,
}

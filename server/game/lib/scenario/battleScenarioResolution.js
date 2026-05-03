'use strict'

const {
  isCaptureZonesSatisfied,
  parseCaptureHoldTurnsRequired,
  captureHoldProgressLine,
  isEliminationObjectiveMet,
  isMissionTurnLimitReached,
  oppositeFaction,
  normalizeStruggleFaction,
} = require('./battleMissionVictory')

function applyScenarioResolution(room, { turnMeta, makeLogMeta }) {
  const cond = room.battleMapConditions
  if (!cond || (room.battleScenarioEndSeq ?? 0) > 0) return

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
      if (!Array.isArray(room.battleLog)) room.battleLog = []
      room.battleLog.push(
        makeLogMeta(turnMeta, captureHoldProgressLine(room.battleCaptureHoldStreak, needHold)),
      )
      if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
    }
  } else {
    room.battleCaptureHoldStreak = 0
    if (elim && typeof elim === 'object' && elim.enabled) {
      objectiveMet =
        Array.isArray(cellsNow) &&
        cellsNow.length > 0 &&
        isEliminationObjectiveMet(cond, struggle, cellsNow)
    }
  }

  const timedOut = isMissionTurnLimitReached(cond, room.battleTurnIndex)

  if (objectiveMet) {
    room.battleScenarioEndSeq = 1
    room.battleScenarioWinnerFaction = struggle
    room.battleScenarioReason = 'objective'
    const capOn = cap && typeof cap === 'object' && cap.enabled
    const msg = capOn
      ? `—— Сценарий: победа ${struggle === 'wehrmacht' ? 'Вермахта' : 'РККА'} (захват удержан) ——`
      : `—— Сценарий: победа ${struggle === 'wehrmacht' ? 'Вермахта' : 'РККА'} (уничтожение целей) ——`
    const line = makeLogMeta(turnMeta, msg)
    if (!Array.isArray(room.battleLog)) room.battleLog = []
    room.battleLog.push(line)
    if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
  } else if (timedOut) {
    const winner = oppositeFaction(struggle)
    room.battleScenarioEndSeq = 1
    room.battleScenarioWinnerFaction = winner
    room.battleScenarioReason = 'timeout'
    const line = makeLogMeta(
      turnMeta,
      `—— Сценарий: лимит ходов — победа ${winner === 'wehrmacht' ? 'Вермахта' : 'РККА'} ——`,
    )
    if (!Array.isArray(room.battleLog)) room.battleLog = []
    room.battleLog.push(line)
    if (room.battleLog.length > 300) room.battleLog = room.battleLog.slice(-300)
  }
}

module.exports = {
  applyScenarioResolution,
}

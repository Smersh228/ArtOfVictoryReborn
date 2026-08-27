// @ts-nocheck 
import { findBattleUnitByInstanceId, findMovementPath } from "../game/battleMovePreview";
import { EDITOR_BATTLE_ORDER_DEFS } from "../game/battleOrderIcons";
import { isAirUnitInboundInSkyForTurn, readFlightPathCellIdsFromUnit } from "../game/battleAirSupport";
import {
  buildReconReplayFromLogEntry,
  buildAirCombatReplayFromLogEntry,
  buildAirReturnReplayFromLogEntry,
  buildDesantParatrooperReplayFromLogEntry,
} from "./battleReportReplay";
export function battleOrderLabel(orderKey) {
  const k = String(orderKey || "").trim();
  if (k === "airReturn") return "Возвращение на базу";
  const d = EDITOR_BATTLE_ORDER_DEFS.find((x) => x.order_key === k);
  return d?.name ?? k;
}
function reconOrderLabel(orderKey) {
  const k = String(orderKey || "").trim();
  if (k === "intelligenceAir") return "Авиационная разведка";
  if (k === "razvedka") return "Разведка";
  if (k === "svzy") return "Радиоперехват";
  return battleOrderLabel(k);
}
function formatReconReportLines(entry, cells, text, m) {
  const rl = m?.reconLine;
  if (!rl) return null;
  const uid = Number(rl.unitInstanceId);
  const u = Number.isFinite(uid) ? findBattleUnitByInstanceId(cells, uid) : null;
  const unitLabel = u ? battleUnitDisplayName(u.unit) : `Юнит ${rl.unitInstanceId}`;
  const centerId = Number(rl.centerCellId);
  const turnNum = Number(rl.turnNum);
  const turnMax = Number(rl.turnMax);
  const isIntelAir = String(rl.orderKey || "").trim() === "intelligenceAir";
  const turnHint =
    Number.isFinite(turnNum) && Number.isFinite(turnMax)
      ? `${turnNum}/${turnMax}`
      : text.match(/ход (\d+\/\d+)/)?.[1]
        ? String(text.match(/ход (\d+\/\d+)/)?.[1])
        : "";
  const okRolls = Array.isArray(rl.rolls) ? rl.rolls.filter((r) => r && r.success) : [];
  const missCount = Number.isFinite(Number(rl.missCount))
    ? Number(rl.missCount)
    : Array.isArray(rl.rolls)
      ? rl.rolls.length - okRolls.length
      : 0;
  const statsParts = [];
  if (turnHint) statsParts.push(`ход ${turnHint}`);
  const fromId = Number(rl.fromCellId);
  if (isIntelAir && turnNum === 1 && Number.isFinite(fromId)) {
    statsParts.push(`вылет: кл. ${fromId}`);
  }
  if (Number.isFinite(centerId)) statsParts.push(`точка: кл. ${centerId}`);
  const discovered = Array.isArray(rl.discoveredUnits) ? rl.discoveredUnits : [];
  if (discovered.length) {
    const names = discovered
      .slice(0, 6)
      .map((d) => {
        const name =
          typeof d?.unitName === "string" && d.unitName.trim()
            ? d.unitName.trim()
            : Number.isFinite(Number(d?.unitInstanceId))
              ? `Юнит ${d.unitInstanceId}`
              : "—";
        const cid = Number(d?.cellId);
        return Number.isFinite(cid) ? `${name} (кл.${cid})` : name;
      })
      .join(", ");
    statsParts.push(`обнаружено: ${names}${discovered.length > 6 ? "…" : ""}`);
  } else if (isIntelAir && Array.isArray(rl.newlyRevealedCellIds) && rl.newlyRevealedCellIds.length) {
    const observerFac = u ? reportViewerFaction(u.unit) : rl.faction;
    const fallback = collectDiscoveredEnemyUnitsFromCells(cells, rl.newlyRevealedCellIds, observerFac);
    if (fallback.length) {
      const names = fallback
        .slice(0, 6)
        .map((d) => `${d.unitName} (кл.${d.cellId})`)
        .join(", ");
      statsParts.push(`обнаружено: ${names}${fallback.length > 6 ? "…" : ""}`);
    }
  }
  if (okRolls.length) {
    const rollsStr = okRolls
      .slice(0, 12)
      .map((r) => `${r.roll}≤${r.threshold}`)
      .join(", ");
    statsParts.push(`выпало: ${rollsStr}${okRolls.length > 12 ? "…" : ""}`);
  }
  if (missCount > 0) statsParts.push(`промахов: ${missCount}`);
  return {
    order: reconOrderLabel(rl.orderKey),
    detail: unitLabel,
    stats: statsParts.join(" · ")
  };
}
function collectDiscoveredEnemyUnitsFromCells(cells, cellIds, observerFaction) {
  if (!Array.isArray(cells) || !Array.isArray(cellIds) || !cellIds.length) return [];
  const idSet = new Set(cellIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)));
  const out = [];
  const seen = new Set();
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (!idSet.has(Number(cell.id))) continue;
    const us = cell.units || [];
    for (let ui = 0; ui < us.length; ui++) {
      const unit = us[ui];
      const uf = reportViewerFaction(unit);
      if (uf === "none" || uf === observerFaction) continue;
      const uid = Number(unit.instanceId);
      if (!Number.isFinite(uid) || seen.has(uid)) continue;
      seen.add(uid);
      out.push({
        cellId: Number(cell.id),
        unitInstanceId: uid,
        unitName: battleUnitDisplayName(unit)
      });
    }
  }
  return out;
}
function formatAirMissionOnStationReportLines(entry, cells, text, m) {
  const missionStartM = text.match(/^На задании: юнит (\d+) — «([a-zA-Z]+)», осталось ходов (\d+)/);
  if (!missionStartM) return null;
  const uid = Number(missionStartM[1]);
  const orderKey = String(missionStartM[2]).trim();
  const turnsLeft = missionStartM[3];
  const u = findBattleUnitByInstanceId(cells, uid);
  const orderLabel = orderKey === "intelligenceAir" ? "Авиационная разведка" : battleOrderLabel(orderKey);
  const tac = u?.unit?.tactical as Record<string, unknown> | undefined;
  const sortie = tac?.airSortie as Record<string, unknown> | undefined;
  const targetCellId = Number(tac?.airMissionTargetCellId ?? sortie?.patrolCenterCellId);
  const depCellId = Number(sortie?.departureCellId ?? m?.airSortieLine?.departureCellId);
  const statsParts = [`на задании · осталось ${turnsLeft} х.`];
  if (Number.isFinite(depCellId)) statsParts.push(`вылет: кл. ${depCellId}`);
  if (Number.isFinite(targetCellId)) statsParts.push(`зона: кл. ${targetCellId}`);
  const patrolRange = Number(sortie?.patrolRangeSteps ?? m?.airSortieLine?.patrolRangeSteps);
  if (orderKey === "patrol" && Number.isFinite(patrolRange) && patrolRange > 0) {
    statsParts.push(`радиус: ${patrolRange} гекс.`);
  }
  return {
    order: orderLabel,
    detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${uid}`,
    stats: statsParts.join(" · "),
  };
}

function formatIntelligenceAirMissionReportLines(entry, cells, text, m) {
  const aml = m?.airMissionLine;
  if (aml?.inboundLaunch === true) return null;
  if (aml && String(aml.orderKey || "").trim() === "intelligenceAir") {
    return null;
  }
  const startM = text.match(
    /^Авиационная разведка: юнит (\d+) — вылет с кл\. (\d+), точка кл\. (\d+), (\d+) х\.$/
  );
  if (startM) {
    const u = findBattleUnitByInstanceId(cells, Number(startM[1]));
    return {
      order: "Авиационная разведка",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${startM[1]}`,
      stats: `вылет: кл. ${startM[2]} · точка: кл. ${startM[3]} · длительность: ${startM[4]} х.`
    };
  }
  const activeM = text.match(/^Авиационная разведка: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  if (activeM) return null;
  const doneM = text.match(/^Авиационная разведка завершена: юнит (\d+) — возвращение на базу$/);
  if (doneM) return null;
  const recallM = text.match(/^Отзыв: юнит (\d+) — возвращение на базу$/);
  if (recallM && entry.meta?.airMissionLine?.orderKey === "airReturn") {
    return null;
  }
  return null;
}
function formatAirReturnReportLines(entry, cells, text, m) {
  const aml = m?.airMissionLine;
  const isAirReturnMeta = aml && String(aml.orderKey || "").trim() === "airReturn";
  const returnM = text.match(/^Возвращение: юнит (\d+), (\d+) → база (\d+)/);
  if (returnM || isAirReturnMeta) {
    const uid = Number(returnM?.[1] ?? aml?.unitInstanceId);
    const fromId = Number(returnM?.[2] ?? aml?.fromCellId);
    const baseId = Number(returnM?.[3] ?? aml?.toCellId);
    const u = Number.isFinite(uid) ? findBattleUnitByInstanceId(cells, uid) : null;
    const statsParts = [];
    if (Number.isFinite(fromId)) statsParts.push(`с кл. ${fromId}`);
    if (Number.isFinite(baseId)) statsParts.push(`база: кл. ${baseId}`);
    return {
      order: "Возвращение на базу",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${uid}`,
      stats: statsParts.length ? statsParts.join(" · ") : undefined
    };
  }
  const recallM = text.match(/^Отзыв: юнит (\d+) — возвращение на базу$/);
  if (recallM) {
    const uid = Number(recallM[1]);
    const u = findBattleUnitByInstanceId(cells, uid);
    return {
      order: "Возвращение на базу",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${uid}`,
      stats: "отзыв с задания"
    };
  }
  return null;
}

function unitLabelByInstanceId(cells, instanceId, metaName) {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return "—";
  const u = findBattleUnitByInstanceId(cells, id);
  if (u) return battleUnitDisplayName(u.unit);
  const name = typeof metaName === "string" ? metaName.trim() : "";
  return name || `Юнит ${id}`;
}

function airCombatKindLabel(types, fl, text) {
  if (fl?.patrolInterceptReturn) return "ответ патруля";
  if (fl?.patrolIntercept) return "патруль";
  const t = Array.isArray(types) ? types.map((x) => String(x)) : [];
  if (t.includes("patrol")) return "патруль";
  if (t.includes("interception")) return "перехват";
  if (t.includes("routeIntersection")) return "пересечение маршрутов";
  if (t.includes("ongoing")) return "продолжение боя";
  if (text.includes("(патруль)")) return "патруль";
  if (text.includes("(ответ)")) return "ответ патруля";
  return "";
}

function formatAirCombatShotStats(hits, dmg, rollResults, extraWarDef) {
  const parts = [];
  if (Number.isFinite(Number(hits))) parts.push(`попаданий: ${Number(hits)}`);
  if (Number.isFinite(Number(dmg))) parts.push(`урон: ${Number(dmg)}`);
  if (Array.isArray(rollResults) && rollResults.length) parts.push(`выпало: ${rollResults.join(", ")}`);
  if (extraWarDef) parts.push("бой +1 З");
  return parts.join(" · ");
}

function formatAirCombatReportLines(entry, cells, text, m) {
  const acl = m?.airCombatLine;
  if (acl && acl.interrupted === true) {
    const uid = Number(acl.unitInstanceId);
    const fromId = Number(acl.fromCellId);
    const statsParts = ["приказ прерван"];
    if (Number.isFinite(fromId)) statsParts.push(`гекс: ${fromId}`);
    return {
      order: "Воздушный бой",
      detail: unitLabelByInstanceId(cells, uid),
      stats: statsParts.join(" · ")
    };
  }

  const fl = m?.fireLine;
  if (fl && (fl.patrolIntercept === true || fl.patrolInterceptReturn === true)) {
    const atkId = Number(fl.attackerId);
    const tgtId = Number(fl.targetId);
    const round = Number(fl.combatRound);
    const maxRounds = Number(fl.combatMaxRounds);
    const kind = airCombatKindLabel(null, fl, text);
    const statsParts = [];
    if (kind) statsParts.push(`тип: ${kind}`);
    if (Number.isFinite(round) && Number.isFinite(maxRounds)) statsParts.push(`раунд ${round}/${maxRounds}`);
    const cellId = Number(fl.targetCellId ?? fl.fromCellId);
    if (Number.isFinite(cellId)) statsParts.push(`гекс: ${cellId}`);
    const shotStats = formatAirCombatShotStats(fl.hits, fl.damages, fl.rollResults, text.includes("[бой +1 З]"));
    if (shotStats) statsParts.push(shotStats);
    return {
      order: fl.patrolInterceptReturn ? "Воздушный бой (ответ)" : "Воздушный бой (патруль)",
      detail: `${unitLabelByInstanceId(cells, atkId)} → ${unitLabelByInstanceId(cells, tgtId)}`,
      stats: statsParts.join(" · ")
    };
  }

  if (acl && Array.isArray(acl.roundShots) && acl.roundShots.length) {
    const kind = airCombatKindLabel(acl.types, null, text);
    const cellId = Number(acl.cellId);
    const shots = acl.roundShots.map((s) => {
      const atk = unitLabelByInstanceId(cells, s.attackerId);
      const def = unitLabelByInstanceId(cells, s.targetId);
      const st = formatAirCombatShotStats(s.hits, s.damages, s.rollResults);
      return `${atk} → ${def}${st ? ` (${st})` : ""}`;
    });
    const statsParts = [];
    if (kind) statsParts.push(`тип: ${kind}`);
    if (Number.isFinite(cellId)) statsParts.push(`гекс: ${cellId}`);
    statsParts.push(`залпов: ${shots.length}`);
    return {
      order: "Воздушный бой",
      detail: shots.join("; "),
      stats: statsParts.join(" · ")
    };
  }

  const patrolRoundM = text.match(
    /^Воздушный бой \((патруль|ответ)\) · раунд (\d+)\/(\d+): (\d+) → (\d+) · попаданий (\d+), урон (\d+)(?: \[бой \+1 З\])? · выпало: ([\d, ]+)$/,
  );
  if (patrolRoundM) {
    const kind = patrolRoundM[1] === "ответ" ? "ответ патруля" : "патруль";
    const rolls = patrolRoundM[8].split(",").map((x) => x.trim()).filter(Boolean);
    return {
      order: patrolRoundM[1] === "ответ" ? "Воздушный бой (ответ)" : "Воздушный бой (патруль)",
      detail: `${unitLabelByInstanceId(cells, patrolRoundM[4])} → ${unitLabelByInstanceId(cells, patrolRoundM[5])}`,
      stats: [
        `тип: ${kind}`,
        `раунд ${patrolRoundM[2]}/${patrolRoundM[3]}`,
        formatAirCombatShotStats(patrolRoundM[6], patrolRoundM[7], rolls, text.includes("[бой +1 З]"))
      ].filter(Boolean).join(" · ")
    };
  }

  const shotM = text.match(
    /^Воздушный бой: (\d+) → (\d+) · попаданий (\d+), урон (\d+)(?: \[бой \+1 З\])? · выпало: ([\d, ]+)$/,
  );
  if (shotM) {
    const rolls = shotM[5].split(",").map((x) => x.trim()).filter(Boolean);
    return {
      order: "Воздушный бой",
      detail: `${unitLabelByInstanceId(cells, shotM[1])} → ${unitLabelByInstanceId(cells, shotM[2])}`,
      stats: formatAirCombatShotStats(shotM[3], shotM[4], rolls, text.includes("[бой +1 З]"))
    };
  }

  const summaryM = text.match(/^Воздушный бой · гекс (\d+): участники \[([^\]]+)\] — одновременная стрельба \((\d+) залпов\)$/);
  if (summaryM) {
    const ids = summaryM[2].split(",").map((x) => x.trim()).filter(Boolean);
    const names = ids.map((id) => unitLabelByInstanceId(cells, id)).join(", ");
    return {
      order: "Воздушный бой",
      detail: names || `участники: ${summaryM[2]}`,
      stats: `гекс: ${summaryM[1]} · залпов: ${summaryM[3]}`
    };
  }

  const steadfastM = text.match(/^Воздушный бой · стойкость: юнит (\d+) — (.+)$/);
  if (steadfastM) return null;

  const interruptM = text.match(/^Воздушный бой: юнит (\d+) — приказ прерван$/);
  if (interruptM) {
    return {
      order: "Воздушный бой",
      detail: unitLabelByInstanceId(cells, interruptM[1]),
      stats: "приказ прерван"
    };
  }

  const noAmmoM = text.match(/^Воздушный бой: юнит (\d+) — нет БК$/);
  if (noAmmoM) return null;

  return null;
}

function isAirStrikeReportEntry(ph, m, text, fl) {
  if (ph !== 4) return true;
  const strikeKeys = new Set(["attackAir", "bombardment"]);
  const missionKey = String(m?.airMissionLine?.orderKey ?? "").trim();
  const flOrder = String(fl?.airOrderKey ?? "").trim();
  return (
    strikeKeys.has(missionKey) ||
    strikeKeys.has(flOrder) ||
    fl?.groupedAreaFire === true ||
    fl?.areaFireOnly === true ||
    /^(Штурмовка|Бомбардировка):/i.test(text) ||
    /^Авиаудар «(?:attackAir|bombardment)»/.test(text)
  );
}

function formatAirStrikeReportLines(entry, cells, text, m) {
  const ph = entry.phase ?? 0;
  if (ph !== 4) return null;
  const fl = m?.fireLine;
  if (!fl || fl.patrolIntercept || fl.patrolInterceptReturn) return null;
  if (!isAirStrikeReportEntry(ph, m, text, fl)) return null;

  const ok = fireReportOrderKey(ph, fl, m?.airMissionLine);
  const stats = formatFireReportStats(fl, text);
  const aid = Number(fl.attackerId);
  const tid = fl.targetId != null ? Number(fl.targetId) : null;
  const cellId = fl.targetCellId != null ? Number(fl.targetCellId) : null;
  const atkLabel = Number.isFinite(aid) ? unitLabelByInstanceId(cells, aid) : null;

  const strikeSummaryM = text.match(
    /^(Штурмовка|Бомбардировка): ([\d+]+) → кл\. (\d+) · попаданий (\d+), (.+?) \(выпало: ([^)]+)\)/,
  );
  if (strikeSummaryM && atkLabel) {
    return {
      order: strikeSummaryM[1],
      detail: `${atkLabel} → кл. ${strikeSummaryM[3]} · ${strikeSummaryM[5]}`,
      stats: `попаданий: ${strikeSummaryM[4]} · выпало: ${strikeSummaryM[6]}`
    };
  }

  const airStrikeEmptyM = text.match(/^Авиаудар «(\w+)»: юнит (\d+) → кл\. (\d+)/);
  if (airStrikeEmptyM) {
    const uid = Number(airStrikeEmptyM[2]);
    const cid = Number(airStrikeEmptyM[3]);
    return {
      order: battleOrderLabel(String(airStrikeEmptyM[1])),
      detail: `${unitLabelByInstanceId(cells, uid)} → кл. ${cid}`,
      stats: fl.areaFireOnly ? "нет целей на клетке" : stats
    };
  }

  if (atkLabel) {
    if (tid != null && Number.isFinite(tid)) {
      const tgtLabel = unitLabelByInstanceId(cells, tid);
      const dmg = Number(fl.damages);
      const destroyed = Number.isFinite(dmg) && dmg > 0 && !findBattleUnitByInstanceId(cells, tid);
      return {
        order: battleOrderLabel(ok),
        detail: destroyed
          ? `${atkLabel} → ${tgtLabel} · уничтожен`
          : `${atkLabel} → ${tgtLabel}`,
        stats
      };
    }
    if (Number.isFinite(cellId)) {
      return {
        order: battleOrderLabel(ok),
        detail: `${atkLabel} → кл. ${cellId}${fl.areaFireOnly ? " (нет целей)" : ""}`,
        stats
      };
    }
  }

  return null;
}

function formatAirFlightProgressReportLines(entry, cells, text, m) {
  return null;
}

function formatAirAppearanceDepartureStats(cells, uid, asl) {
  const u = Number.isFinite(uid) ? findBattleUnitByInstanceId(cells, uid) : null
  const sortie = (u?.unit?.tactical as Record<string, unknown> | undefined)?.airSortie as
    | Record<string, unknown>
    | undefined
  const depCellId = Number(
    asl?.departureCellId ?? sortie?.departureCellId ?? u?.cell?.id,
  )
  if (Number.isFinite(depCellId)) return `вылет: кл. ${depCellId}`
  return undefined
}

function formatAirAppearanceReportLines(entry, cells, text, m) {
  const aml = m?.airMissionLine;
  if (aml?.inboundLaunch === true) return null;

  const asl = m?.airSortieLine;
  if (asl?.appearance === true) {
    const uid = Number(asl.unitInstanceId);
    const u = Number.isFinite(uid) ? findBattleUnitByInstanceId(cells, uid) : null;
    return {
      order: "Авиация",
      detail: u ? `${battleUnitDisplayName(u.unit)} — в небе` : `Юнит ${uid} — в небе`,
      stats: formatAirAppearanceDepartureStats(cells, uid, asl),
    };
  }
  const appearM = text.match(/^В небе появился самолёт: юнит (\d+)$/);
  if (appearM) {
    const uid = Number(appearM[1]);
    const u = findBattleUnitByInstanceId(cells, uid);
    return {
      order: "Авиация",
      detail: u ? `${battleUnitDisplayName(u.unit)} — в небе` : `Юнит ${uid} — в небе`,
      stats: formatAirAppearanceDepartureStats(cells, uid, m?.airSortieLine),
    };
  }
  if (m?.airSortieLine && !asl?.appearance && text.startsWith("Полёт:")) {
    return null;
  }
  return null;
}

function formatPatrolMissionReportLines(entry, cells, text, m) {
  const aml = m?.airMissionLine;
  if (aml?.inboundLaunch === true) return null;
  if (aml && String(aml.orderKey || "").trim() === "patrol") {
    const uid = Number(aml.unitInstanceId);
    const u = Number.isFinite(uid) ? findBattleUnitByInstanceId(cells, uid) : null;
    const fromId = Number(aml.fromCellId);
    const toId = Number(aml.toCellId);
    const patrolRange = Number(aml.patrolRangeSteps);
    const maxTurns = Number(aml.patrolTurnsMax);
    const statsParts = [];
    if (Number.isFinite(fromId)) statsParts.push(`вылет: кл. ${fromId}`);
    if (Number.isFinite(toId)) statsParts.push(`зона: кл. ${toId}`);
    if (Number.isFinite(patrolRange) && patrolRange > 0) statsParts.push(`радиус: ${patrolRange} гекс.`);
    if (Number.isFinite(maxTurns) && maxTurns > 0) statsParts.push(`длительность: ${maxTurns} х.`);
    return {
      order: "Патрулирование",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${uid}`,
      stats: statsParts.length ? statsParts.join(" · ") : undefined
    };
  }
  if (m?.airSortieLine && String(m.airSortieLine.orderKey || "").trim() === "patrol" && !text.startsWith("На задании:")) {
    return null;
  }
  const startM = text.match(/^Патрулирование: юнит (\d+), вылет (\d+) → назначение (\d+)/);
  if (startM) {
    const u = findBattleUnitByInstanceId(cells, Number(startM[1]));
    return {
      order: "Патрулирование",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${startM[1]}`,
      stats: `вылет: кл. ${startM[2]} · зона: кл. ${startM[3]}`
    };
  }
  const activeM = text.match(/^На задании: юнит (\d+) — «patrol», осталось ходов (\d+)/);
  if (activeM) return null;
  const patrolActiveM = text.match(/^Патрулирование: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  if (patrolActiveM) {
    const u = findBattleUnitByInstanceId(cells, Number(patrolActiveM[1]));
    return {
      order: "Патрулирование",
      detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${patrolActiveM[1]}`,
      stats: `на задании · осталось ${patrolActiveM[2]} х.`
    };
  }
  const doneM = text.match(/^Патруль\/разведка завершены: юнит (\d+) — возвращение на базу$/);
  if (doneM) return null;
  const recallM = text.match(/^Отзыв: юнит (\d+) — возвращение на базу$/);
  if (recallM && entry.meta?.airMissionLine?.orderKey === "airReturn") {
    return null;
  }
  return null;
}
function desantParatrooperLabel(cells, instanceId) {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return "—";
  const u = findBattleUnitByInstanceId(cells, id);
  return u ? battleUnitDisplayName(u.unit) : `Отряд ${id}`;
}
function desantPlaneLabel(cells, instanceId) {
  const id = Number(instanceId);
  if (!Number.isFinite(id)) return "—";
  const u = findBattleUnitByInstanceId(cells, id);
  return u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`;
}
function desantTerrainLabel(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (k === "light") return "лёгкая";
  if (k === "medium") return "средняя";
  if (k === "heavy") return "тяжёлая";
  return k || "—";
}
function formatDesantMissionReportLines(entry, cells, text, m) {
  const dll = m?.desantLandingLine;
  if (dll) {
    const uid = Number(dll.unitInstanceId);
    const cellId = Number(dll.targetCellId);
    const loss = Number(dll.loss);
    const roll = dll.roll;
    const terrain = desantTerrainLabel(dll.terrainClass);
    const statsParts = [`тест приземления · ${terrain} местность`];
    if (roll != null && Number.isFinite(Number(roll))) statsParts.push(`d6=${roll}`);
    if (Number.isFinite(loss) && loss > 0) statsParts.push(`потери ${loss}`);
    if (Number.isFinite(cellId)) statsParts.push(`кл. ${cellId}`);
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, uid),
      stats: statsParts.join(" · ")
    };
  }

  const aml = m?.airMissionLine;
  if (aml?.inboundLaunch === true) return null;
  if (aml && String(aml.orderKey || "").trim() === "desant") {
    const uid = Number(aml.unitInstanceId);
    const step = Number(aml.desantStep);
    if (step === 1) return null;
    if (step === 2) return null;
    const stepMax = Number(aml.desantStepMax) || 3;
    const fromId = Number(aml.fromCellId);
    const toId = Number(aml.toCellId);
    const statsParts = [];
    if (Number.isFinite(step) && step > 0) statsParts.push(`ход ${step}/${stepMax}`);
    if (step === 1) {
      statsParts.push("вылет");
      if (Number.isFinite(fromId)) statsParts.push(`база: кл. ${fromId}`);
      if (Number.isFinite(toId)) statsParts.push(`цель: кл. ${toId}`);
    } else if (step === 2) {
      statsParts.push("десантирование");
      if (Number.isFinite(toId)) statsParts.push(`кл. ${toId}`);
    } else if (step === 3) {
      statsParts.push("возвращение на базу");
      if (Number.isFinite(toId)) statsParts.push(`база: кл. ${toId}`);
      if (Number.isFinite(fromId)) statsParts.push(`с кл. ${fromId}`);
    }
    return {
      order: "Десант",
      detail: desantPlaneLabel(cells, uid),
      stats: statsParts.length ? statsParts.join(" · ") : undefined
    };
  }

  const step1M = text.match(
    /^Десант · ход 1\/3 — вылет: юнит (\d+), десантники на борту \((.+)\), цель кл\. (\d+)$/
  );
  if (step1M) return null;
  const step2M = text.match(/^Десант · ход 2\/3 — десантирование: юнит (\d+) → кл\. (\d+)$/);
  if (step2M) return null;
  const step3M = text.match(/^Десант · ход 3\/3 — возвращение на базу: юнит (\d+)$/);
  if (step3M) {
    return {
      order: "Десант",
      detail: desantPlaneLabel(cells, Number(step3M[1])),
      stats: "ход 3/3 · возвращение на базу"
    };
  }
  const step2FailM = text.match(/^Десант · ход 2\/3: юнит (\d+) — клетка (\d+) не найдена$/);
  if (step2FailM) {
    return {
      order: "Десант",
      detail: desantPlaneLabel(cells, Number(step2FailM[1])),
      stats: `ход 2/3 · ошибка · кл. ${step2FailM[2]} не найдена`
    };
  }
  const noCargoM = text.match(/^Десант: юнит (\d+) — на борту нет десантников$/);
  if (noCargoM) {
    return {
      order: "Десант",
      detail: desantPlaneLabel(cells, Number(noCargoM[1])),
      stats: "приказ отменён · нет десантников на борту"
    };
  }
  const landingTestM = text.match(
    /^Десант · тест приземления \((\w+)\): отряд (\d+), d6=(\d+|\w+), потери (\d+)$/
  );
  if (landingTestM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(landingTestM[2])),
      stats: `тест приземления · ${desantTerrainLabel(landingTestM[1])} · d6=${landingTestM[3]} · потери ${landingTestM[4]}`
    };
  }
  const landMeleeM = text.match(
    /^Десант: отряд (\d+) высадился на кл\. (\d+) с противником — ближний бой \(половинные З\/IO\)$/
  );
  if (landMeleeM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(landMeleeM[1])),
      stats: `высадка · кл. ${landMeleeM[2]} · ближний бой · половинные З/IO`
    };
  }
  const landM = text.match(/^Десант: отряд (\d+) высадился на кл\. (\d+)$/);
  if (landM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(landM[1])),
      stats: `высадка · кл. ${landM[2]}`
    };
  }
  const landFailM = text.match(
    /^Десант: отряд (\d+) — высадка на кл\. (\d+) невозможна \(местность или переполнение\)$/
  );
  if (landFailM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(landFailM[1])),
      stats: `высадка не удалась · кл. ${landFailM[2]}`
    };
  }
  const equipM = text.match(/^Десант · снаряжение: отряд (\d+) — приказы недоступны, половинные З\/IO$/);
  if (equipM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(equipM[1])),
      stats: "снаряжение · приказы недоступны · половинные З/IO"
    };
  }
  const waterM = text.match(
    /^Десант: отряд (\d+) — после высадки на водную\/болотную местность только «Боевое положение»$/
  );
  if (waterM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(waterM[1])),
      stats: "водная/болотная высадка · только «Боевое положение»"
    };
  }
  const equipWaterM = text.match(
    /^Десант: отряд (\d+) — после снаряжения только «Боевое положение»$/
  );
  if (equipWaterM) {
    return {
      order: "Десант",
      detail: desantParatrooperLabel(cells, Number(equipWaterM[1])),
      stats: "после снаряжения · только «Боевое положение»"
    };
  }
  return null;
}
function isFireReportPhase(ph) {
  return ph === 2 || ph === 3 || ph === 4;
}
function fireReportOrderKey(ph, fl, aml) {
  if (ph === 2) return "fireHard";
  if (ph === 3) return "fire";
  const missionKey = String(aml?.orderKey ?? "").trim();
  if (missionKey) return missionKey;
  const ak = String(fl?.airOrderKey ?? "").trim();
  if (ak) return ak;
  return "attackAir";
}
export function battleUnitDisplayName(unit) {
  if (!unit) return "—";
  for (const k of ["name", "unitName", "title", "label"]) {
    const v = unit[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const t = unit.type;
  if (typeof t === "string" && t.trim()) return t.trim();
  const id = unit.instanceId;
  return id != null ? `Юнит ${id}` : "—";
}
export function parseLogisticsMetaFromText(text) {
  const gs = text.match(/^Передача БК: грузовик (\d+) → (\d+), \+(\d+)/);
  if (gs) {
    return {
      orderKey: "getSup",
      fromInstanceId: Number(gs[1]),
      toInstanceId: Number(gs[2]),
      amount: Number(gs[3])
    };
  }
  const ls = text.match(/^Загрузка со склада: грузовик (\d+) ← кл\. (\d+), \+(\d+)/);
  if (ls) {
    return {
      orderKey: "loadingSup",
      fromInstanceId: Number(ls[1]),
      toCellId: Number(ls[2]),
      amount: Number(ls[3])
    };
  }
  const ld = text.match(/^Погрузка: пехота (\d+) в кузов (\d+)/);
  if (ld) {
    return { orderKey: "loading", fromInstanceId: Number(ld[2]), toInstanceId: Number(ld[1]) };
  }
  const tw = text.match(/^Буксир: орудие (\d+) в кузов (\d+)/);
  if (tw) {
    return { orderKey: "tow", fromInstanceId: Number(tw[2]), toInstanceId: Number(tw[1]) };
  }
  const ul = text.match(/^Выгрузка: (\d+) → клетка (\d+)/);
  if (ul) {
    return {
      orderKey: "unloading",
      toInstanceId: Number(ul[1]),
      toCellId: Number(ul[2])
    };
  }
  return null;
}
export function battleLogEntriesLatestTurn(log) {
  if (!log?.length) return [];
  let max = -Infinity;
  for (const e of log) {
    if (typeof e.turn === "number" && Number.isFinite(e.turn)) max = Math.max(max, e.turn);
  }
  if (!Number.isFinite(max) || max < 0) return log;
  return log.filter(
    (e) => e.turn === max && !String(e.text ?? "").trim().startsWith("Атака-подход:")
  );
}

export function battleLogHasAirAppearanceForUnit(log, unitInstanceId) {
  const uid = Number(unitInstanceId);
  if (!Number.isFinite(uid)) return false;
  for (const e of log ?? []) {
    const asl = e?.meta?.airSortieLine;
    if (asl?.appearance === true && Number(asl.unitInstanceId) === uid) return true;
    const m = String(e?.text ?? "").match(/^В небе появился самолёт: юнит (\d+)$/);
    if (m && Number(m[1]) === uid) return true;
  }
  return false;
}

/** Пока resolve ещё не прошёл — «в небе» на ходу orderTurn+1 по состоянию юнита. */
export function collectSyntheticAirAppearanceReportRows(cells, battleTurnIndex, battleLog) {
  const rows = [];
  const turn = Number(battleTurnIndex);
  if (!Number.isFinite(turn) || turn < 0 || !Array.isArray(cells)) return rows;

  for (const cell of cells) {
    for (const unit of cell.units ?? []) {
      if (!isAirUnitInboundInSkyForTurn(unit, turn)) continue;
      const sortie = unit?.tactical?.airSortie;
      const orderTurn = Number(sortie?.inboundOrderTurn);
      if (!Number.isFinite(orderTurn) || turn !== orderTurn + 1) continue;
      const uid = Number(unit.instanceId);
      if (!Number.isFinite(uid)) continue;
      if (battleLogHasAirAppearanceForUnit(battleLog, uid)) continue;

      const path = readFlightPathCellIdsFromUnit(unit);
      const depId = Number(sortie?.departureCellId) || Number(cell.id);
      const edgeId = path.length ? path[0] : null;
      rows.push({
        unitInstanceId: uid,
        formatted: {
          order: "Авиация",
          detail: `${battleUnitDisplayName(unit)} — в небе`,
          stats: Number.isFinite(depId) ? `вылет: кл. ${depId}` : undefined,
        },
        replay: {
          kind: "airAppearance",
          unitInstanceId: uid,
          departureCellId: Number.isFinite(depId) ? depId : undefined,
          flightCellId: edgeId != null && Number.isFinite(Number(edgeId)) ? Number(edgeId) : undefined,
          orderKey: String(sortie?.activeOrderKey ?? unit?.tactical?.airMissionOrderKey ?? "").trim() || undefined,
        },
      });
    }
  }
  return rows;
}

export function formatFireReportStats(fireLine, text) {
  if (fireLine && typeof fireLine.hits === "number" && Number.isFinite(fireLine.hits)) {
    const rolls = Array.isArray(fireLine.rollResults) ? fireLine.rollResults : [];
    if (rolls.length > 0) {
      const nums = rolls.join(", ");
      return `интенсивность огня: ${rolls.length} · попаданий: ${fireLine.hits} · выпало: ${nums}`;
    }
    return `попаданий: ${fireLine.hits}`;
  }
  const parsed = parseFireStatsFromLogText(String(text ?? ""));
  if (parsed) return parsed;
  const m = String(text ?? "").match(/попаданий (\d+)/);
  if (m) return `попаданий: ${m[1]}`;
  return void 0;
}
export function formatRollStatsLine(opts) {
  const rolls = opts.rollResults;
  if (!rolls?.length) return void 0;
  const parts = [];
  if (opts.hits !== void 0 && opts.hits !== null) parts.push(`попадания: ${opts.hits}`);
  parts.push(`урон: ${opts.damages ?? 0}`);
  const numbersStr = rolls.join(", ");
  if (opts.isSuppression && opts.baseDiceCount != null && opts.baseDiceCount > 0) {
    const extra = rolls.length - opts.baseDiceCount;
    parts.push(
      `интенсивность огня: ${rolls.length} · числа: ${numbersStr} · подавление ×1,5: ${opts.baseDiceCount}→${rolls.length} (+${extra})`
    );
  } else {
    parts.push(`интенсивность огня: ${rolls.length} · числа: ${numbersStr}`);
  }
  let s = parts.join(" · ");
  if (opts.warDef) s += " · бой +1 З";
  if (opts.ammoSpent != null && opts.ammoSpent > 0) s += ` · БК −${opts.ammoSpent}`;
  return s;
}
export function parseFireStatsFromLogText(text) {
  const m = text.match(/попаданий (\d+), урон (\d+) \((?:к6|выпало): ([^)]+)\)/);
  if (m) {
    const rolls = m[3].split(",").map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n));
    const warDef = /\[[бой +1 З]+\]/.test(text) || text.includes("бой +1 З");
    return formatRollStatsLine({
      hits: Number(m[1]),
      damages: Number(m[2]),
      rollResults: rolls,
      warDef
    });
  }
  const mArea = text.match(/попаданий (\d+), .*\(выпало: ([^)]+)\)/);
  if (mArea) {
    let dmgSum = 0;
    for (const x of text.matchAll(/\d+: урон (\d+)/g)) {
      const d = Number(x[1]);
      if (Number.isFinite(d)) dmgSum += d;
    }
    const rolls = mArea[2].split(",").map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n));
    const warDef = /\[[бой +1 З]+\]/.test(text) || text.includes("бой +1 З");
    return formatRollStatsLine({
      hits: Number(mArea[1]),
      damages: dmgSum,
      rollResults: rolls,
      warDef
    });
  }
  return void 0;
}
export function parseAttackStatsFromLogText(text) {
  const m = text.match(/урон (\d+) \((?:к6|выпало): ([^)]+)\)/);
  if (!m) return void 0;
  const rolls = m[2].split(",").map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n));
  return formatRollStatsLine({ damages: Number(m[1]), rollResults: rolls });
}
export function formatAttackReportStats(attackLine, text) {
  const rolls = Array.isArray(attackLine?.rollResults)
    ? attackLine.rollResults.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : [];
  if (rolls.length) {
    const parts = [];
    parts.push(`урон: ${Number(attackLine?.damages) || 0}`);
    parts.push(`интенсивность огня: ${rolls.length}`);
    parts.push(`числа: ${rolls.join(", ")}`);
    return parts.join(" · ");
  }
  return parseAttackStatsFromLogText(text);
}
function reportViewerFaction(unit) {
  const f = String(unit?.faction || "").toLowerCase();
  if (f === "germany" || f === "wehrmacht") return "wehrmacht";
  if (f === "ussr" || f === "rkka") return "rkka";
  return "none";
}
function reportFactionsOpposed(a, b) {
  return a !== "none" && b !== "none" && a !== b;
}
function isFriendlyToViewerForReport(unit, viewerFaction) {
  if (viewerFaction === "none" || !unit) return true;
  return !reportFactionsOpposed(reportViewerFaction(unit), viewerFaction);
}
function formatFireLineRedactedIfNeeded(entry, cells, viewerFaction, fogRevealedCellIds) {
  const ph = entry.phase ?? 0;
  if (!isFireReportPhase(ph)) return null;
  const fl = entry.meta?.fireLine;
  if (!fl || fl.attackerId == null) return null;
  const aLive = findBattleUnitByInstanceId(cells, Number(fl.attackerId));
  if (!aLive) return null;
  if (!reportFactionsOpposed(reportViewerFaction(aLive.unit), viewerFaction)) return null;
  if (fogRevealedCellIds.has(aLive.cell.id)) return null;
  const names = [];
  const addVictim = (tid) => {
    if (tid == null || !Number.isFinite(Number(tid))) return;
    const tLive = findBattleUnitByInstanceId(cells, Number(tid));
    if (!tLive || !isFriendlyToViewerForReport(tLive.unit, viewerFaction)) return;
    names.push(battleUnitDisplayName(tLive.unit));
  };
  addVictim(fl.targetId);
  const ats = fl.areaTargets;
  if (Array.isArray(ats)) {
    for (let i = 0; i < ats.length; i++) addVictim(ats[i]?.targetId);
  }
  const uniqueNames = names.filter((name, idx) => names.indexOf(name) === idx);
  if (!uniqueNames.length) return null;
  const ok = fireReportOrderKey(ph, fl);
  const text = String(entry.text ?? "");
  const stats = formatFireReportStats(fl, text);
  return {
    order: battleOrderLabel(ok),
    detail: `Кто-то вёл огонь из тумана по: ${uniqueNames.join("; ")}`,
    stats
  };
}
function formatAttackLineRedactedIfNeeded(entry, cells, viewerFaction, fogRevealedCellIds) {
  const ph = entry.phase ?? 0;
  if (ph !== 5) return null;
  const al = entry.meta?.attackLine;
  if (!al || al.attackerId == null || al.targetId == null) return null;
  const aLive = findBattleUnitByInstanceId(cells, Number(al.attackerId));
  const bLive = findBattleUnitByInstanceId(cells, Number(al.targetId));
  if (!aLive || !bLive) return null;
  if (!reportFactionsOpposed(reportViewerFaction(aLive.unit), viewerFaction)) return null;
  if (fogRevealedCellIds.has(aLive.cell.id)) return null;
  if (!isFriendlyToViewerForReport(bLive.unit, viewerFaction)) return null;
  const attackStats = al?.rollResults?.length ? formatRollStatsLine({
    hits: al.hits,
    damages: al.damages,
    rollResults: al.rollResults
  }) : parseAttackStatsFromLogText(String(entry.text ?? ""));
  return {
    order: battleOrderLabel("attack"),
    detail: `Атака из тумана по: ${battleUnitDisplayName(bLive.unit)}`,
    stats: attackStats
  };
}

export function battleReportEntryShouldOmit(entry, cells, viewerFaction, fogRevealedCellIds) {
  if (viewerFaction === "none" || viewerFaction == null || fogRevealedCellIds == null) return false;
  const ph = entry.phase ?? 0;
  if (ph < 0) return false;
  const m = entry.meta;
  const text = String(entry.text ?? "");
  const enemyHiddenOnCell = (unitRec, cell) => {
    if (!unitRec || !cell) return false;
    if (!reportFactionsOpposed(reportViewerFaction(unitRec), viewerFaction)) return false;
    return !fogRevealedCellIds.has(cell.id);
  };
  if (ph === 8) {
    const uidRaw = m?.unitInstanceId ?? (text.match(/юнит (\d+)/)?.[1] ? Number(text.match(/юнит (\d+)/)?.[1]) : NaN);
    if (!Number.isFinite(uidRaw)) return false;
    const live = findBattleUnitByInstanceId(cells, uidRaw);
    if (!live) return false;
    return enemyHiddenOnCell(live.unit, live.cell);
  }
  if (isFireReportPhase(ph)) {
    const fl = m?.fireLine;
    if (!fl || fl.attackerId == null) return false;
    const aLive = findBattleUnitByInstanceId(cells, Number(fl.attackerId));
    if (!aLive) return false;
    if (!enemyHiddenOnCell(aLive.unit, aLive.cell)) return false;
    const hitFriend = (tid) => {
      if (tid == null || !Number.isFinite(Number(tid))) return false;
      const t = findBattleUnitByInstanceId(cells, Number(tid));
      return Boolean(t && isFriendlyToViewerForReport(t.unit, viewerFaction));
    };
    if (hitFriend(fl.targetId)) return false;
    const ats = fl.areaTargets;
    if (Array.isArray(ats)) {
      for (let i = 0; i < ats.length; i++) {
        if (hitFriend(ats[i]?.targetId)) return false;
      }
    }
    return true;
  }
  if (ph === 5) {
    const al = m?.attackLine;
    if (!al || al.attackerId == null) return false;
    const aLive = findBattleUnitByInstanceId(cells, Number(al.attackerId));
    if (!aLive) return false;
    if (!enemyHiddenOnCell(aLive.unit, aLive.cell)) return false;
    if (al.targetId != null) {
      const t = findBattleUnitByInstanceId(cells, Number(al.targetId));
      if (t && isFriendlyToViewerForReport(t.unit, viewerFaction)) return false;
    }
    return true;
  }
  if (ph === 1 || ph === 6) {
    const idRaw = m?.unitInstanceId;
    const idFromText =
      ph === 1
        ? text.match(/Оборона: юнит (\d+)/)?.[1] ?? text.match(/[Сс]ектор обстрела: артиллерия (\d+)/)?.[1]
        : text.match(/Засада: юнит (\d+)/)?.[1] ?? text.match(/[Зз]асада: артиллерия (\d+)/i)?.[1];
    const id = idRaw != null && Number.isFinite(Number(idRaw)) ? Number(idRaw) : idFromText ? Number(idFromText) : NaN;
    if (!Number.isFinite(id)) return false;
    const live = findBattleUnitByInstanceId(cells, id);
    if (!live) return false;
    return enemyHiddenOnCell(live.unit, live.cell);
  }
  if (ph === 7) {
    const ll = m?.logisticsLine ?? parseLogisticsMetaFromText(text);
    if (!ll) return false;
    const ids = [];
    if (ll.fromInstanceId != null) ids.push(Number(ll.fromInstanceId));
    if (ll.toInstanceId != null) ids.push(Number(ll.toInstanceId));
    const lives = [];
    for (let i = 0; i < ids.length; i++) {
      const L = findBattleUnitByInstanceId(cells, ids[i]);
      if (L) lives.push(L);
    }
    if (!lives.length) return false;
    for (let i = 0; i < lives.length; i++) {
      if (isFriendlyToViewerForReport(lives[i].unit, viewerFaction)) return false;
    }
    let allEnemyHidden = true;
    for (let i = 0; i < lives.length; i++) {
      if (fogRevealedCellIds.has(lives[i].cell.id)) {
        allEnemyHidden = false;
        break;
      }
    }
    return allEnemyHidden;
  }
  const hiddenEnemyById = (rawId) => {
    const id = Number(rawId);
    if (!Number.isFinite(id)) return false;
    const live = findBattleUnitByInstanceId(cells, id);
    if (!live) return false;
    return enemyHiddenOnCell(live.unit, live.cell);
  };
  const rawUnitMentions = [
    text.match(/^Подавление снято: юнит (\d+)/)?.[1],
    text.match(/^Ход: юнит (\d+) не завершил движение/)?.[1],
    text.match(/^Оборона: юнит (\d+)/)?.[1],
    text.match(/^Засада: юнит (\d+)/)?.[1],
    text.match(/^Сектор обстрела: артиллерия (\d+)/)?.[1],
    text.match(/^Развёртывание: артиллерия (\d+)/)?.[1],
    text.match(/^Смена сектора: артиллерия (\d+)/)?.[1],
    text.match(/^Артиллерия (\d+): свёрнута/)?.[1],
  ].filter(Boolean);
  if (rawUnitMentions.length > 0) {
    const allHiddenEnemy = rawUnitMentions.every((id) => hiddenEnemyById(id));
    if (allHiddenEnemy) return true;
  }
  const responseFire = text.match(/^Ответ с (?:обороны|засады): (\d+) → (\d+)/);
  if (responseFire) {
    const attackerHiddenEnemy = hiddenEnemyById(responseFire[1]);
    if (attackerHiddenEnemy) {
      const target = findBattleUnitByInstanceId(cells, Number(responseFire[2]));
      const targetFriendly = Boolean(target && isFriendlyToViewerForReport(target.unit, viewerFaction));
      if (!targetFriendly) return true;
    }
  }
  const sectorFire = text.match(/^Огонь с (?:обороны|засады)(?: \([^)]*\))?: (\d+) → (\d+)/);
  if (sectorFire) {
    const attackerHiddenEnemy = hiddenEnemyById(sectorFire[1]);
    if (attackerHiddenEnemy) {
      const target = findBattleUnitByInstanceId(cells, Number(sectorFire[2]));
      const targetFriendly = Boolean(target && isFriendlyToViewerForReport(target.unit, viewerFaction));
      if (!targetFriendly) return true;
    }
  }
  return false;
}
function airSectorShotKindLabel(kind) {
  const k = String(kind || "").trim();
  if (k === "strike") return "налёт на цель";
  if (k === "return-entry") return "возвращение, вход в сектор";
  return "вход в сектор";
}

function parseArtilleryAirSectorLogText(text) {
  const m = String(text || "").match(
    /^(?:Огонь ПВО|Сектор артиллерии): (\d+) → (?:авиация )?(\d+) \(([^,]+), кл\. (\d+)\)/,
  );
  if (!m) return null;
  return {
    shooterInstanceId: Number(m[1]),
    targetInstanceId: Number(m[2]),
    shotKindLabel: String(m[3] || "").trim(),
    targetCellId: Number(m[4]),
  };
}

function formatArtilleryAirSectorReportLines(entry, cells, text, m) {
  const fl = m?.fireLine;
  const fromText = parseArtilleryAirSectorLogText(text);
  const isSector =
    fl?.artilleryAirSector === true ||
    text.startsWith("Огонь ПВО:") ||
    text.startsWith("Сектор артиллерии:");
  if (!isSector) return null;

  const shooterId = fl?.attackerId ?? fromText?.shooterInstanceId;
  const targetId = fl?.targetId ?? fromText?.targetInstanceId;
  const cellId = fl?.targetCellId ?? fromText?.targetCellId;
  const kind =
    fl?.airSectorShotKind != null
      ? airSectorShotKindLabel(fl.airSectorShotKind)
      : fromText?.shotKindLabel || "вход в сектор";

  const shooter = shooterId != null ? findBattleUnitByInstanceId(cells, Number(shooterId)) : null;
  const target = targetId != null ? findBattleUnitByInstanceId(cells, Number(targetId)) : null;
  const shooterLabel = shooter ? battleUnitDisplayName(shooter.unit) : `Юнит ${shooterId ?? "?"}`;
  const targetLabel = target ? battleUnitDisplayName(target.unit) : `Авиация ${targetId ?? "?"}`;
  const cellPart =
    cellId != null && Number.isFinite(Number(cellId)) ? ` · кл. ${Number(cellId)}` : "";

  return {
    order: "Огонь ПВО",
    detail: `Стрелок: ${shooterLabel} · Цель: ${targetLabel} (${kind}${cellPart})`,
    stats: formatFireReportStats(fl, text),
  };
}

export function formatBattleReportLines(entry, cells, reportCtx) {
  const ph = entry.phase ?? 0;
  const text = String(entry.text ?? "");
  const m = entry.meta;
  const desantFormatted = formatDesantMissionReportLines(entry, cells, text, m);
  if (desantFormatted) return desantFormatted;
  const flightProgressFormatted = formatAirFlightProgressReportLines(entry, cells, text, m);
  if (flightProgressFormatted) return flightProgressFormatted;
  if (/^Условия:/.test(text.trim())) {
    const detail = text.replace(/^Условия:\s*/, "").trim() || "—";
    return { order: "Условия", detail };
  }
  if (entry.phase === -1) return null;
  const vf = reportCtx?.viewerFaction;
  const fog = reportCtx?.fogRevealedCellIds;
  if (vf && vf !== "none" && fog instanceof Set) {
    const rf = formatFireLineRedactedIfNeeded(entry, cells, vf, fog);
    if (rf) return rf;
    const ra = formatAttackLineRedactedIfNeeded(entry, cells, vf, fog);
    if (ra) return ra;
  }
  const reconFormatted = formatReconReportLines(entry, cells, text, m);
  if (reconFormatted) return reconFormatted;
  const intelAirFormatted = formatIntelligenceAirMissionReportLines(entry, cells, text, m);
  if (intelAirFormatted) return intelAirFormatted;
  const missionOnStationFormatted = formatAirMissionOnStationReportLines(entry, cells, text, m);
  if (missionOnStationFormatted) return missionOnStationFormatted;
  const patrolFormatted = formatPatrolMissionReportLines(entry, cells, text, m);
  if (patrolFormatted) return patrolFormatted;
  const airAppearanceFormatted = formatAirAppearanceReportLines(entry, cells, text, m);
  if (airAppearanceFormatted) return airAppearanceFormatted;
  const airReturnFormatted = formatAirReturnReportLines(entry, cells, text, m);
  if (airReturnFormatted) return airReturnFormatted;
  const airCombatFormatted = formatAirCombatReportLines(entry, cells, text, m);
  if (airCombatFormatted) return airCombatFormatted;
  const artilleryAirSectorFormatted = formatArtilleryAirSectorReportLines(entry, cells, text, m);
  if (artilleryAirSectorFormatted) return artilleryAirSectorFormatted;
  const airStrikeFormatted = formatAirStrikeReportLines(entry, cells, text, m);
  if (airStrikeFormatted) return airStrikeFormatted;
  const mExtra = m;
  const destroyedDirect = text.match(/^[Юю]нит (\d+) уничтожен(?: \((.+)\))?$/);
  if (destroyedDirect) {
    const id = Number(destroyedDirect[1]);
    const u = findBattleUnitByInstanceId(cells, id);
    const metaName = typeof m?.unitName === "string" && m.unitName.trim() ? m.unitName.trim() : "";
    const reason = destroyedDirect[2] ? destroyedDirect[2].trim() : "";
    const label = u ? battleUnitDisplayName(u.unit) : metaName || `Юнит ${destroyedDirect[1]}`;
    return {
      order: "Потери",
      detail: `${label} уничтожен${reason ? ` (${reason})` : ""}`
    };
  }
  const knockedOut = text.match(/[Юю]нит (\d+).*выбытие/);
  if (knockedOut) {
    const id = Number(knockedOut[1]);
    const u = findBattleUnitByInstanceId(cells, id);
    return {
      order: "Потери",
      detail: u ? `${battleUnitDisplayName(u.unit)} выбыл` : `Юнит ${knockedOut[1]} выбыл`
    };
  }
  if (ph === 8) {
    const uidRaw = m?.unitInstanceId ?? (text.match(/юнит (\d+)/)?.[1] ? Number(text.match(/юнит (\d+)/)?.[1]) : NaN);
    const mk = String(m?.moveOrderKey || "move").trim();
    const moveKey = mk === "moveWar" ? "moveWar" : "move";
    if (text.includes("недостижима")) {
      const id = text.match(/Ход: (\d+)/)?.[1];
      const u = id != null ? findBattleUnitByInstanceId(cells, Number(id)) : null;
      return {
        order: battleOrderLabel(moveKey),
        detail: u ? `${battleUnitDisplayName(u.unit)} · недостижимо` : "—"
      };
    }
    if (text.includes("→ клетка") && Number.isFinite(uidRaw)) {
      const u = findBattleUnitByInstanceId(cells, uidRaw);
      return {
        order: battleOrderLabel(moveKey),
        detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${uidRaw}`
      };
    }
  }
  if (isFireReportPhase(ph)) {
    const missionKey = String(m?.airMissionLine?.orderKey ?? "").trim();
    if (missionKey === "airReturn") return null;
    if (m?.airCombatLine || m?.fireLine?.patrolIntercept || m?.fireLine?.patrolInterceptReturn) return null;
    if (/^Воздушный бой/.test(text)) return null;
    const fl = m?.fireLine;
    if (ph === 4 && !isAirStrikeReportEntry(ph, m, text, fl)) return null;
    const ok = fireReportOrderKey(ph, fl, m?.airMissionLine);
    const aid = fl?.attackerId;
    const tid = fl?.targetId;
    const tcell = fl?.targetCellId;
    let a = aid != null ? findBattleUnitByInstanceId(cells, aid) : null;
    let b = tid != null ? findBattleUnitByInstanceId(cells, tid) : null;
    if (!a || !b) {
      const fAreaHits = text.match(/^Огонь по площади: (\d+) → (\d+) \(кл\. (\d+)\)/);
      if (fAreaHits) {
        a = findBattleUnitByInstanceId(cells, Number(fAreaHits[1]));
        b = findBattleUnitByInstanceId(cells, Number(fAreaHits[2]));
      }
      const fm = text.match(/^Огонь: (\d+) → (\d+)/);
      if ((!a || !b) && fm) {
        a = findBattleUnitByInstanceId(cells, Number(fm[1]));
        b = findBattleUnitByInstanceId(cells, Number(fm[2]));
      }
    }
    let areaCellId = tcell != null && Number.isFinite(Number(tcell)) ? Number(tcell) : null;
    if (areaCellId == null && a && !b) {
      const areaM = text.match(/Огонь по площади: юнит (\d+) → кл\. (\d+)/);
      if (areaM) areaCellId = Number(areaM[2]);
    }
    const stats = formatFireReportStats(fl, text);
    const areaTargets = fl?.areaTargets;
    const targetDestroyedByFire = (targetId, damage) => {
      const tidNum = Number(targetId);
      if (!Number.isFinite(tidNum) || Number(damage) <= 0) return false;
      return !findBattleUnitByInstanceId(cells, tidNum);
    };
    if (a && Array.isArray(areaTargets) && areaTargets.length > 0) {
      const withDmg = areaTargets.filter((at) => Number(at.damages) > 0);
      const affected = withDmg.length ? withDmg : areaTargets;
      const hiddenAreaTarget =
        vf &&
        vf !== "none" &&
        fog instanceof Set &&
        areaCellId != null &&
        Number.isFinite(areaCellId) &&
        !fog.has(areaCellId);
      const list = affected.map((at) => {
        const u = findBattleUnitByInstanceId(cells, Number(at.targetId));
        const label = hiddenAreaTarget ? "Кого-то задело" : u ? battleUnitDisplayName(u.unit) : `Юнит ${at.targetId}`;
        const destroyed = targetDestroyedByFire(at.targetId, at.damages) ? ' · уничтожен' : '';
        const hitsText =
          Number.isFinite(Number(at?.hits)) ? ` · попаданий: ${Number(at.hits)}` : "";
        const rollsText =
          Array.isArray(at?.rollResults) && at.rollResults.length
            ? ` · выпало: ${at.rollResults.join(", ")}`
            : "";
        const missText =
          Number.isFinite(Number(at?.misses))
            ? ` · вне меткости: ${Number(at.misses)}`
            : "";
        return `${label} — урон ${at.damages}${hitsText}${rollsText}${missText}${destroyed}`;
      });
      const statsArea =
        affected.length > 1
          ? `${stats} · задето целей: ${affected.length}`
          : stats;
      const under = list.join("; ");
      const cellPart =
        areaCellId != null && Number.isFinite(areaCellId) ? ` · кл. ${areaCellId}` : "";
      return {
        order: battleOrderLabel(ok),
        detail: `Стрелок: ${battleUnitDisplayName(a.unit)}${cellPart} · Повреждены: ${under}`,
        stats: statsArea
      };
    }
    if (a && text.trimStart().startsWith("Огонь по площади:") && !areaTargets?.length) {
      const fromText = [];
      for (const x of text.matchAll(/(\d+): урон (\d+)/g)) {
        const targetId = Number(x[1]);
        const d = Number(x[2]);
        if (Number.isFinite(targetId) && Number.isFinite(d)) {
          fromText.push({ targetId, damages: d });
        }
      }
      if (fromText.length) {
        const withDmg2 = fromText.filter((p) => p.damages > 0);
        const use2 = withDmg2.length ? withDmg2 : fromText;
        const hiddenAreaTarget2 =
          vf &&
          vf !== "none" &&
          fog instanceof Set &&
          areaCellId != null &&
          Number.isFinite(areaCellId) &&
          !fog.has(areaCellId);
        const statsArea2 =
          use2.length > 1
            ? `${stats} · задето целей: ${use2.length}`
            : stats;
        const under2 = use2
          .map((p) => {
            const u2 = findBattleUnitByInstanceId(cells, p.targetId);
            const label2 = hiddenAreaTarget2 ? "Кого-то задело" : u2 ? battleUnitDisplayName(u2.unit) : `Юнит ${p.targetId}`;
            const destroyed2 = targetDestroyedByFire(p.targetId, p.damages) ? ' · уничтожен' : '';
            return `${label2} — урон ${p.damages}${destroyed2}`;
          })
          .join("; ");
        const mcell2 = text.match(/→ кл\. (\d+)/);
        const cid2 = mcell2 != null && Number.isFinite(Number(mcell2[1])) ? Number(mcell2[1]) : areaCellId;
        const cellPart2 =
          cid2 != null && Number.isFinite(cid2) ? ` · кл. ${cid2}` : "";
        return {
          order: battleOrderLabel(ok),
          detail: `Стрелок: ${battleUnitDisplayName(a.unit)}${cellPart2} · Повреждены: ${under2}`,
          stats: statsArea2
        };
      }
    }
    if (a && !b && areaCellId != null && Number.isFinite(areaCellId)) {
      const cellLabel = cells.find((c) => Number(c.id) === areaCellId);
      const detail = cellLabel
        ? `Стрелок: ${battleUnitDisplayName(a.unit)} · Клетка ${areaCellId}`
        : `Стрелок: ${battleUnitDisplayName(a.unit)} · кл. ${areaCellId}`;
      return { order: battleOrderLabel(ok), detail, stats };
    }
    if (a && b) {
      const shooterIds = Array.isArray(fl?.shooterIds)
        ? fl.shooterIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        : [];
      const shooters =
        shooterIds.length > 1
          ? shooterIds
              .map((sid) => findBattleUnitByInstanceId(cells, sid))
              .filter(Boolean)
              .map((rec) => battleUnitDisplayName(rec.unit))
          : [];
      const uniqueShooters = shooters.length > 1 ? [...new Set(shooters)] : [];
      const shooterLabel = uniqueShooters.length > 1 ? uniqueShooters.join(', ') : battleUnitDisplayName(a.unit);
      return {
        order: battleOrderLabel(ok),
        detail: `Стрелок: ${shooterLabel} · Под обстрелом: ${battleUnitDisplayName(b.unit)}`,
        stats
      };
    }
    if (a && tid != null && Number.isFinite(Number(tid)) && targetDestroyedByFire(tid, fl?.damages)) {
      return {
        order: battleOrderLabel(ok),
        detail: `Стрелок: ${battleUnitDisplayName(a.unit)} · Цель: Юнит ${Number(tid)} · уничтожен`,
        stats
      };
    }
    if (ph === 4) return null;
    return { order: battleOrderLabel(ok), detail: "—", stats };
  }
  if (ph === 5) {
    const al = m?.attackLine;
    const attackStats = formatAttackReportStats(al, text);
    if (al) {
      const a = findBattleUnitByInstanceId(cells, al.attackerId);
      const b = findBattleUnitByInstanceId(cells, al.targetId);
      if (a && b) {
        return {
          order: battleOrderLabel("attack"),
          detail: `Атакующий: ${battleUnitDisplayName(a.unit)} · Цель: ${battleUnitDisplayName(b.unit)}`,
          stats: attackStats
        };
      }
      if (a && Number.isFinite(Number(al.targetId))) {
        return {
          order: battleOrderLabel("attack"),
          detail: `Атакующий: ${battleUnitDisplayName(a.unit)} · Цель: Юнит ${Number(al.targetId)} · уничтожен`,
          stats: attackStats
        };
      }
    }
    const am = text.match(/^Атака: (\d+) → (\d+)/);
    if (am) {
      const a = findBattleUnitByInstanceId(cells, Number(am[1]));
      const b = findBattleUnitByInstanceId(cells, Number(am[2]));
      if (a && b) {
        return {
          order: battleOrderLabel("attack"),
          detail: `Атакующий: ${battleUnitDisplayName(a.unit)} · Цель: ${battleUnitDisplayName(b.unit)}`,
          stats: attackStats
        };
      }
    }
    const occ = text.match(/^Атака: (\d+) занял гекс цели (\d+)/);
    if (occ) {
      const a = findBattleUnitByInstanceId(cells, Number(occ[1]));
      const b = findBattleUnitByInstanceId(cells, Number(occ[2]));
      if (a && b) {
        return {
          order: battleOrderLabel("attack"),
          detail: `Атакующий: ${battleUnitDisplayName(a.unit)} · Цель: ${battleUnitDisplayName(b.unit)}`,
          stats: attackStats
        };
      }
    }
  }
  if (ph === 1) {
    if (text.startsWith("Сектор обстрела:") || mExtra?.artilleryFireSector === true) {
      const idRaw2 = m?.unitInstanceId;
      const idFromText2 = text.match(/[Сс]ектор обстрела: артиллерия (\d+)/)?.[1];
      const id2 = idRaw2 != null && Number.isFinite(Number(idRaw2)) ? Number(idRaw2) : idFromText2 ? Number(idFromText2) : NaN;
      if (Number.isFinite(id2)) {
        const u = findBattleUnitByInstanceId(cells, id2);
        return {
          order: "Сектор обстрела",
          detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id2}`
        };
      }
    }
    const idRaw = m?.unitInstanceId;
    const idFromText = text.match(/Оборона: юнит (\d+)/)?.[1];
    const id = idRaw != null && Number.isFinite(Number(idRaw)) ? Number(idRaw) : idFromText ? Number(idFromText) : NaN;
    const isSuccessfulDefend = mExtra?.defendSectorCellIds != null || /Оборона: юнит \d+, дист\./.test(text);
    if (Number.isFinite(id) && isSuccessfulDefend) {
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: battleOrderLabel("defend"),
        detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`
      };
    }
  }
  if (ph === 6) {
    const idRaw = m?.unitInstanceId;
    const idFromText = text.match(/Засада: юнит (\d+)/)?.[1] ?? text.match(/Засада: артиллерия (\d+)/i)?.[1];
    const id = idRaw != null && Number.isFinite(Number(idRaw)) ? Number(idRaw) : idFromText ? Number(idFromText) : NaN;
    if (Number.isFinite(id)) {
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: battleOrderLabel("ambush"),
        detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`
      };
    }
  }
  if (ph === 7) {
    if (mExtra?.deploySector === true && m?.unitInstanceId != null) {
      const id = Number(m.unitInstanceId);
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: battleOrderLabel("deploy"),
        detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`
      };
    }
    if (mExtra?.changeSector === true && m?.unitInstanceId != null) {
      const id = Number(m.unitInstanceId);
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: battleOrderLabel("changeSector"),
        detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`
      };
    }
    const clIdEarly = text.match(/^Артиллерия (\d+): свёрнута/)?.[1];
    if (clIdEarly != null) {
      const id = Number(clIdEarly);
      if (Number.isFinite(id)) {
        const u = findBattleUnitByInstanceId(cells, id);
        return {
          order: battleOrderLabel("clotting"),
          detail: u ? battleUnitDisplayName(u.unit) : `Юнит ${id}`
        };
      }
    }
    const ll = m?.logisticsLine ?? parseLogisticsMetaFromText(text);
    if (!ll) return null;
    if (ll.orderKey === "getSup") {
      const truck = ll.fromInstanceId != null ? findBattleUnitByInstanceId(cells, ll.fromInstanceId) : null;
      const recv = findBattleUnitByInstanceId(cells, ll.toInstanceId);
      const amt = "amount" in ll && ll.amount != null ? String(ll.amount) : text.match(/\+\s*(\d+)/)?.[1] ?? "";
      return {
        order: battleOrderLabel("getSup"),
        detail: `${truck ? battleUnitDisplayName(truck.unit) : "—"} → ${recv ? battleUnitDisplayName(recv.unit) : "—"}${amt ? ` · +${amt} БК` : ""}`
      };
    }
    if (ll.orderKey === "loadingSup") {
      const truck = ll.fromInstanceId != null ? findBattleUnitByInstanceId(cells, ll.fromInstanceId) : null;
      const amt = "amount" in ll && ll.amount != null ? String(ll.amount) : text.match(/\+\s*(\d+)/)?.[1] ?? "";
      const cellLabel = ll.toCellId != null ? String(ll.toCellId) : "—";
      return {
        order: battleOrderLabel("loadingSup"),
        detail: `${truck ? battleUnitDisplayName(truck.unit) : "—"} ← склад кл. ${cellLabel}${amt ? ` · +${amt} БК` : ""}`
      };
    }
    if (ll.orderKey === "loading") {
      const truck = ll.fromInstanceId != null ? findBattleUnitByInstanceId(cells, ll.fromInstanceId) : null;
      const inf = findBattleUnitByInstanceId(cells, ll.toInstanceId);
      return {
        order: battleOrderLabel("loading"),
        detail: `${inf ? battleUnitDisplayName(inf.unit) : "—"} → кузов ${truck ? battleUnitDisplayName(truck.unit) : "—"}`
      };
    }
    if (ll.orderKey === "tow") {
      const truck = ll.fromInstanceId != null ? findBattleUnitByInstanceId(cells, ll.fromInstanceId) : null;
      const art = findBattleUnitByInstanceId(cells, ll.toInstanceId);
      return {
        order: battleOrderLabel("tow"),
        detail: `${art ? battleUnitDisplayName(art.unit) : "—"} → кузов ${truck ? battleUnitDisplayName(truck.unit) : "—"}`
      };
    }
    if (ll.orderKey === "unloading") {
      const fromId = m?.logisticsLine?.fromInstanceId;
      const truck = fromId != null ? findBattleUnitByInstanceId(cells, fromId) : null;
      const cargo = findBattleUnitByInstanceId(cells, ll.toInstanceId);
      const cellLabel = ll.toCellId != null ? String(ll.toCellId) : "—";
      return {
        order: battleOrderLabel("unloading"),
        detail: `${cargo ? battleUnitDisplayName(cargo.unit) : "—"} · с ${truck ? battleUnitDisplayName(truck.unit) : "…"} · кл. ${cellLabel}`
      };
    }
  }
  if (/^Танкобоязнь/.test(text)) {
    const head = text.match(/^(Танкобоязнь[^:]*):/);
    const tm = text.match(/^Танкобоязнь[^:]*: юнит (\d+) (.+)$/);
    if (tm && head) {
      const id = Number(tm[1]);
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: head[1].trim(),
        detail: u ? `${battleUnitDisplayName(u.unit)} — ${tm[2].trim()}` : `Юнит ${tm[1]} — ${tm[2].trim()}`
      };
    }
  }
  if (text.startsWith("Стойкость:")) {
    const sm = text.match(/^Стойкость: юнит (\d+) — (.+)$/);
    if (sm) {
      const id = Number(sm[1]);
      const u = findBattleUnitByInstanceId(cells, id);
      const tail = String(sm[2] || '').replace(/^бросок\s*/i, 'Результат: ');
      return {
        order: "Тест на стойкость",
        detail: u ? `${battleUnitDisplayName(u.unit)} — ${tail.trim()}` : `Юнит ${sm[1]} — ${tail.trim()}`
      };
    }
  }
  if (text.startsWith("Подавление снято:")) {
    const sm = text.match(/^Подавление снято: юнит (\d+) \((.+)\)$/);
    if (sm) {
      const id = Number(sm[1]);
      const u = findBattleUnitByInstanceId(cells, id);
      return {
        order: "Подавление снято",
        detail: u ? `${battleUnitDisplayName(u.unit)} (${sm[2].trim()})` : `Юнит ${sm[1]} (${sm[2].trim()})`
      };
    }
  }
  if (text.startsWith("Ближний бой:")) {
    const mm = text.match(/^Ближний бой: (\d+)↔(\d+), (.+)$/);
    if (mm) {
      const a = findBattleUnitByInstanceId(cells, Number(mm[1]));
      const b = findBattleUnitByInstanceId(cells, Number(mm[2]));
      const an = a ? battleUnitDisplayName(a.unit) : `Юнит ${mm[1]}`;
      const bn = b ? battleUnitDisplayName(b.unit) : `Юнит ${mm[2]}`;
      return {
        order: "Ближний бой",
        detail: `${an} ↔ ${bn}, ${mm[3].trim()}`
      };
    }
  }
  if (text.startsWith("Ответ с обороны:") || text.startsWith("Ответ с засады:")) {
    const rm = text.match(/^(Ответ с (?:обороны|засады)):\s*(\d+)\s*→\s*(\d+)(.*)$/);
    if (rm) {
      const a = findBattleUnitByInstanceId(cells, Number(rm[2]));
      const b = findBattleUnitByInstanceId(cells, Number(rm[3]));
      const an = a ? battleUnitDisplayName(a.unit) : `Юнит ${rm[2]}`;
      const bn = b ? battleUnitDisplayName(b.unit) : '';
      return {
        order: rm[1],
        detail:
          bn
            ? `${an} → ${bn}${String(rm[4] || '').trim() ? rm[4] : ''}`
            : `${an}${String(rm[4] || '').trim() ? rm[4] : ''}`
      };
    }
  }
  if (text.startsWith("Огонь с обороны") || text.startsWith("Огонь с засады")) {
    const rm = text.match(/^Огонь с (обороны|засады)(?: \([^)]*\))?:\s*(\d+)\s*→\s*(\d+),\s*(.+)$/);
    if (rm) {
      const a = findBattleUnitByInstanceId(cells, Number(rm[2]));
      const b = findBattleUnitByInstanceId(cells, Number(rm[3]));
      const an = a ? battleUnitDisplayName(a.unit) : `Юнит ${rm[2]}`;
      const bn = b ? battleUnitDisplayName(b.unit) : `Юнит ${rm[3]}`;
      return {
        order: rm[1] === "засады" ? "Огонь с засады" : "Огонь с обороны",
        detail: `Стрелок: ${an} · Под обстрелом: ${bn}`,
        stats: String(rm[4] || '').trim()
      };
    }
  }
  if (text.startsWith("Засада раскрыта:")) {
    const am = text.match(/^Засада раскрыта: юнит (\d+)\s*(.*)$/);
    if (am) {
      const id = Number(am[1]);
      const u = findBattleUnitByInstanceId(cells, id);
      const unitLabel = u ? battleUnitDisplayName(u.unit) : `Юнит ${am[1]}`;
      const tail = String(am[2] || '').trim();
      return {
        order: "Засада раскрыта",
        detail: tail ? `${unitLabel} ${tail}` : unitLabel
      };
    }
  }
  if (/^Ход: юнит \d+ не завершил движение/.test(text)) {
    const hm = text.match(/^Ход: юнит (\d+) (.+)$/);
    if (hm) {
      const u = findBattleUnitByInstanceId(cells, Number(hm[1]));
      const un = u ? battleUnitDisplayName(u.unit) : `Юнит ${hm[1]}`;
      return {
        order: "Ход",
        detail: `${un} ${hm[2].trim()}`
      };
    }
  }
  return null;
}
export function metaToSectorOrderReplay(m, ph) {
  if (!m) return null;
  const unitInstanceId = Number(m.unitInstanceId);
  const facingCellId = Number(m.defendFacingCellId);
  if (!Number.isFinite(unitInstanceId) || !Number.isFinite(facingCellId)) return null;
  const raw = m.defendSectorCellIds;
  const sectorCellIds = Array.isArray(raw)
    ? raw.map((x) => Number(x)).filter((id) => Number.isFinite(id))
    : [];
  if (m.deploySector === true) {
    return {
      kind: "sectorOrder",
      variant: "artilleryDeploy",
      unitInstanceId,
      facingCellId,
      sectorCellIds
    };
  }
  if (m.changeSector === true) {
    return {
      kind: "sectorOrder",
      variant: "artilleryChangeSector",
      unitInstanceId,
      facingCellId,
      sectorCellIds
    };
  }
  if (m.artilleryFireSector === true) {
    return {
      kind: "sectorOrder",
      variant: "artilleryFireSector",
      unitInstanceId,
      facingCellId,
      sectorCellIds
    };
  }
  if (!sectorCellIds.length) return null;
  const isAmbush = m.isAmbush === true || ph === 6;
  return {
    kind: "sectorOrder",
    variant: isAmbush ? "ambush" : "defend",
    unitInstanceId,
    facingCellId,
    sectorCellIds
  };
}
function findAirCombatCellForUnitInTurn(visibleLog, turn, unitId) {
  if (!Array.isArray(visibleLog)) return null;
  const uid = Number(unitId);
  if (!Number.isFinite(uid)) return null;
  for (let i = 0; i < visibleLog.length; i++) {
    const e = visibleLog[i];
    if (e.turn !== turn) continue;
    const acl = e.meta?.airCombatLine;
    if (!acl) continue;
    const cellId = Number(acl.cellId);
    if (!Number.isFinite(cellId)) continue;
    const participants = Array.isArray(acl.participantIds) ? acl.participantIds : [];
    if (participants.some((x) => Number(x) === uid)) return cellId;
    const shots = Array.isArray(acl.roundShots) ? acl.roundShots : [];
    for (let j = 0; j < shots.length; j++) {
      const s = shots[j];
      if (Number(s.targetId) === uid || Number(s.attackerId) === uid) return cellId;
    }
  }
  return null;
}
export function battleLogEntryToReplay(entry, cells, visibleLog) {
  const ph = entry.phase;
  const m = entry.meta;
  const mExt = m;
  const text = String(entry.text ?? "");
  const fromMeta = metaToSectorOrderReplay(
    mExt,
    ph ?? 0
  );
  if (fromMeta) return fromMeta;
  const airReturnReplay = buildAirReturnReplayFromLogEntry(entry, cells);
  if (airReturnReplay) return airReturnReplay;
  const reconReplay = buildReconReplayFromLogEntry(entry, cells);
  if (reconReplay) return reconReplay;
  const airCombatReplay = buildAirCombatReplayFromLogEntry(entry, cells, visibleLog);
  if (airCombatReplay) return airCombatReplay;
  const desantReplay = buildDesantParatrooperReplayFromLogEntry(entry, cells);
  if (desantReplay) return desantReplay;
  if (ph === 8 && m?.movePath?.length) {
    const path = [];
    for (const id of m.movePath) {
      const c = cells.find((cell) => Number(cell.id) === Number(id));
      if (c) path.push(c);
    }
    if (path.length >= 2) {
      const mid = m.unitInstanceId != null ? Number(m.unitInstanceId) : void 0;
      const ok = String(m.moveOrderKey || "move").trim() === "moveWar" ? "moveWar" : "move";
      return {
        kind: "move",
        path,
        moverInstanceId: mid != null && Number.isFinite(mid) ? mid : void 0,
        orderKey: ok
      };
    }
  }
  if (ph === 7 && m?.logisticsLine) {
    const ll = m.logisticsLine;
    return {
      kind: "logistics",
      orderKey: ll.orderKey,
      fromInstanceId: ll.fromInstanceId,
      toInstanceId: ll.toInstanceId,
      toCellId: ll.toCellId
    };
  }
  const destroyedDirect = text.match(/^[Юю]нит (\d+) уничтожен(?: \((.+)\))?$/);
  if (destroyedDirect) {
    const id = Number(destroyedDirect[1]);
    const destroyedCellId = m?.destroyedCellId;
    const live = findBattleUnitByInstanceId(cells, id);
    const reason = destroyedDirect[2] ? String(destroyedDirect[2]).trim() : "";
    let lossCellId =
      destroyedCellId != null && Number.isFinite(Number(destroyedCellId))
        ? Number(destroyedCellId)
        : live?.cell?.id;
    if (/воздушный бой/i.test(reason)) {
      const combatCell = findAirCombatCellForUnitInTurn(visibleLog, entry.turn, id);
      if (combatCell != null) lossCellId = combatCell;
    }
    return {
      kind: "loss",
      unitInstanceId: id,
      lossCellId
    };
  }
  if (isFireReportPhase(ph) && m?.fireLine) {
    const fl = m.fireLine;
    if (fl.artilleryAirSector === true) {
      return {
        kind: "artilleryAirSector",
        shooterInstanceId: fl.attackerId,
        targetInstanceId: fl.targetId ?? void 0,
        targetCellId: fl.targetCellId ?? void 0,
        fromCellId: fl.fromCellId ?? void 0,
        shotKind: fl.airSectorShotKind,
      };
    }
    const at = fl.areaTargets;
    const areaIds = Array.isArray(at) && at.length ? at.map((x) => Number(x.targetId)).filter((id) => Number.isFinite(id)) : void 0;
    const shooterIds = Array.isArray(fl.shooterIds)
      ? fl.shooterIds.map((x) => Number(x)).filter((id) => Number.isFinite(id))
      : void 0;
    return {
      kind: "fire",
      shooterInstanceId: fl.attackerId,
      shooterInstanceIds: shooterIds && shooterIds.length ? shooterIds : void 0,
      targetInstanceId: fl.targetId ?? void 0,
      targetCellId: fl.targetCellId ?? void 0,
      orderKey: fireReportOrderKey(ph, fl, m?.airMissionLine),
      areaTargetInstanceIds: areaIds && areaIds.length ? areaIds : void 0
    };
  }
  if (ph === 5 && m?.attackLine) {
    return {
      kind: "attack",
      attackerInstanceId: m.attackLine.attackerId,
      targetInstanceId: m.attackLine.targetId
    };
  }
  const move = text.match(/Ход: юнит (\d+) → клетка (\d+)/);
  if (move && !text.includes("недостижима")) {
    const uid = Number(move[1]);
    const cid = Number(move[2]);
    const live = findBattleUnitByInstanceId(cells, uid);
    const target = cells.find((c) => Number(c.id) === cid);
    if (live && target && live.cell.id !== target.id) {
      const profile = {
        type: String(live.unit.type ?? "infantry"),
        faction: String(live.unit.faction ?? "")
      };
      const path = findMovementPath(live.cell, target, cells, profile, null);
      if (path && path.length >= 2) return { kind: "move", path, moverInstanceId: uid };
    }
  }
  if (ph === 7) {
    const legacyLogistics = parseLogisticsMetaFromText(text);
    if (legacyLogistics) {
      if (legacyLogistics.orderKey === "unloading") {
        return {
          kind: "logistics",
          orderKey: "unloading",
          toInstanceId: legacyLogistics.toInstanceId,
          toCellId: legacyLogistics.toCellId
        };
      }
      return {
        kind: "logistics",
        orderKey: legacyLogistics.orderKey,
        fromInstanceId: legacyLogistics.fromInstanceId,
        toInstanceId: legacyLogistics.toInstanceId
      };
    }
  }
  const fireAreaWithTarget = text.match(/^Огонь по площади: (\d+) → (\d+) \(кл\. (\d+)\)/);
  if (fireAreaWithTarget && isFireReportPhase(ph)) {
    const orderKey = fireReportOrderKey(ph, m?.fireLine);
    return {
      kind: "fire",
      shooterInstanceId: Number(fireAreaWithTarget[1]),
      targetInstanceId: Number(fireAreaWithTarget[2]),
      targetCellId: Number(fireAreaWithTarget[3]),
      orderKey
    };
  }
  const fireAreaLegacy = text.match(/^Огонь по площади: юнит (\d+) → кл\. (\d+)/);
  if (fireAreaLegacy && isFireReportPhase(ph)) {
    const orderKey = fireReportOrderKey(ph, m?.fireLine);
    return {
      kind: "fire",
      shooterInstanceId: Number(fireAreaLegacy[1]),
      targetCellId: Number(fireAreaLegacy[2]),
      orderKey
    };
  }
  const fire = text.match(/^Огонь: (\d+) → (\d+)/);
  if (fire) {
    const orderKey = ph === 2 ? "fireHard" : "fire";
    return {
      kind: "fire",
      shooterInstanceId: Number(fire[1]),
      targetInstanceId: Number(fire[2]),
      orderKey
    };
  }
  const artilleryAirSector = parseArtilleryAirSectorLogText(text);
  if (artilleryAirSector) {
    return {
      kind: "artilleryAirSector",
      shooterInstanceId: artilleryAirSector.shooterInstanceId,
      targetInstanceId: artilleryAirSector.targetInstanceId,
      targetCellId: artilleryAirSector.targetCellId,
    };
  }
  const atk = text.match(/^Атака: (\d+) → (\d+)/);
  if (atk) {
    return {
      kind: "attack",
      attackerInstanceId: Number(atk[1]),
      targetInstanceId: Number(atk[2])
    };
  }
  const occ = text.match(/^Атака: (\d+) занял гекс цели (\d+)/);
  if (occ) {
    return {
      kind: "attack",
      attackerInstanceId: Number(occ[1]),
      targetInstanceId: Number(occ[2])
    };
  }
  const clotting = text.match(/^Артиллерия (\d+): свёрнута/);
  if (clotting) {
    const id = Number(clotting[1]);
    if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id], clottingUnitId: id };
  }
  if (ph === 8 && (text.includes("недостижима") || text.includes("нет пути") || text.includes("не завершил движение"))) {
    const idm = text.match(/Ход: (?:юнит )?(\d+)/);
    if (idm) {
      const uid = Number(idm[1]);
      if (Number.isFinite(uid)) return { kind: "unitGlow", instanceIds: [uid] };
    }
  }
  const suppressClear = text.match(/^Подавление снято: юнит (\d+) \((.+)\)$/);
  if (suppressClear) {
    const id = Number(suppressClear[1]);
    if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
  }
  const ambushRevealed = text.match(/^Засада раскрыта: юнит (\d+)\s*(.*)$/);
  if (ambushRevealed) {
    const id = Number(ambushRevealed[1]);
    if (Number.isFinite(id)) {
      const live = findBattleUnitByInstanceId(cells, id);
      return {
        kind: "unitGlow",
        instanceIds: [id],
        lossCellId: live?.cell?.id
      };
    }
  }
  const responseLine = text.match(/^Ответ с (?:обороны|засады): (\d+) → (\d+) \(кл\. (\d+)/);
  if (responseLine) {
    return {
      kind: "fire",
      shooterInstanceId: Number(responseLine[1]),
      targetInstanceId: Number(responseLine[2]),
      targetCellId: Number(responseLine[3]),
      orderKey: "fire"
    };
  }
  const sectorFireLine = text.match(/^Огонь с (?:обороны|засады)(?: \([^)]*\))?: (\d+) → (\d+)(?: \(кл\. (\d+))?/);
  if (sectorFireLine) {
    return {
      kind: "fire",
      shooterInstanceId: Number(sectorFireLine[1]),
      targetInstanceId: Number(sectorFireLine[2]),
      targetCellId:
        sectorFireLine[3] != null && Number.isFinite(Number(sectorFireLine[3]))
          ? Number(sectorFireLine[3])
          : undefined,
      orderKey: "fire"
    };
  }
  return null;
}
export function battleLogEntryLooseUnitGlow(entry) {
  const t = String(entry.text ?? "");
  if (/^Танкобоязнь/.test(t) || t.startsWith("Стойкость:")) {
    const a = t.match(/юнит (\d+)/);
    if (a) {
      const id = Number(a[1]);
      if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
    }
  }
  const ph = entry.phase ?? 0;
  if (ph === 1) {
    const a = t.match(/Оборона: юнит (\d+)/) ?? t.match(/[Сс]ектор обстрела: артиллерия (\d+)/);
    if (a) {
      const id = Number(a[1]);
      if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
    }
  }
  if (ph === 6) {
    const a = t.match(/Засада: юнит (\d+)/) ?? t.match(/[Зз]асада: артиллерия (\d+)/);
    if (a) {
      const id = Number(a[1]);
      if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
    }
  }
  if (ph === 7) {
    for (const re of [/Развёртывание: артиллерия (\d+)/, /[Сс]мена сектора: артиллерия (\d+)/]) {
      const a = t.match(re);
      if (a) {
        const id = Number(a[1]);
        if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
      }
    }
  }
  if (t.startsWith("Подавление снято:")) {
    const a = t.match(/^Подавление снято: юнит (\d+)/);
    if (a) {
      const id = Number(a[1]);
      if (Number.isFinite(id)) return { kind: "unitGlow", instanceIds: [id] };
    }
  }
  return null;
}
export function battleLogEntryReplayWithFallback(entry, cells, visibleLog) {
  return battleLogEntryToReplay(entry, cells, visibleLog) ?? battleLogEntryLooseUnitGlow(entry);
}

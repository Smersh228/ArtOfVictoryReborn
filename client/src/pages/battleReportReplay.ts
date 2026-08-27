import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { BattleDefendHoverState, BattleReportReplayHighlight } from '../components/map/Cells';
import { findUnitCellByInstanceId } from '../game/battleMovePreview';
import {
  computePatrolVisibilityCellIds,
  computeReconZoneCellIds,
  isUnitOnAirReturnOrCooldown,
  isUnitOnIntelligenceAirPatrol,
  isUnitOnAirPatrol,
  readFlightPathCellIdsFromUnit,
  readIntelligenceAirCenterCellIdFromUnit,
  readPatrolCenterCellIdFromUnit,
  readPatrolRangeStepsFromUnit,
  readReconRingStepsFromUnit,
} from '../game/battleAirSupport';

function normalizeCellIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function cellsFromPathIds(pathIds: number[], cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < pathIds.length; i++) {
    const c = cells.find((cell) => Number(cell.id) === Number(pathIds[i]));
    if (c) out.push(c);
  }
  return out;
}

function parseTrajectoryCellIdsFromText(text: string): number[] {
  const trajM = String(text || '').match(/траектория:\s*(.+)$/);
  if (!trajM) return [];
  const part = trajM[1].trim();
  if (!part || part === '—') return [];
  return part
    .split(/\s*→\s*/)
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite);
}

function resolveAirReturnPath(
  pathIds: number[],
  fromId: number | undefined,
  baseId: number | undefined,
  cells: Cell[],
): Cell[] {
  const path = cellsFromPathIds(pathIds, cells);
  if (path.length >= 2) return path;
  if (Number.isFinite(fromId) && Number.isFinite(baseId) && fromId !== baseId) {
    const fromCell = cells.find((c) => Number(c.id) === fromId);
    const baseCell = cells.find((c) => Number(c.id) === baseId);
    if (fromCell && baseCell) return [fromCell, baseCell];
  }
  if (path.length === 1 && Number.isFinite(baseId)) {
    const baseCell = cells.find((c) => Number(c.id) === baseId);
    if (baseCell && path[0].id !== baseCell.id) return [...path, baseCell];
  }
  return path.length >= 2 ? path : [];
}

export function buildAirReturnReplayFromLogEntry(entry: any, cells: Cell[]) {
  const m = entry?.meta;
  const text = String(entry?.text ?? '');
  const aml = m?.airMissionLine;
  const isReturnMeta = aml && String(aml.orderKey || '').trim() === 'airReturn';
  const returnM = text.match(/^Возвращение: юнит (\d+), (\d+) → база (\d+)/);
  const recallM = text.match(/^Отзыв: юнит (\d+) — возвращение на базу$/);

  if (!isReturnMeta && !returnM && !recallM) return null;

  let uid: number | undefined;
  let fromId: number | undefined;
  let baseId: number | undefined;
  let pathIds: number[] = [];

  if (isReturnMeta || returnM) {
    uid = Number(returnM?.[1] ?? aml?.unitInstanceId);
    fromId = Number(returnM?.[2] ?? aml?.fromCellId);
    baseId = Number(returnM?.[3] ?? aml?.toCellId);
    pathIds = normalizeCellIdList(aml?.pathCellIds);
    if (!pathIds.length) pathIds = parseTrajectoryCellIdsFromText(text);
  } else if (recallM) {
    uid = Number(recallM[1]);
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const unit = live?.unit as Record<string, unknown> | undefined;
    const tac = unit?.tactical as Record<string, unknown> | undefined;
    const sortie = tac?.airSortie as Record<string, unknown> | undefined;
    baseId = Number(sortie?.departureCellId ?? tac?.airMissionTargetCellId);
    pathIds = normalizeCellIdList(sortie?.returnPathCellIds ?? tac?.airMissionFlightPath);
    if (!pathIds.length) pathIds = readFlightPathCellIdsFromUnit(unit);
    fromId = pathIds.length ? pathIds[0] : undefined;
  }

  if (!Number.isFinite(uid)) return null;

  if (!pathIds.length && Number.isFinite(fromId) && Number.isFinite(baseId)) {
    pathIds = fromId === baseId ? [fromId!] : [fromId!, baseId!];
  }
  if (!Number.isFinite(fromId) && pathIds.length) fromId = pathIds[0];
  if (!Number.isFinite(baseId) && pathIds.length) baseId = pathIds[pathIds.length - 1];

  const path = resolveAirReturnPath(pathIds, fromId, baseId, cells);
  if (path.length < 2) return null;

  return {
    kind: 'airFlight' as const,
    unitInstanceId: uid,
    orderKey: 'airReturn',
    path,
    flightCellId: Number.isFinite(fromId) ? fromId : pathIds[0],
    departureCellId: Number.isFinite(baseId) ? baseId : pathIds[pathIds.length - 1],
    targetCellId: Number.isFinite(baseId) ? baseId : pathIds[pathIds.length - 1],
  };
}

export function buildDesantParatrooperReplayFromLogEntry(entry: any, cells: Cell[]) {
  const m = entry?.meta;
  const text = String(entry?.text ?? '');

  const dll = m?.desantLandingLine;
  if (dll) {
    const uid = Number(dll.unitInstanceId);
    const cellId = Number(dll.targetCellId);
    if (Number.isFinite(uid) && uid > 0) {
      return {
        kind: 'unitGlow' as const,
        instanceIds: [uid],
        lossCellId: Number.isFinite(cellId) ? cellId : undefined,
      };
    }
  }

  const withCell = [
    /^Десант: отряд (\d+) высадился на кл\. (\d+) с противником — ближний бой \(половинные З\/IO\)$/,
    /^Десант: отряд (\d+) высадился на кл\. (\d+)$/,
    /^Десант: отряд (\d+) — высадка на кл\. (\d+) невозможна \(местность или переполнение\)$/,
  ];
  for (let i = 0; i < withCell.length; i++) {
    const match = text.match(withCell[i]);
    if (!match) continue;
    const uid = Number(match[1]);
    const cellId = Number(match[2]);
    if (Number.isFinite(uid) && uid > 0) {
      return {
        kind: 'unitGlow' as const,
        instanceIds: [uid],
        lossCellId: Number.isFinite(cellId) ? cellId : undefined,
      };
    }
  }

  const uidOnly = [
    /^Десант · снаряжение: отряд (\d+) — приказы недоступны, половинные З\/IO$/,
    /^Десант: отряд (\d+) — после высадки на водную\/болотную местность только «Боевое положение»$/,
    /^Десант: отряд (\d+) — после снаряжения только «Боевое положение»$/,
  ];
  for (let i = 0; i < uidOnly.length; i++) {
    const match = text.match(uidOnly[i]);
    if (!match) continue;
    const uid = Number(match[1]);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    const live = findUnitCellByInstanceId(cells, uid);
    return {
      kind: 'unitGlow' as const,
      instanceIds: [uid],
      lossCellId: live?.cell?.id,
    };
  }

  const landingTestM = text.match(/^Десант · тест приземления \((\w+)\): отряд (\d+), d6=(\d+|\w+), потери (\d+)$/);
  if (landingTestM) {
    const uid = Number(landingTestM[2]);
    if (Number.isFinite(uid) && uid > 0) {
      const live = findUnitCellByInstanceId(cells, uid);
      return {
        kind: 'unitGlow' as const,
        instanceIds: [uid],
        lossCellId: live?.cell?.id,
      };
    }
  }

  return null;
}

function buildMissionTargetZoneReplay(
  orderKey: string,
  uid: number,
  targetCellId: number,
  cells: Cell[],
  unit: Record<string, unknown> | null | undefined,
) {
  const centerCell = cells.find((c) => Number(c.id) === targetCellId);
  if (!centerCell) return null;
  const k = String(orderKey || '').trim();
  if (k === 'patrol') {
    const rangeOverride = readPatrolRangeStepsFromUnit(unit);
    const zoneCellIds =
      unit != null
        ? computePatrolVisibilityCellIds(centerCell, unit, cells, rangeOverride ?? undefined)
        : [targetCellId];
    return buildReconReplayPayload({
      orderKey: 'patrol',
      unitInstanceId: uid,
      centerCellId: targetCellId,
      zoneCellIds,
    });
  }
  if (k === 'intelligenceAir') {
    const ringSteps = readReconRingStepsFromUnit(unit, 'intelligenceAir');
    const zoneCellIds = computeReconZoneCellIds(centerCell, ringSteps, cells);
    return buildReconReplayPayload({
      orderKey: 'intelligenceAir',
      unitInstanceId: uid,
      centerCellId: targetCellId,
      zoneCellIds,
    });
  }
  return null;
}

function buildAirFlightReplayFromSortieMeta(
  asl: Record<string, unknown>,
  cells: Cell[],
  text: string,
) {
  const isMovement = asl?.movementTick === true || String(text || '').startsWith('Полёт:');
  if (isMovement) return null;

  const isAppearance = asl?.appearance === true;
  if (!isAppearance) return null;

  const uid = Number(asl.unitInstanceId);
  if (!Number.isFinite(uid)) return null;

  const depId = Number(asl.departureCellId);
  const flightId = Number(asl.pathCellId);
  return {
    kind: 'airAppearance' as const,
    unitInstanceId: uid,
    departureCellId: Number.isFinite(depId) ? depId : undefined,
    flightCellId: Number.isFinite(flightId) ? flightId : undefined,
    orderKey: String(asl.orderKey || '').trim() || undefined,
  };
}

function buildPatrolReplayFromUnit(uid: number, cells: Cell[]) {
  const live = findUnitCellByInstanceId(cells, uid);
  const unit = live?.unit as Record<string, unknown> | undefined;
  if (!isUnitOnAirPatrol(unit)) return null;
  const centerId = readPatrolCenterCellIdFromUnit(unit);
  if (centerId == null) return null;
  const sortie = (unit?.tactical as { airSortie?: Record<string, unknown> } | undefined)?.airSortie;
  const zoneFromSortie = normalizeCellIdList(sortie?.patrolZoneCellIds);
  const centerCell = cells.find((c) => Number(c.id) === centerId);
  const rangeOverride = readPatrolRangeStepsFromUnit(unit);
  const zoneCellIds =
    zoneFromSortie.length
      ? zoneFromSortie
      : centerCell && unit
        ? computePatrolVisibilityCellIds(centerCell, unit, cells, rangeOverride ?? undefined)
        : [centerId];
  return buildReconReplayPayload({
    orderKey: 'patrol',
    unitInstanceId: uid,
    centerCellId: centerId,
    zoneCellIds,
  });
}

function buildReconReplayPayload(params: {
  orderKey: string;
  unitInstanceId?: number;
  centerCellId: number;
  zoneCellIds: number[];
}) {
  const centerCellId = Number(params.centerCellId);
  const zoneCellIds = normalizeCellIdList(params.zoneCellIds);
  const uid = Number(params.unitInstanceId);
  return {
    kind: 'recon' as const,
    orderKey: String(params.orderKey || 'intelligenceAir'),
    unitInstanceId: Number.isFinite(uid) ? uid : undefined,
    centerCellId,
    zoneCellIds: zoneCellIds.length ? zoneCellIds : [centerCellId],
  };
}

export function buildReconReplayFromLogEntry(entry: any, cells: Cell[]) {
  const m = entry?.meta;
  const text = String(entry?.text ?? '');

  const rl = m?.reconLine;
  if (rl) {
    const centerId = Number(rl.centerCellId);
    if (!Number.isFinite(centerId)) return null;
    const zoneFromMeta = normalizeCellIdList(rl.reconZoneCellIds);
    if (zoneFromMeta.length) {
      return buildReconReplayPayload({
        orderKey: String(rl.orderKey || 'intelligenceAir'),
        unitInstanceId: Number(rl.unitInstanceId),
        centerCellId: centerId,
        zoneCellIds: zoneFromMeta,
      });
    }
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const uid = Number(rl.unitInstanceId);
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const ringSteps = readReconRingStepsFromUnit(
      (live?.unit as Record<string, unknown> | undefined) ?? null,
      String(rl.orderKey || 'intelligenceAir'),
    );
    const zoneCellIds = centerCell ? computeReconZoneCellIds(centerCell, ringSteps, cells) : [centerId];
    return buildReconReplayPayload({
      orderKey: String(rl.orderKey || 'intelligenceAir'),
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const aml = m?.airMissionLine;
  if (aml && String(aml.orderKey || '').trim() === 'airReturn') {
    return null;
  }
  if (aml?.inboundLaunch === true) {
    const uid = Number(aml.unitInstanceId);
    const pathIds = normalizeCellIdList(aml.pathCellIds);
    const path = cellsFromPathIds(pathIds, cells);
    if (Number.isFinite(uid) && path.length >= 2) {
      const live = findUnitCellByInstanceId(cells, uid);
      const unit = live?.unit as Record<string, unknown> | undefined;
      const targetId = Number(aml.toCellId ?? pathIds[pathIds.length - 1]);
      const zoneReplay = Number.isFinite(targetId)
        ? buildMissionTargetZoneReplay(String(aml.orderKey || 'patrol'), uid, targetId, cells, unit ?? null)
        : null;
      return {
        kind: 'airFlight' as const,
        unitInstanceId: uid,
        orderKey: String(aml.orderKey || '').trim() || 'patrol',
        path,
        flightCellId: pathIds[0],
        departureCellId: Number(aml.fromCellId ?? pathIds[0]),
        targetCellId: targetId,
        reconCenterCellId: zoneReplay?.centerCellId,
        reconZoneCellIds: zoneReplay?.zoneCellIds,
        reconOrderKey: zoneReplay?.orderKey,
      };
    }
  }
  if (aml && String(aml.orderKey || '').trim() === 'patrol') {
    const centerId = Number(aml.toCellId);
    if (!Number.isFinite(centerId)) return null;
    const zoneFromMeta = normalizeCellIdList(aml.patrolZoneCellIds);
    if (zoneFromMeta.length) {
      return buildReconReplayPayload({
        orderKey: 'patrol',
        unitInstanceId: Number(aml.unitInstanceId),
        centerCellId: centerId,
        zoneCellIds: zoneFromMeta,
      });
    }
    const uid = Number(aml.unitInstanceId);
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (isUnitOnAirReturnOrCooldown(unit)) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const rangeSteps = Number(aml.patrolRangeSteps);
    const rangeOverride = Number.isFinite(rangeSteps) && rangeSteps > 0 ? rangeSteps : readPatrolRangeStepsFromUnit(unit);
    const zoneCellIds =
      centerCell && unit
        ? computePatrolVisibilityCellIds(centerCell, unit, cells, rangeOverride ?? undefined)
        : [centerId];
    return buildReconReplayPayload({
      orderKey: 'patrol',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }
  if (aml && String(aml.orderKey || '').trim() === 'intelligenceAir') {
    const centerId = Number(aml.toCellId);
    if (!Number.isFinite(centerId)) return null;
    const zoneFromMeta = normalizeCellIdList(aml.reconZoneCellIds);
    if (zoneFromMeta.length) {
      return buildReconReplayPayload({
        orderKey: 'intelligenceAir',
        unitInstanceId: Number(aml.unitInstanceId),
        centerCellId: centerId,
        zoneCellIds: zoneFromMeta,
      });
    }
    const uid = Number(aml.unitInstanceId);
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (isUnitOnAirReturnOrCooldown(unit)) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const ringSteps = readReconRingStepsFromUnit(live?.unit as Record<string, unknown>, 'intelligenceAir');
    const zoneCellIds = centerCell ? computeReconZoneCellIds(centerCell, ringSteps, cells) : [centerId];
    return buildReconReplayPayload({
      orderKey: 'intelligenceAir',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const startM = text.match(
    /^Авиационная разведка: юнит (\d+) — вылет с кл\. (\d+), точка кл\. (\d+), (\d+) х\.$/,
  );
  if (startM) {
    const centerId = Number(startM[3]);
    const uid = Number(startM[1]);
    const live = findUnitCellByInstanceId(cells, uid);
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (isUnitOnAirReturnOrCooldown(unit)) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const ringSteps = readReconRingStepsFromUnit(live?.unit as Record<string, unknown>, 'intelligenceAir');
    const zoneCellIds = centerCell ? computeReconZoneCellIds(centerCell, ringSteps, cells) : [centerId];
    return buildReconReplayPayload({
      orderKey: 'intelligenceAir',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const intelTurnM = text.match(/^Авиационная разведка: юнит (\d+), (ход \d+\/\d+) —/);
  if (intelTurnM) {
    const uid = Number(intelTurnM[1]);
    const live = findUnitCellByInstanceId(cells, uid);
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (isUnitOnAirReturnOrCooldown(unit)) return null;
    const centerId = readIntelligenceAirCenterCellIdFromUnit(unit);
    if (centerId == null) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const ringSteps = readReconRingStepsFromUnit(live?.unit as Record<string, unknown>, 'intelligenceAir');
    const zoneCellIds = centerCell ? computeReconZoneCellIds(centerCell, ringSteps, cells) : [centerId];
    return buildReconReplayPayload({
      orderKey: 'intelligenceAir',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const activeM = text.match(/^Авиационная разведка: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  if (activeM) {
    const uid = Number(activeM[1]);
    const live = findUnitCellByInstanceId(cells, uid);
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (!isUnitOnIntelligenceAirPatrol(unit)) return null;
    const centerId = readIntelligenceAirCenterCellIdFromUnit(unit);
    if (centerId == null) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const ringSteps = readReconRingStepsFromUnit(live?.unit as Record<string, unknown>, 'intelligenceAir');
    const zoneCellIds = centerCell ? computeReconZoneCellIds(centerCell, ringSteps, cells) : [centerId];
    return buildReconReplayPayload({
      orderKey: 'intelligenceAir',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const doneM = text.match(/^Авиационная разведка завершена: юнит (\d+) — возвращение на базу$/);
  if (doneM) {
    const uid = Number(doneM[1]);
    const aml = m?.airMissionLine;
    if (aml && String(aml.orderKey || '').trim() === 'airReturn') {
      const baseId = Number(aml.toCellId);
      if (Number.isFinite(baseId)) {
        return buildReconReplayPayload({
          orderKey: 'intelligenceAir',
          unitInstanceId: uid,
          centerCellId: baseId,
          zoneCellIds: [baseId],
        });
      }
    }
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const unit = live?.unit as Record<string, unknown> | undefined;
    const tac = unit?.tactical as Record<string, unknown> | undefined;
    const sortie = tac?.airSortie as Record<string, unknown> | undefined;
    const baseId = Number(sortie?.departureCellId ?? tac?.airMissionTargetCellId);
    if (Number.isFinite(baseId)) {
      return buildReconReplayPayload({
        orderKey: 'intelligenceAir',
        unitInstanceId: uid,
        centerCellId: baseId,
        zoneCellIds: [baseId],
      });
    }
    return null;
  }

  const asl = m?.airSortieLine;
  if (asl && typeof asl === 'object') {
    const flightReplay = buildAirFlightReplayFromSortieMeta(asl as Record<string, unknown>, cells, text);
    if (flightReplay) return flightReplay;
  }

  const appearM = text.match(/^В небе появился самолёт: юнит (\d+)$/);
  if (appearM) {
    const uid = Number(appearM[1]);
    if (!Number.isFinite(uid)) return null;
    const live = findUnitCellByInstanceId(cells, uid);
    const unit = live?.unit as Record<string, unknown> | undefined;
    const sortie = (unit?.tactical as { airSortie?: Record<string, unknown> } | undefined)?.airSortie;
    const depId = Number(sortie?.departureCellId);
    const pathRaw = sortie?.pathCellIds ?? (unit?.tactical as Record<string, unknown> | undefined)?.airMissionFlightPath;
    const path = Array.isArray(pathRaw) ? pathRaw.map(Number).filter(Number.isFinite) : [];
    const flightId = path.length ? path[0] : undefined;
    return {
      kind: 'airAppearance' as const,
      unitInstanceId: uid,
      departureCellId: Number.isFinite(depId) ? depId : live?.cell.id,
      flightCellId: Number.isFinite(Number(flightId)) ? Number(flightId) : undefined,
    };
  }

  if (asl && String(asl.orderKey || '').trim() === 'patrol') {
    const uid = Number(asl.unitInstanceId);
    if (Number.isFinite(uid)) {
      const fromUnit = buildPatrolReplayFromUnit(uid, cells);
      if (fromUnit) return fromUnit;
    }
  }

  const patrolActiveM = text.match(/^Патрулирование: юнит (\d+) — на задании, осталось (\d+) х\.$/);
  if (patrolActiveM) {
    const uid = Number(patrolActiveM[1]);
    if (Number.isFinite(uid)) {
      const replay = buildPatrolReplayFromUnit(uid, cells);
      if (replay) return replay;
    }
  }

  const patrolOnMissionM = text.match(/^На задании: юнит (\d+) — «patrol», осталось ходов (\d+)/);
  if (patrolOnMissionM) {
    const uid = Number(patrolOnMissionM[1]);
    if (Number.isFinite(uid)) {
      const replay = buildPatrolReplayFromUnit(uid, cells);
      if (replay) return replay;
    }
  }

  const patrolStartM = text.match(/^Патрулирование: юнит (\d+), вылет (\d+) → назначение (\d+)/);
  if (patrolStartM) {
    const centerId = Number(patrolStartM[3]);
    const uid = Number(patrolStartM[1]);
    const live = findUnitCellByInstanceId(cells, uid);
    const unit = live?.unit as Record<string, unknown> | undefined;
    if (isUnitOnAirReturnOrCooldown(unit)) return null;
    const centerCell = cells.find((c) => Number(c.id) === centerId);
    const rangeOverride = readPatrolRangeStepsFromUnit(unit);
    const zoneCellIds =
      centerCell && unit
        ? computePatrolVisibilityCellIds(centerCell, unit, cells, rangeOverride ?? undefined)
        : [centerId];
    return buildReconReplayPayload({
      orderKey: 'patrol',
      unitInstanceId: uid,
      centerCellId: centerId,
      zoneCellIds,
    });
  }

  const patrolDoneM = text.match(/^Патруль\/разведка завершены: юнит (\d+) — возвращение на базу$/);
  if (patrolDoneM) {
    const uid = Number(patrolDoneM[1]);
    const live = Number.isFinite(uid) ? findUnitCellByInstanceId(cells, uid) : null;
    const unit = live?.unit as Record<string, unknown> | undefined;
    const tac = unit?.tactical as Record<string, unknown> | undefined;
    const sortie = tac?.airSortie as Record<string, unknown> | undefined;
    const baseId = Number(sortie?.departureCellId ?? tac?.airMissionTargetCellId);
    if (Number.isFinite(baseId)) {
      return buildReconReplayPayload({
        orderKey: 'patrol',
        unitInstanceId: uid,
        centerCellId: baseId,
        zoneCellIds: [baseId],
      });
    }
    return null;
  }

  return null;
}

function findInterceptionInterceptorId(participantIds: number[], cells: Cell[]): number | null {
  for (let i = 0; i < participantIds.length; i++) {
    const id = Number(participantIds[i]);
    if (!Number.isFinite(id) || id <= 0) continue;
    const live = findUnitCellByInstanceId(cells, id);
    const unit = live?.unit as Record<string, unknown> | undefined;
    const tac = unit?.tactical as Record<string, unknown> | undefined;
    const sortie = tac?.airSortie as Record<string, unknown> | undefined;
    const orderKey = String(tac?.airMissionOrderKey ?? sortie?.activeOrderKey ?? '').trim();
    if (orderKey === 'interception' || sortie?.interceptionTargetId != null) return id;
  }
  return null;
}

function readInterceptionFlightPathCells(
  unit: Record<string, unknown> | null | undefined,
  cells: Cell[],
): Cell[] {
  if (!unit) return [];
  const pathIds = readFlightPathCellIdsFromUnit(unit);
  const path = cellsFromPathIds(pathIds, cells);
  if (path.length >= 2) return path;
  const tac = unit.tactical as Record<string, unknown> | undefined;
  const sortie = tac?.airSortie as Record<string, unknown> | undefined;
  const dep = Number(sortie?.departureCellId);
  const meet = Number(sortie?.meetingCellId ?? tac?.airMissionTargetCellId);
  if (Number.isFinite(dep) && Number.isFinite(meet)) {
    return resolveAirReturnPath([], dep, meet, cells);
  }
  return path;
}

function findInterceptionPathFromLog(
  visibleLog: unknown[] | undefined,
  maxTurn: number,
  interceptorId: number,
  cells: Cell[],
): Cell[] {
  if (!Array.isArray(visibleLog)) return [];
  let best: Cell[] = [];
  for (let i = 0; i < visibleLog.length; i++) {
    const e = visibleLog[i] as { turn?: number; meta?: { airMissionLine?: Record<string, unknown> } };
    const turn = Number(e.turn);
    if (!Number.isFinite(turn) || turn > maxTurn) continue;
    const aml = e.meta?.airMissionLine;
    if (!aml || String(aml.orderKey || '').trim() !== 'interception') continue;
    if (Number(aml.unitInstanceId) !== interceptorId) continue;
    const path = cellsFromPathIds(normalizeCellIdList(aml.pathCellIds), cells);
    if (path.length >= 2) best = path;
  }
  return best;
}

function buildInterceptionAirCombatFlightReplay(
  entry: any,
  participantIds: number[],
  cells: Cell[],
  visibleLog?: unknown[],
): { path: Cell[]; interceptorInstanceId: number; departureCellId?: number } | null {
  const interceptorId = findInterceptionInterceptorId(participantIds, cells);
  if (interceptorId == null) return null;

  const live = findUnitCellByInstanceId(cells, interceptorId);
  let path = readInterceptionFlightPathCells(live?.unit as Record<string, unknown> | undefined, cells);
  if (path.length < 2 && visibleLog) {
    const turn = Number(entry?.turn ?? entry?.t);
    path = findInterceptionPathFromLog(visibleLog, Number.isFinite(turn) ? turn : Infinity, interceptorId, cells);
  }
  if (path.length < 2) return null;

  return {
    path,
    interceptorInstanceId: interceptorId,
    departureCellId: path[0]?.id,
  };
}

export function buildAirCombatReplayFromLogEntry(entry: any, cells?: Cell[], visibleLog?: unknown[]) {
  const m = entry?.meta;
  const acl = m?.airCombatLine;
  const fl = m?.fireLine;
  const ids = new Set<number>();
  let cellId: number | undefined;

  if (acl && typeof acl === 'object') {
    if (Number.isFinite(Number(acl.cellId))) cellId = Number(acl.cellId);
    const participants = Array.isArray(acl.participantIds) ? acl.participantIds : [];
    for (let i = 0; i < participants.length; i++) {
      const n = Number(participants[i]);
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
    const shots = Array.isArray(acl.roundShots) ? acl.roundShots : [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const a = Number(s?.attackerId);
      const t = Number(s?.targetId);
      if (Number.isFinite(a) && a > 0) ids.add(a);
      if (Number.isFinite(t) && t > 0) ids.add(t);
    }
    if (acl.interrupted === true) {
      const uid = Number(acl.unitInstanceId);
      if (Number.isFinite(uid) && uid > 0) ids.add(uid);
      if (Number.isFinite(Number(acl.fromCellId))) cellId = Number(acl.fromCellId);
    }
  }

  if (fl && (fl.patrolIntercept === true || fl.patrolInterceptReturn === true)) {
    const a = Number(fl.attackerId);
    const t = Number(fl.targetId);
    if (Number.isFinite(a) && a > 0) ids.add(a);
    if (Number.isFinite(t) && t > 0) ids.add(t);
    const c = Number(fl.targetCellId ?? fl.fromCellId);
    if (Number.isFinite(c)) cellId = c;
  }

  const text = String(entry?.text ?? '');
  const shotM = text.match(/^Воздушный бой: (\d+) → (\d+)/);
  if (shotM) {
    ids.add(Number(shotM[1]));
    ids.add(Number(shotM[2]));
  }
  const patrolM = text.match(/^Воздушный бой \((?:патруль|ответ)\).*?: (\d+) → (\d+)/);
  if (patrolM) {
    ids.add(Number(patrolM[1]));
    ids.add(Number(patrolM[2]));
  }

  if (!ids.size) return null;
  const combatTypes = acl && Array.isArray(acl.types) ? [...acl.types] : undefined;
  const isInterception = Array.isArray(combatTypes) && combatTypes.includes('interception');
  const participantList = acl && Array.isArray(acl.participantIds)
    ? acl.participantIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : [...ids];

  let path: Cell[] | undefined;
  let interceptorInstanceId: number | undefined;
  let departureCellId: number | undefined;
  if (isInterception && cells?.length) {
    const flight = buildInterceptionAirCombatFlightReplay(entry, participantList, cells, visibleLog);
    if (flight) {
      path = flight.path;
      interceptorInstanceId = flight.interceptorInstanceId;
      departureCellId = flight.departureCellId;
    }
  }

  return {
    kind: 'airCombat' as const,
    instanceIds: [...ids],
    cellId,
    combatTypes,
    path,
    interceptorInstanceId,
    departureCellId,
    orderKey: isInterception ? 'interception' : undefined,
  };
}

function airCombatReportOrderKey(combatTypes: unknown): string {
  const t = Array.isArray(combatTypes) ? combatTypes.map((x) => String(x)) : [];
  if (t.includes('interception')) return 'interception';
  if (t.includes('patrol')) return 'patrol';
  if (t.includes('routeIntersection')) return 'attackAir';
  return 'interception';
}

export function buildBattleReportReplayHighlight(
  replay: any,
  cells?: Cell[],
): BattleReportReplayHighlight | null {
  const r: any = replay;
  if (!r) return null;
  if (r.kind === 'unitGlow') {
    const ids = (r.instanceIds as number[] | undefined)?.filter((x: number) => Number.isFinite(x) && x > 0) ?? [];
    const cid = Number((r as { lossCellId?: unknown }).lossCellId);
    return ids.length
      ? {
          glowInstanceIds: ids,
          lossCellId: Number.isFinite(cid) ? cid : undefined,
        }
      : null;
  }
  if (r.kind === 'airCombat') {
    const ids = (r.instanceIds as number[] | undefined)?.filter((x: number) => Number.isFinite(x) && x > 0) ?? [];
    const cid = Number(r.cellId);
    const orderKey = airCombatReportOrderKey(r.combatTypes);
    const highlight: BattleReportReplayHighlight = {
      glowInstanceIds: ids,
      lossCellId: Number.isFinite(cid) ? cid : undefined,
      airCombatCellId: Number.isFinite(cid) ? cid : undefined,
      airCombatOrderKey: orderKey,
    };
    const depId = Number(r.departureCellId);
    if (orderKey === 'interception' && Number.isFinite(depId)) {
      highlight.reconCenterCellId = depId;
      highlight.reconZoneCellIds = [depId];
      highlight.reconOrderKey = 'interception';
    } else if (Number.isFinite(depId)) {
      highlight.airDepartureCellId = depId;
    }
    return ids.length ? highlight : null;
  }
  if (r.kind === 'loss') {
    const uid = Number(r.unitInstanceId);
    const cid = Number(r.lossCellId);
    const glowIds = Number.isFinite(uid) && uid > 0 ? [uid] : [];
    return {
      glowInstanceIds: glowIds,
      lossCellId: Number.isFinite(cid) ? cid : undefined,
    };
  }
  if (r.kind === 'sectorOrder') {
    const unitId = Number(r.unitInstanceId);
    return Number.isFinite(unitId) && unitId > 0 ? { glowInstanceIds: [unitId] } : null;
  }
  if (r.kind === 'move') {
    const mid = r.moverInstanceId as number | undefined;
    return mid != null && Number.isFinite(mid) ? { glowInstanceIds: [mid] } : null;
  }
  if (r.kind === 'fire') {
    const orderKey = String(r.orderKey || '').trim();
    const targetCellId =
      r.targetCellId != null && Number.isFinite(Number(r.targetCellId)) ? Number(r.targetCellId) : undefined;
    if ((orderKey === 'bombardment' || orderKey === 'attackAir') && targetCellId != null) {
      return {
        glowInstanceIds: [],
        lossCellId: targetCellId,
        airCombatCellId: targetCellId,
        airCombatOrderKey: orderKey,
      };
    }
    const shooters = Array.isArray(r.shooterInstanceIds)
      ? r.shooterInstanceIds.filter((x: number) => Number.isFinite(x) && x > 0)
      : [];
    const area = r.areaTargetInstanceIds as number[] | undefined;
    const single = r.targetInstanceId as number | undefined;
    const targetIds = area?.length ? area : single != null && Number.isFinite(single) ? [single] : [];
    const glow: number[] = [
      ...new Set(
        [...(shooters.length ? shooters : [r.shooterInstanceId as number]), ...targetIds].filter(
          (x: number) => Number.isFinite(x) && x > 0,
        ),
      ),
    ];
    return {
      glowInstanceIds: glow,
      lossCellId: targetCellId,
      targetDecal:
        targetIds.length > 0 ? { orderKey: r.orderKey as 'fire' | 'fireHard', targetInstanceIds: targetIds } : undefined,
    };
  }
  if (r.kind === 'artilleryAirSector') {
    const shooterId = Number(r.shooterInstanceId);
    const targetId = Number(r.targetInstanceId);
    const shotCellId = Number(r.targetCellId);
    const glow = [shooterId, targetId].filter((x) => Number.isFinite(x) && x > 0);
    return {
      glowInstanceIds: [...new Set(glow)],
      lossCellId: Number.isFinite(shotCellId) ? shotCellId : undefined,
      artilleryAirSectorCellId: Number.isFinite(shotCellId) ? shotCellId : undefined,
    };
  }
  if (r.kind === 'attack') {
    return {
      glowInstanceIds: [r.attackerInstanceId as number, r.targetInstanceId as number],
      targetDecal: { orderKey: 'attack' as const, targetInstanceIds: [r.targetInstanceId as number] },
    };
  }
  if (r.kind === 'logistics') {
    const glow = [r.fromInstanceId, r.toInstanceId].filter(
      (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0,
    );
    const ids = glow.length ? glow : [r.toInstanceId as number];
    if (r.orderKey === 'unloading' && r.toCellId != null && Number.isFinite(r.toCellId)) {
      return { glowInstanceIds: ids, unloadCellDecalId: r.toCellId as number };
    }
    if (r.orderKey === 'loadingSup' && r.toCellId != null && Number.isFinite(r.toCellId)) {
      return { glowInstanceIds: ids, unloadCellDecalId: r.toCellId as number };
    }
    const recipientDecalId =
      r.orderKey === 'getSup' ? (r.toInstanceId as number) : (r.fromInstanceId ?? r.toInstanceId) as number;
    const ok = r.orderKey === 'tow' ? 'tow' : r.orderKey === 'loading' ? 'loading' : 'getSup';
    return {
      glowInstanceIds: ids,
      targetDecal: { orderKey: ok, targetInstanceIds: [recipientDecalId] },
    };
  }
  if (r.kind === 'recon') {
    const uid = Number(r.unitInstanceId);
    const glow = Number.isFinite(uid) && uid > 0 ? [uid] : [];
    let centerId = Number(r.centerCellId);
    let zoneCellIds = normalizeCellIdList(r.zoneCellIds);
    if ((!zoneCellIds.length || !Number.isFinite(centerId)) && cells?.length) {
      const rebuilt = buildReconReplayFromLogEntry({ meta: { reconLine: r }, text: '' }, cells);
      if (rebuilt) {
        centerId = Number(rebuilt.centerCellId);
        zoneCellIds = normalizeCellIdList(rebuilt.zoneCellIds);
      }
    }
    if (!Number.isFinite(centerId)) return null;
    if (!zoneCellIds.length) zoneCellIds = [centerId];
    const orderKey = String(r.orderKey || 'intelligenceAir').trim() || 'intelligenceAir';
    return {
      glowInstanceIds: glow,
      reconZoneCellIds: zoneCellIds,
      reconCenterCellId: centerId,
      reconOrderKey: orderKey,
    };
  }
  if (r.kind === 'airFlight') {
    const uid = Number(r.unitInstanceId);
    const depId = Number(r.departureCellId);
    const flightId = Number(r.flightCellId);
    const targetId = Number(r.targetCellId);
    const orderKey = String(r.orderKey || '').trim();
    const highlight: BattleReportReplayHighlight = {
      glowInstanceIds: Number.isFinite(uid) && uid > 0 ? [uid] : [],
      airDepartureCellId: Number.isFinite(depId) ? depId : undefined,
      airFlightCellId: Number.isFinite(flightId) ? flightId : undefined,
    };
    if (orderKey === 'airReturn') return highlight;
    const zoneIds = normalizeCellIdList(r.reconZoneCellIds);
    const centerId = Number(r.reconCenterCellId);
    if (zoneIds.length && Number.isFinite(centerId)) {
      highlight.reconCenterCellId = centerId;
      highlight.reconZoneCellIds = zoneIds;
      highlight.reconOrderKey = String(r.reconOrderKey || r.orderKey || 'patrol').trim() || 'patrol';
    } else if (Number.isFinite(targetId)) {
      highlight.reconCenterCellId = targetId;
      highlight.reconZoneCellIds = [targetId];
      highlight.reconOrderKey = String(r.orderKey || 'patrol').trim() || 'patrol';
    }
    return highlight;
  }
  if (r.kind === 'airAppearance') {
    const uid = Number(r.unitInstanceId);
    const depId = Number(r.departureCellId);
    const flightId = Number(r.flightCellId);
    return {
      glowInstanceIds: Number.isFinite(uid) && uid > 0 ? [uid] : [],
      airDepartureCellId: Number.isFinite(depId) ? depId : undefined,
      airFlightCellId: Number.isFinite(flightId) ? flightId : undefined,
    };
  }
  return null;
}

export function buildBattleReportSectorHover(replay: any, cells: Cell[]): BattleDefendHoverState | null {
  const r: any = replay;
  if (!r || r.kind !== 'sectorOrder') return null;
  const unitInstanceId = Number(r.unitInstanceId);
  const facingCellId = Number(r.facingCellId);
  if (!Number.isFinite(unitInstanceId) || !Number.isFinite(facingCellId)) return null;
  const sectorCellIds = Array.isArray(r.sectorCellIds)
    ? r.sectorCellIds.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x))
    : [];
  const live = findUnitCellByInstanceId(cells, unitInstanceId);
  const facingDecal: BattleDefendHoverState['facingDecal'] =
    r.variant === 'artilleryDeploy' ? 'deploy' : r.variant === 'artilleryChangeSector' ? 'changeSector' : undefined;
  return {
    unitInstanceId,
    facingCellId,
    sectorCellIds,
    defendKind: r.variant === 'ambush' ? 'ambush' : 'defend',
    facingDecal,
    unitStandingCellId: live?.cell?.id,
    showSectorWithoutUnitHover: true,
  };
}

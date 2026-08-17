import { useMemo } from 'react';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import {
  canOfferFireAdjustment,
  canArtilleryUseFireAdjustment,
} from '../../game/battleFireAdjustment';
import { computeBattleCellSize } from '../../game/battleMapFit';
import {
  findMovementPath,
  findReachableCells,
  findUnitCellByInstanceId,
  findGroundBattleUnitByInstanceId,
  normalizeBattleInstanceId,
  getBattleMoveBudgetForOrder,
  pathTerrainCost,
  type BattleMovePreviewUnit,
} from '../../game/battleMovePreview';
import {
  computeBattleFireHighlights,
  hexDistCells,
  maxAirMissionHexStepsForUnit,
  maxShootRangeStepsForUnit,
} from '../../game/battleFirePreview';
import { computeHexFlightPathCellIds } from '../../game/battleFlightPath';
import { computeDefendSectorCells, findFacingNeighborCells, getArtillerySectorCellIdSet, artilleryUsesFireSectorProperty } from '../../game/battleDefendSector';
import { adjacentCellsWithWire } from '../../game/cellWireEdges';
import { cellsEligibleForEnterDot } from '../../game/cellDot';
import {
  computeGetSupTargetInstanceIds,
  computeLoadingTargetInstanceIds,
  computeTowTargetInstanceIds,
  computeUnloadCellIds,
  isTruckUnitBattle,
} from '../../game/battleLogisticsUi';
import { HexVisibility } from '../../game/hexVisibility';
import { airOrderHasFlightPreview, airOrderNeedsHexTarget, airOrderShowsFlightPathPreview, collectAirUnitsInFlight, collectEnemyAirInterceptionTargets, computeBombardmentAreaCellIds, computeBombardmentDirectionPickCellIds, computePatrolRangePickCellIds, computePatrolVisibilityCellIds, isBattleAirUnitType, isUnitOnIntelligenceAirPatrol, readAirMissionHexPreviewFromUnit, readAirMissionPreviewDecalCellId, readAirSupportReadinessFromUnit, readBattleVisionRange, readBombardmentApproachCellId, readPatrolCenterCellIdFromUnit, readPatrolRangeStepsFromUnit } from '../../game/battleAirSupport';
import { buildBattleReportReplayHighlight, buildBattleReportSectorHover } from '../battleReportReplay';
import type {
  BattleDefendHoverState,
  BattlePendingLogisticsPreview,
  BattlePendingShootPreview,
  BattleReportReplayHighlight,
} from '../../components/map/Cells';

function readBattleUnitNumber(unit: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = unit[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function useBattleDerivedState(params: {
  cells: Cell[];
  mapViewport: { w: number; h: number };
  mapPad: number;
  orderPick: any;
  battleHoverCellId: number | null;
  battleUnitTip: any;
  battleUnitOrders: any;
  pendingOrders: BattleOrderPayload[];
  viewerBattleFaction: LobbyFaction;
  myBattleFaction: LobbyFaction;
  turn: number;
  battleReportReplay: any;
  unloadCargoPickModal: any;
  unitIsMineOnMap: (unit: Record<string, unknown>, viewerFaction: LobbyFaction) => boolean;
  airSupportHoverCellId: number | null;
  /** Строка панели «Авиаподдержка», по которой строится превью (вместе с cellId). */
  airSupportHoverUnitInstanceId: number | null;
  airSupportOpen: boolean;
  battleReconByFaction?: { rkka?: number[]; wehrmacht?: number[] } | null;
}) {
  const {
    cells,
    mapViewport,
    mapPad,
    orderPick,
    battleHoverCellId,
    battleUnitTip,
    battleUnitOrders,
    pendingOrders,
    viewerBattleFaction,
    myBattleFaction,
    turn,
    battleReportReplay,
    unloadCargoPickModal,
    unitIsMineOnMap,
    airSupportHoverCellId,
    airSupportHoverUnitInstanceId,
    airSupportOpen,
    battleReconByFaction,
  } = params;

  const battleFogRevealedCellIds = useMemo(() => {
    if (viewerBattleFaction === 'none') return null;
    const hv = new HexVisibility(cells);
    const revealed = new Set<number>();

    const factionRecon = battleReconByFaction?.[viewerBattleFaction];
    if (Array.isArray(factionRecon)) {
      for (const id of factionRecon) {
        const n = Number(id);
        if (Number.isFinite(n)) revealed.add(n);
      }
    }

    for (const cell of cells) {
      for (const u of cell.units || []) {
        const raw = u as unknown as Record<string, unknown>;
        if (!unitIsMineOnMap(raw, viewerBattleFaction)) continue;
        const tac = raw.tactical;
        if (tac && typeof tac === 'object' && !Array.isArray(tac)) {
          const tacRec = tac as Record<string, unknown>;
          const extra = tacRec.reconRevealedCellIds;
          if (Array.isArray(extra)) {
            for (const id of extra) {
              const n = Number(id);
              if (Number.isFinite(n)) revealed.add(n);
            }
          }
          const intelRecon = tacRec.intelligenceAirRevealedCellIds;
          if (Array.isArray(intelRecon) && isUnitOnIntelligenceAirPatrol(raw)) {
            for (const id of intelRecon) {
              const n = Number(id);
              if (Number.isFinite(n)) revealed.add(n);
            }
          }
        }
        if (isBattleAirUnitType(raw.type)) continue;
        const vr = readBattleUnitNumber(raw, 'vis', 'visible', 'visibleRange');
        const r = vr != null && vr > 0 ? vr : 6;
        hv.computeVisibleCellIds(cell, r).forEach((id) => revealed.add(id));
      }
    }
    return revealed;
  }, [cells, viewerBattleFaction, unitIsMineOnMap, battleReconByFaction]);

  const battleCellSize = useMemo(
    () => computeBattleCellSize(cells, mapViewport.w, mapViewport.h, mapPad),
    [cells, mapViewport.w, mapViewport.h, mapPad],
  );

  const movePreviewLive = useMemo(() => {
    if (!orderPick || (orderPick.orderKey !== 'move' && orderPick.orderKey !== 'moveWar')) return null;
    const iid = Number(orderPick.unit.instanceId);
    if (!Number.isFinite(iid)) return null;
    return findUnitCellByInstanceId(cells, iid);
  }, [orderPick, cells]);

  const moveReachableCellIds = useMemo(() => {
    if (!orderPick || !movePreviewLive) return null;
    if (orderPick.orderKey !== 'move' && orderPick.orderKey !== 'moveWar') return null;
    const u = movePreviewLive.unit as unknown as Record<string, unknown>;
    const profile: BattleMovePreviewUnit = {
      type: String(u.type ?? 'infantry'),
      faction: String(u.faction ?? ''),
      properties: u.properties,
    };
    const budget = getBattleMoveBudgetForOrder(u, orderPick.orderKey as 'move' | 'moveWar');
    const reachable = findReachableCells(movePreviewLive.cell, budget, cells, profile, battleFogRevealedCellIds);
    const ids = new Set(reachable.map((c) => c.id));
    ids.delete(movePreviewLive.cell.id);
    return ids;
  }, [orderPick, cells, movePreviewLive, battleFogRevealedCellIds]);

  const cutWireTargetCellIds = useMemo(() => {
    if (!orderPick || orderPick.orderKey !== 'cutWire') return null;
    const iid = Number(orderPick.unit?.instanceId);
    if (!Number.isFinite(iid)) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    if (!live) return null;
    return new Set(adjacentCellsWithWire(live.cell, cells).map((c) => c.id));
  }, [orderPick, cells]);

  const enterDotTargetCellIds = useMemo(() => {
    if (!orderPick || orderPick.orderKey !== 'enterDot') return null;
    const iid = Number(orderPick.unit?.instanceId);
    if (!Number.isFinite(iid)) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    if (!live) return null;
    const getStr = (u: Record<string, unknown>) => {
      const n = Number(u.str ?? u.strength);
      return Number.isFinite(n) ? n : 0;
    };
    return new Set(cellsEligibleForEnterDot(live.cell, cells, getStr).map((c) => c.id));
  }, [orderPick, cells]);

  const defendFacingPickCellIds = useMemo(() => {
    if (
      !orderPick ||
      (orderPick.orderKey !== 'defend' &&
        orderPick.orderKey !== 'ambush' &&
        orderPick.orderKey !== 'deploy' &&
        orderPick.orderKey !== 'changeSector') ||
      orderPick.defendStep !== 'facing'
    )
      return null;
    const iid = Number(orderPick.unit.instanceId);
    if (!Number.isFinite(iid)) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    if (!live) return null;
    return new Set(findFacingNeighborCells(live.cell, cells).map((c) => c.id));
  }, [orderPick, cells]);

  const defendRangePickCellIds = useMemo(() => {
    if (!orderPick || orderPick.defendStep !== 'range') return null;
    if (orderPick.orderKey !== 'defend' && orderPick.orderKey !== 'ambush') return null;
    const fid = orderPick.defendFacingPickedId;
    if (fid == null) return null;
    const u = orderPick.unit as unknown as Record<string, unknown>;
    const iid = Number(u.instanceId);
    if (!Number.isFinite(iid)) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    const fc = cells.find((c) => c.id === fid);
    if (!live || !fc) return null;
    const wmax = maxShootRangeStepsForUnit(u);
    if (wmax < 1) return null;
    return new Set(computeDefendSectorCells(live.cell, fc, cells, u, wmax).map((c) => c.id));
  }, [orderPick, cells]);

  const defendPickHighlightCellIds = useMemo(
    () => defendRangePickCellIds ?? defendFacingPickCellIds,
    [defendRangePickCellIds, defendFacingPickCellIds],
  );

  const moveHoverPath = useMemo(() => {
    if (!orderPick || (orderPick.orderKey !== 'move' && orderPick.orderKey !== 'moveWar')) return null;
    if (!movePreviewLive || !moveReachableCellIds) return null;
    if (battleHoverCellId == null || !moveReachableCellIds.has(battleHoverCellId)) return null;
    const target = cells.find((c) => c.id === battleHoverCellId);
    if (!target) return null;
    const u = movePreviewLive.unit as unknown as Record<string, unknown>;
    const profile: BattleMovePreviewUnit = {
      type: String(u.type ?? 'infantry'),
      faction: String(u.faction ?? ''),
      properties: u.properties,
    };
    return findMovementPath(movePreviewLive.cell, target, cells, profile, battleFogRevealedCellIds);
  }, [orderPick, cells, battleHoverCellId, movePreviewLive, moveReachableCellIds, battleFogRevealedCellIds]);

  const mapHoverPath = useMemo(() => {
    if (!battleUnitTip || battleUnitOrders) return moveHoverPath;
    const iid = Number(battleUnitTip.unit.instanceId);
    if (!Number.isFinite(iid)) return moveHoverPath;
    if (
      orderPick &&
      (orderPick.orderKey === 'move' || orderPick.orderKey === 'moveWar') &&
      Number(orderPick.unit.instanceId) === iid
    ) {
      return moveHoverPath;
    }
    const p = pendingOrders.find((x) => x.unitInstanceId === iid);
    if (!p || (p.orderKey !== 'move' && p.orderKey !== 'moveWar') || p.targetCellId == null) {
      return moveHoverPath;
    }
    const live = findUnitCellByInstanceId(cells, iid);
    const target = cells.find((c) => c.id === p.targetCellId);
    if (!live || !target) return moveHoverPath;
    const u = live.unit as unknown as Record<string, unknown>;
    const profile: BattleMovePreviewUnit = {
      type: String(u.type ?? 'infantry'),
      faction: String(u.faction ?? ''),
      properties: u.properties,
    };
    const path = findMovementPath(live.cell, target, cells, profile, battleFogRevealedCellIds);
    if (!path || path.length < 2) return moveHoverPath;
    const maxCost = getBattleMoveBudgetForOrder(u, p.orderKey as 'move' | 'moveWar');
    if (pathTerrainCost(path, profile) > maxCost) return moveHoverPath;
    return path;
  }, [battleUnitTip, battleUnitOrders, orderPick, pendingOrders, cells, moveHoverPath, battleFogRevealedCellIds]);

  const battleAirDeparturePickCellId = useMemo(() => {
    if (!orderPick || !airOrderNeedsHexTarget(orderPick.orderKey)) return null;
    const iid = Number(orderPick.unit?.instanceId);
    if (!Number.isFinite(iid)) return null;
    return findUnitCellByInstanceId(cells, iid)?.cell.id ?? null;
  }, [orderPick, cells]);

  const airSupportPanelMissionPreview = useMemo(() => {
    if (!airSupportOpen || airSupportHoverUnitInstanceId == null) return null;

    const live = findUnitCellByInstanceId(cells, airSupportHoverUnitInstanceId);
    const unit = live?.unit as Record<string, unknown> | undefined;
    const readiness = readAirSupportReadinessFromUnit(unit);

    if (readiness !== 'ready') {
      if (readiness !== 'onMission' && readiness !== 'airborne') return null;
      const active = readAirMissionHexPreviewFromUnit(unit, cells);
      if (!active) return null;
      const isInterception = active.orderKey === 'interception';
      if (!isInterception && (!active.pathCells?.length || active.pathCells.length < 2)) return null;
      const patrolRangeSteps =
        active.orderKey === 'patrol'
          ? readPatrolRangeStepsFromUnit(unit) ?? readBattleVisionRange(unit as Record<string, unknown>)
          : undefined;
      return {
        pathCells: isInterception ? [] : active.pathCells,
        targetCellId: readAirMissionPreviewDecalCellId(
          active.orderKey,
          active.pathCells,
          active.targetCellId,
          unit,
          cells,
          isInterception
            ? Number((unit?.tactical as Record<string, unknown> | undefined)?.airSortie as Record<string, unknown> | undefined)?.interceptionTargetId
            : undefined,
        ),
        orderKey: active.orderKey,
        patrolRangeSteps,
      };
    }

    const pending = pendingOrders.find(
      (po) =>
        po.unitInstanceId === airSupportHoverUnitInstanceId &&
        airOrderHasFlightPreview(po.orderKey) &&
        po.targetCellId != null &&
        Array.isArray(po.flightPathCellIds) &&
        po.flightPathCellIds.length > 0,
    );
    if (
      pending?.flightPathCellIds?.length &&
      pending.targetCellId != null &&
      airOrderHasFlightPreview(pending.orderKey)
    ) {
      const pathCells: Cell[] = [];
      for (const cid of pending.flightPathCellIds) {
        const c = cells.find((x) => x.id === cid);
        if (!c) return null;
        pathCells.push(c);
      }
      const orderKey = String(pending.orderKey || '').trim();
      const isInterception = orderKey === 'interception';
      return {
        pathCells: isInterception ? [] : pathCells,
        targetCellId: readAirMissionPreviewDecalCellId(
          orderKey,
          pathCells,
          Number(pending.targetCellId),
          unit,
          cells,
          isInterception ? pending.targetUnitInstanceId : undefined,
        ),
        orderKey,
        bombardmentDirectionCellId:
          pending.orderKey === 'bombardment' && pending.bombardmentDirectionCellId != null
            ? Number(pending.bombardmentDirectionCellId)
            : undefined,
        patrolRangeSteps:
          pending.orderKey === 'patrol' && pending.patrolRangeSteps != null
            ? Number(pending.patrolRangeSteps)
            : undefined,
      };
    }

    return readAirMissionHexPreviewFromUnit(unit, cells);
  }, [airSupportOpen, airSupportHoverUnitInstanceId, pendingOrders, cells]);

  const airMissionHoverPath = useMemo(() => {
    if (!orderPick || !airOrderNeedsHexTarget(orderPick.orderKey)) return null;
    if (orderPick.orderKey === 'bombardment' && orderPick.bombardmentStep === 'direction') return null;
    if (orderPick.orderKey === 'patrol' && orderPick.patrolStep === 'radius') return null;
    const iid = Number(orderPick.unit?.instanceId);
    if (!Number.isFinite(iid) || battleHoverCellId == null) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    if (!live) return null;
    const dest = cells.find((c) => c.id === battleHoverCellId);
    if (!dest) return null;
    const u = live.unit as unknown as Record<string, unknown>;
    const maxD = maxAirMissionHexStepsForUnit(u);
    const d = hexDistCells(live.cell, dest);
    if (d < 1 || d > maxD) return null;
    const ids = computeHexFlightPathCellIds(cells, live.cell, dest);
    if (!ids?.length) return null;
    const pathCells: Cell[] = [];
    for (const id of ids) {
      const c = cells.find((x) => x.id === id);
      if (!c) return null;
      pathCells.push(c);
    }
    return pathCells;
  }, [orderPick, cells, battleHoverCellId]);

  const bombardmentDirectionPickCellIds = useMemo((): Set<number> | null => {
    if (orderPick?.orderKey !== 'bombardment' || orderPick.bombardmentStep !== 'direction') return null;
    const tid = orderPick.bombardmentTargetCellId;
    if (tid == null) return null;
    const targetCell = cells.find((c) => c.id === tid);
    if (!targetCell) return null;
    const approachId = readBombardmentApproachCellId(orderPick.bombardmentFlightPathCellIds);
    const ids = computeBombardmentDirectionPickCellIds(
      targetCell,
      cells,
      approachId,
    );
    return ids.length ? new Set(ids) : null;
  }, [orderPick, cells]);

  const bombardmentApproachCellId = useMemo((): number | null => {
    if (orderPick?.orderKey === 'bombardment' && orderPick.bombardmentStep === 'direction') {
      return readBombardmentApproachCellId(orderPick.bombardmentFlightPathCellIds);
    }
    return null;
  }, [orderPick]);

  const bombardmentCommittedPath = useMemo((): Cell[] | null => {
    if (orderPick?.orderKey !== 'bombardment' || orderPick.bombardmentStep !== 'direction') return null;
    const path = orderPick.bombardmentFlightPathCellIds;
    if (!path?.length) return null;
    const out: Cell[] = [];
    for (const cid of path) {
      const c = cells.find((x) => x.id === cid);
      if (!c) return null;
      out.push(c);
    }
    return out;
  }, [orderPick, cells]);

  const patrolCommittedPath = useMemo((): Cell[] | null => {
    if (orderPick?.orderKey !== 'patrol' || orderPick.patrolStep !== 'radius') return null;
    const path = orderPick.patrolFlightPathCellIds;
    if (!path?.length) return null;
    const out: Cell[] = [];
    for (const cid of path) {
      const c = cells.find((x) => x.id === cid);
      if (!c) return null;
      out.push(c);
    }
    return out;
  }, [orderPick, cells]);

  const moveReportHoverPath = useMemo((): Cell[] | null => {
    const r = battleReportReplay as { kind?: string; path?: Cell[] } | null;
    if (r?.kind === 'move' && Array.isArray(r.path) && r.path.length >= 2) return r.path;
    if (r?.kind === 'airFlight' && Array.isArray(r.path) && r.path.length >= 2) return r.path;
    if (r?.kind === 'airCombat' && Array.isArray(r.path) && r.path.length >= 2) return r.path;
    return null;
  }, [battleReportReplay]);

  const cellsHoverPath =
    moveReportHoverPath ??
    (battleReportReplay != null
      ? null
      : patrolCommittedPath
          ? patrolCommittedPath
          : bombardmentCommittedPath
            ? bombardmentCommittedPath
            : orderPick && airOrderNeedsHexTarget(orderPick.orderKey)
              ? airMissionHoverPath
              : airSupportPanelMissionPreview?.pathCells &&
                  airSupportPanelMissionPreview.pathCells.length >= 2 &&
                  airOrderShowsFlightPathPreview(airSupportPanelMissionPreview.orderKey)
                ? airSupportPanelMissionPreview.pathCells
                : mapHoverPath);

  const cellsHoverPathIsAirMission =
    cellsHoverPath != null &&
    cellsHoverPath.length >= 2 &&
    ((battleReportReplay as { kind?: string } | null)?.kind === 'airFlight' ||
      (battleReportReplay as { kind?: string; path?: Cell[] } | null)?.kind === 'airCombat' ||
      Boolean(patrolCommittedPath) ||
      Boolean(bombardmentCommittedPath) ||
      Boolean(orderPick && airOrderNeedsHexTarget(orderPick.orderKey) && orderPick.orderKey !== 'bombardment' && orderPick.orderKey !== 'patrol') ||
      Boolean(orderPick?.orderKey === 'bombardment' && (orderPick.bombardmentStep ?? 'target') === 'target') ||
      Boolean(orderPick?.orderKey === 'patrol' && (orderPick.patrolStep ?? 'target') === 'target') ||
      Boolean(
        airSupportPanelMissionPreview?.pathCells &&
          airSupportPanelMissionPreview.pathCells.length >= 2 &&
          airOrderShowsFlightPathPreview(airSupportPanelMissionPreview.orderKey),
      ));

  const battleAirMissionPreview =
    orderPick && airOrderNeedsHexTarget(orderPick.orderKey)
      ? null
      : airSupportPanelMissionPreview &&
          airSupportOpen &&
          airSupportHoverUnitInstanceId != null &&
          (airSupportPanelMissionPreview.orderKey === 'interception' ||
            airSupportPanelMissionPreview.pathCells.length >= 2)
        ? {
            targetCellId: airSupportPanelMissionPreview.targetCellId,
            orderKey: airSupportPanelMissionPreview.orderKey,
          }
        : null;

  const battlePatrolPreview = useMemo((): { centerCellId: number; areaCellIds: number[]; rangeSteps: number } | null => {
    let patrolCell: Cell | null = null
    let unit: Record<string, unknown> | null = null
    let rangeSteps: number | null = null

    if (orderPick?.orderKey === 'patrol' && orderPick.patrolStep === 'radius' && orderPick.patrolTargetCellId != null) {
      patrolCell = cells.find((c) => c.id === orderPick.patrolTargetCellId) ?? null
      const iid = Number(orderPick.unit?.instanceId)
      const live = Number.isFinite(iid) ? findUnitCellByInstanceId(cells, iid) : null
      unit = ((live?.unit ?? orderPick.unit) as Record<string, unknown> | undefined) ?? null
      const maxR = unit ? readBattleVisionRange(unit) : 1
      rangeSteps = 1
      if (patrolCell && battleHoverCellId != null) {
        const hover = cells.find((c) => c.id === battleHoverCellId)
        if (hover) {
          const d = hexDistCells(patrolCell, hover)
          if (d >= 1 && d <= maxR) rangeSteps = d
        }
      }
    } else if (orderPick?.orderKey === 'patrol' && airMissionHoverPath?.length) {
      patrolCell = airMissionHoverPath[airMissionHoverPath.length - 1] ?? null
      const iid = Number(orderPick.unit?.instanceId)
      const live = Number.isFinite(iid) ? findUnitCellByInstanceId(cells, iid) : null
      unit = ((live?.unit ?? orderPick.unit) as Record<string, unknown> | undefined) ?? null
      rangeSteps = unit ? readBattleVisionRange(unit) : null
    } else if (
      airSupportOpen &&
      airSupportHoverUnitInstanceId != null &&
      airSupportPanelMissionPreview?.orderKey === 'patrol'
    ) {
      patrolCell = cells.find((c) => c.id === airSupportPanelMissionPreview.targetCellId) ?? null
      const live = findUnitCellByInstanceId(cells, airSupportHoverUnitInstanceId)
      unit = (live?.unit as Record<string, unknown> | undefined) ?? null
      const pr = airSupportPanelMissionPreview.patrolRangeSteps
      rangeSteps =
        pr != null && Number.isFinite(pr)
          ? Number(pr)
          : unit
            ? readBattleVisionRange(unit)
            : null
    }

    if (!patrolCell || !unit || rangeSteps == null) return null
    return {
      centerCellId: patrolCell.id,
      areaCellIds: computePatrolVisibilityCellIds(patrolCell, unit, cells, rangeSteps),
      rangeSteps,
    }
  }, [
    orderPick,
    airMissionHoverPath,
    airSupportOpen,
    airSupportHoverUnitInstanceId,
    airSupportPanelMissionPreview,
    cells,
    battleHoverCellId,
  ]);

  const battlePatrolVisibilityCellIds = battlePatrolPreview?.areaCellIds ?? null;
  const battlePatrolCenterCellId = battlePatrolPreview?.centerCellId ?? null;

  const patrolRangePickCellIds = useMemo((): Set<number> | null => {
    if (orderPick?.orderKey !== 'patrol' || orderPick.patrolStep !== 'radius') return null;
    const tid = orderPick.patrolTargetCellId;
    if (tid == null) return null;
    const centerCell = cells.find((c) => c.id === tid);
    if (!centerCell) return null;
    const iid = Number(orderPick.unit?.instanceId);
    const live = Number.isFinite(iid) ? findUnitCellByInstanceId(cells, iid) : null;
    const unit = ((live?.unit ?? orderPick.unit) as Record<string, unknown> | undefined) ?? null;
    if (!unit) return null;
    const maxR = readBattleVisionRange(unit);
    const ids = computePatrolRangePickCellIds(centerCell, maxR, cells);
    return ids.length ? new Set(ids) : null;
  }, [orderPick, cells]);

  const battleBombardmentAreaCellIds = useMemo((): number[] | null => {
    let targetCell: Cell | null = null
    let unit: Record<string, unknown> | null = null
    let directionFrom: Cell | null = null

    if (orderPick?.orderKey === 'bombardment' && orderPick.bombardmentStep === 'direction') {
      targetCell = cells.find((c) => c.id === orderPick.bombardmentTargetCellId) ?? null
      const iid = Number(orderPick.unit?.instanceId)
      const live = Number.isFinite(iid) ? findUnitCellByInstanceId(cells, iid) : null
      unit = ((live?.unit ?? orderPick.unit) as Record<string, unknown> | undefined) ?? null
      if (battleHoverCellId != null && bombardmentDirectionPickCellIds?.has(battleHoverCellId)) {
        directionFrom = cells.find((c) => c.id === battleHoverCellId) ?? null
      }
    } else if (
      airSupportOpen &&
      airSupportHoverUnitInstanceId != null &&
      airSupportPanelMissionPreview?.orderKey === 'bombardment'
    ) {
      targetCell = cells.find((c) => c.id === airSupportPanelMissionPreview.targetCellId) ?? null
      const dirId = airSupportPanelMissionPreview.bombardmentDirectionCellId
      directionFrom = dirId != null ? (cells.find((c) => c.id === dirId) ?? null) : null
      const live = findUnitCellByInstanceId(cells, airSupportHoverUnitInstanceId)
      unit = (live?.unit as Record<string, unknown> | undefined) ?? null
    }

    if (!targetCell || !unit || !directionFrom) return null
    return computeBombardmentAreaCellIds(targetCell, unit, cells, directionFrom)
  }, [
    orderPick,
    airSupportOpen,
    airSupportHoverUnitInstanceId,
    airSupportPanelMissionPreview,
    cells,
    battleHoverCellId,
    bombardmentDirectionPickCellIds,
  ]);

  const battleReportReplayHighlight = useMemo(
    (): BattleReportReplayHighlight | null => buildBattleReportReplayHighlight(battleReportReplay, cells),
    [battleReportReplay, cells],
  );

  const battleReportSectorHover = useMemo(
    (): BattleDefendHoverState | null => buildBattleReportSectorHover(battleReportReplay, cells),
    [battleReportReplay, cells],
  );

  const battleLogisticsPickInstanceIds = useMemo(() => {
    if (!orderPick || !['getSup', 'loading', 'tow'].includes(orderPick.orderKey)) return null;
    const live = findUnitCellByInstanceId(cells, Number(orderPick.unit.instanceId));
    if (!live) return null;
    const u = orderPick.unit as unknown as Record<string, unknown>;
    if (!isTruckUnitBattle(u)) return null;
    if (orderPick.orderKey === 'getSup') return computeGetSupTargetInstanceIds(cells, u, live.cell);
    if (orderPick.orderKey === 'loading') return computeLoadingTargetInstanceIds(cells, u, live.cell);
    return computeTowTargetInstanceIds(cells, u, live.cell);
  }, [orderPick, cells]);

  const battleUnloadCellIds = useMemo(() => {
    const resolveLiveTruck = (truck: Record<string, unknown>): Record<string, unknown> => {
      const tid = Number(truck.instanceId);
      if (!Number.isFinite(tid)) return truck;
      const live = findUnitCellByInstanceId(cells, tid);
      return live ? (live.unit as unknown as Record<string, unknown>) : truck;
    };

    if (unloadCargoPickModal) {
      const truck = resolveLiveTruck(unloadCargoPickModal.truck);
      const union = new Set<number>();
      for (const cu of unloadCargoPickModal.carried) {
        const cid = Number(cu.instanceId);
        if (!Number.isFinite(cid)) continue;
        const ids = computeUnloadCellIds(cells, truck, cid);
        if (ids) for (const id of ids) union.add(id);
      }
      return union.size > 0 ? union : null;
    }

    if (!orderPick || orderPick.orderKey !== 'unloading') return null;
    const cid = orderPick.unloadCargoInstanceId;
    if (cid == null || !Number.isFinite(Number(cid))) return null;
    const truck = resolveLiveTruck(orderPick.unit as unknown as Record<string, unknown>);
    return computeUnloadCellIds(cells, truck, Number(cid));
  }, [orderPick, cells, unloadCargoPickModal]);

  const firePickLive = useMemo(() => {
    if (!orderPick || !['fire', 'fireHard', 'attack'].includes(orderPick.orderKey)) return null;
    const iid = normalizeBattleInstanceId(orderPick.unit.instanceId);
    if (iid == null) return null;
    const live = findGroundBattleUnitByInstanceId(cells, iid);
    if (live && !live.inCargo) return { cell: live.cell, unit: live.unit };
    if (orderPick.cell && orderPick.unit) {
      return { cell: orderPick.cell, unit: orderPick.unit };
    }
    return null;
  }, [orderPick, cells]);

  const battleFireHighlights = useMemo(() => {
    if (!orderPick || !firePickLive) return null;
    if (!['fire', 'fireHard', 'attack'].includes(orderPick.orderKey)) return null;
    const u = firePickLive.unit as unknown as Record<string, unknown>;
    const fireOptions =
      orderPick.orderKey === 'fire' && orderPick.useFireAdjustment
        ? { useFireAdjustment: true, viewerFaction: myBattleFaction }
        : orderPick.orderKey === 'fire'
          ? { useFireAdjustment: false, viewerFaction: myBattleFaction }
          : undefined;
    return computeBattleFireHighlights(
      u,
      firePickLive.cell,
      cells,
      orderPick.orderKey as 'fire' | 'fireHard' | 'attack',
      battleFogRevealedCellIds,
      fireOptions,
    );
  }, [orderPick, cells, firePickLive, battleFogRevealedCellIds, myBattleFaction]);

  const fireAdjustmentToggleAvailable = useMemo(() => {
    if (!orderPick || orderPick.orderKey !== 'fire' || !firePickLive) return false;
    const u = firePickLive.unit as unknown as Record<string, unknown>;
    if (!canArtilleryUseFireAdjustment(u, 'fire')) return false;
    const findUnitById = (id: number) => {
      const live = findUnitCellByInstanceId(cells, id);
      return (live?.unit as Record<string, unknown> | undefined) ?? null;
    };
    return canOfferFireAdjustment(cells, myBattleFaction, pendingOrders, findUnitById);
  }, [orderPick, firePickLive, cells, myBattleFaction, pendingOrders]);

  const battleFireTargetInstanceIds = useMemo(() => {
    if (
      !battleFireHighlights ||
      !orderPick ||
      !['fire', 'fireHard', 'attack'].includes(orderPick.orderKey)
    ) {
      return null;
    }
    const out: number[] = [];
    for (const raw of battleFireHighlights.instanceIds) {
      const id = normalizeBattleInstanceId(raw);
      if (id != null) out.push(id);
    }
    return out.length > 0 ? out : null;
  }, [battleFireHighlights, orderPick]);

  const battleAreaFireCellIds =
    battleFireHighlights && (orderPick?.orderKey === 'fire' || orderPick?.orderKey === 'fireHard')
      ? battleFireHighlights.areaCellIds
      : null;

  const battlePendingShootPreview = useMemo((): BattlePendingShootPreview | null => {
    if (!battleUnitTip || battleUnitOrders) return null;
    const u = battleUnitTip.unit;
    if (!unitIsMineOnMap(u, myBattleFaction)) return null;
    const iid = Number(u.instanceId);
    if (!Number.isFinite(iid)) return null;
    const p = pendingOrders.find((x) => x.unitInstanceId === iid);
    if (!p || !['fire', 'fireHard', 'attack'].includes(p.orderKey)) return null;
    if (p.targetUnitInstanceId != null) {
      return {
        targetInstanceId: p.targetUnitInstanceId,
        orderKey: p.orderKey as 'fire' | 'fireHard' | 'attack',
      };
    }
    if ((p.orderKey === 'fire' || p.orderKey === 'fireHard') && p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
      return { targetCellId: Number(p.targetCellId), orderKey: p.orderKey };
    }
    return null;
  }, [battleUnitTip, battleUnitOrders, pendingOrders, myBattleFaction, unitIsMineOnMap]);

  const battlePendingLogisticsPreview = useMemo((): BattlePendingLogisticsPreview | null => {
    if (!battleUnitTip || battleUnitOrders) return null;
    const u = battleUnitTip.unit as unknown as Record<string, unknown>;
    if (!unitIsMineOnMap(u, myBattleFaction) || !isTruckUnitBattle(u)) return null;
    const iid = Number(u.instanceId);
    if (!Number.isFinite(iid)) return null;
    const p = pendingOrders.find((x) => x.unitInstanceId === iid);
    if (!p) return null;
    const tid = p.targetUnitInstanceId;
    const tcid = p.targetCellId;
    if (p.orderKey === 'tow' && tid != null && Number.isFinite(Number(tid))) return { kind: 'tow', targetInstanceId: Number(tid) };
    if (p.orderKey === 'loading' && tid != null && Number.isFinite(Number(tid))) return { kind: 'loading', targetInstanceId: Number(tid) };
    if (p.orderKey === 'getSup' && tid != null && Number.isFinite(Number(tid))) return { kind: 'getSup', targetInstanceId: Number(tid) };
    if (p.orderKey === 'unloading' && tcid != null && Number.isFinite(Number(tcid))) return { kind: 'unloading', targetCellId: Number(tcid) };
    return null;
  }, [battleUnitTip, battleUnitOrders, pendingOrders, myBattleFaction, unitIsMineOnMap]);

  const battleDefendHover = useMemo((): BattleDefendHoverState | null => {
    if (!battleUnitTip || battleUnitOrders) return null;
    if (battleUnitTip.capturedAtTurn !== turn) return null;
    const u = battleUnitTip.unit as unknown as Record<string, unknown>;
    if (!unitIsMineOnMap(u, myBattleFaction)) return null;
    const iid = Number(u.instanceId);
    if (!Number.isFinite(iid)) return null;
    const isArtillery = String(u.type || '').toLowerCase() === 'artillery';
    const p = pendingOrders.find(
      (x) =>
        x.unitInstanceId === iid &&
        (x.orderKey === 'defend' || x.orderKey === 'ambush' || x.orderKey === 'deploy' || x.orderKey === 'changeSector' || x.orderKey === 'clotting'),
    );
    if (isArtillery) {
      if (p?.orderKey === 'clotting') {
        const live = findUnitCellByInstanceId(cells, iid);
        if (!live) return null;
        return {
          unitInstanceId: iid,
          facingCellId: live.cell.id,
          sectorCellIds: [],
          defendKind: 'defend',
          showClottingDecalOnUnit: true,
          unitStandingCellId: live.cell.id,
        };
      }
      if (p?.defendFacingCellId != null && p.defendMaxRangeSteps != null && (p.orderKey === 'deploy' || p.orderKey === 'changeSector')) {
        const live = findUnitCellByInstanceId(cells, iid);
        const fc = cells.find((c) => c.id === p.defendFacingCellId);
        if (!live || !fc) return null;
        return {
          unitInstanceId: iid,
          facingCellId: fc.id,
          sectorCellIds: [],
          defendKind: 'defend',
          facingDecal: p.orderKey === 'deploy' ? 'deploy' : 'changeSector',
          unitStandingCellId: live.cell.id,
        };
      }
      return null;
    }
    if (p?.defendFacingCellId != null && p.defendMaxRangeSteps != null) {
      const live = findUnitCellByInstanceId(cells, iid);
      const fc = cells.find((c) => c.id === p.defendFacingCellId);
      if (!live || !fc) return null;
      const sectorCells = computeDefendSectorCells(live.cell, fc, cells, u, Number(p.defendMaxRangeSteps));
      return {
        unitInstanceId: iid,
        facingCellId: fc.id,
        sectorCellIds: sectorCells.map((c) => c.id),
        defendKind: p.orderKey === 'ambush' ? 'ambush' : 'defend',
      };
    }
    const facingRaw = u.defendFacingCellId;
    const sectorRaw = u.defendSectorCellIds;
    const facingId = Number(facingRaw);
    const cap = Number(u.defendMaxRangeSteps);
    const isArtUnit = String(u.type || '').toLowerCase() === 'artillery';
    if (Number.isFinite(facingId) && Number.isFinite(cap) && cap >= 1) {
      if (!isArtUnit || artilleryUsesFireSectorProperty(u)) {
        const live = findUnitCellByInstanceId(cells, iid);
        const fc = cells.find((c) => c.id === facingId);
        if (live && fc) {
          const sectorCells = computeDefendSectorCells(live.cell, fc, cells, u, cap);
          const tac = u.tactical as { ambushOrder?: boolean; defendOrder?: boolean } | undefined;
          const defendKind: 'defend' | 'ambush' = tac?.ambushOrder && !tac?.defendOrder ? 'ambush' : 'defend';
          return {
            unitInstanceId: iid,
            facingCellId: facingId,
            sectorCellIds: sectorCells.map((c) => c.id),
            defendKind,
          };
        }
      }
    }
    const liveArt = findUnitCellByInstanceId(cells, iid);
    if (liveArt) {
      const artSec = getArtillerySectorCellIdSet(u, liveArt.cell, cells);
      if (artSec && artSec.size > 0) {
        const fid = Number(u.defendFacingCellId);
        const tac = u.tactical as { ambushOrder?: boolean; defendOrder?: boolean } | undefined;
        const defendKind: 'defend' | 'ambush' = tac?.ambushOrder && !tac?.defendOrder ? 'ambush' : 'defend';
        return {
          unitInstanceId: iid,
          facingCellId: Number.isFinite(fid) ? fid : liveArt.cell.id,
          sectorCellIds: [...artSec],
          defendKind,
        };
      }
    }
    if (!Number.isFinite(facingId) || !Array.isArray(sectorRaw) || sectorRaw.length === 0) return null;
    if (isArtUnit && !artilleryUsesFireSectorProperty(u)) return null;
    const sectorCellIds = sectorRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    if (!sectorCellIds.length) return null;
    const tac2 = u.tactical as { ambushOrder?: boolean; defendOrder?: boolean } | undefined;
    const defendKind2: 'defend' | 'ambush' = tac2?.ambushOrder && !tac2?.defendOrder ? 'ambush' : 'defend';
    return {
      unitInstanceId: iid,
      facingCellId: facingId,
      sectorCellIds,
      defendKind: defendKind2,
    };
  }, [battleUnitTip, battleUnitOrders, pendingOrders, cells, myBattleFaction, turn, unitIsMineOnMap]);

  const defendRangeOrderPreview = useMemo((): BattleDefendHoverState | null => {
    if (!orderPick || orderPick.defendStep !== 'range') return null;
    if (orderPick.orderKey !== 'defend' && orderPick.orderKey !== 'ambush') return null;
    const fid = orderPick.defendFacingPickedId;
    if (fid == null) return null;
    const u = orderPick.unit as unknown as Record<string, unknown>;
    const iid = Number(u.instanceId);
    if (!Number.isFinite(iid)) return null;
    const live = findUnitCellByInstanceId(cells, iid);
    const fc = cells.find((c) => c.id === fid);
    if (!live || !fc) return null;
    const wmax = maxShootRangeStepsForUnit(u);
    if (wmax < 1) return null;
    const sectorCells = computeDefendSectorCells(live.cell, fc, cells, u, wmax);
    const base: BattleDefendHoverState = {
      unitInstanceId: iid,
      facingCellId: fid,
      sectorCellIds: sectorCells.map((c) => c.id),
      defendKind: orderPick.orderKey === 'ambush' ? 'ambush' : 'defend',
      showSectorWithoutUnitHover: true,
    };
    if (battleHoverCellId != null && defendRangePickCellIds?.has(battleHoverCellId)) {
      const hCell = cells.find((c) => c.id === battleHoverCellId);
      if (hCell) {
        const d = hexDistCells(live.cell, hCell);
        const cap2 = Math.max(1, Math.min(wmax, d));
        base.commitPreviewSectorCellIds = computeDefendSectorCells(live.cell, fc, cells, u, cap2).map((c) => c.id);
      }
    }
    return base;
  }, [orderPick, cells, battleHoverCellId, defendRangePickCellIds]);

  const battleAirUnitsInFlight = useMemo(() => collectAirUnitsInFlight(cells, turn), [cells, turn]);

  const battleAirInterceptionTargets = useMemo(() => {
    if (orderPick?.orderKey !== 'interception') return null;
    const targets = collectEnemyAirInterceptionTargets(
      cells,
      viewerBattleFaction,
      battleFogRevealedCellIds,
    );
    return targets.length ? targets : null;
  }, [orderPick?.orderKey, cells, viewerBattleFaction, battleFogRevealedCellIds]);

  return {
    battleCellSize,
    battleFogRevealedCellIds,
    moveReachableCellIds,
    cutWireTargetCellIds,
    enterDotTargetCellIds,
    defendFacingPickCellIds,
    defendRangePickCellIds,
    defendPickHighlightCellIds,
    cellsHoverPath,
    battleReportReplayHighlight,
    battleReportSectorHover,
    battleLogisticsPickInstanceIds,
    battleUnloadCellIds,
    battleFireTargetInstanceIds,
    battleAreaFireCellIds,
    battlePendingShootPreview,
    battlePendingLogisticsPreview,
    battleDefendHover,
    defendRangeOrderPreview,
    battleAirDeparturePickCellId,
    battleAirMissionPreview,
    battlePatrolVisibilityCellIds,
    battlePatrolCenterCellId,
    patrolRangePickCellIds,
    battleBombardmentAreaCellIds,
    bombardmentDirectionPickCellIds,
    bombardmentApproachCellId,
    cellsHoverPathIsAirMission,
    battleAirInterceptionTargets,
    battleAirUnitsInFlight,
    fireAdjustmentToggleAvailable,
  };
}

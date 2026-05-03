import { useMemo } from 'react';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import type { LobbyFaction, BattleOrderPayload } from '../../api/rooms';
import { computeBattleCellSize } from '../../game/battleMapFit';
import {
  findMovementPath,
  findReachableCells,
  findUnitCellByInstanceId,
  getBattleMoveBudgetForOrder,
  pathTerrainCost,
  type BattleMovePreviewUnit,
} from '../../game/battleMovePreview';
import { computeBattleFireHighlights, hexDistCells, maxShootRangeStepsForUnit } from '../../game/battleFirePreview';
import { computeDefendSectorCells, findFacingNeighborCells } from '../../game/battleDefendSector';
import {
  computeGetSupTargetInstanceIds,
  computeLoadingTargetInstanceIds,
  computeTowTargetInstanceIds,
  computeUnloadCellIds,
  isTruckUnitBattle,
} from '../../game/battleLogisticsUi';
import { HexVisibility } from '../../game/hexVisibility';
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
  } = params;

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

  const battleFogRevealedCellIds = useMemo(() => {
    if (viewerBattleFaction === 'none') return null;
    const hv = new HexVisibility(cells);
    const revealed = new Set<number>();
    for (const cell of cells) {
      for (const u of cell.units || []) {
        const raw = u as unknown as Record<string, unknown>;
        if (!unitIsMineOnMap(raw, viewerBattleFaction)) continue;
        const vr = readBattleUnitNumber(raw, 'vis', 'visible', 'visibleRange');
        const r = vr != null && vr > 0 ? vr : 6;
        hv.computeVisibleCellIds(cell, r).forEach((id) => revealed.add(id));
      }
    }
    return revealed;
  }, [cells, viewerBattleFaction, unitIsMineOnMap]);

  const moveReachableCellIds = useMemo(() => {
    if (!orderPick || !movePreviewLive) return null;
    if (orderPick.orderKey !== 'move' && orderPick.orderKey !== 'moveWar') return null;
    const u = movePreviewLive.unit as unknown as Record<string, unknown>;
    const profile: BattleMovePreviewUnit = {
      type: String(u.type ?? 'infantry'),
      faction: String(u.faction ?? ''),
    };
    const budget = getBattleMoveBudgetForOrder(u, orderPick.orderKey as 'move' | 'moveWar');
    const reachable = findReachableCells(movePreviewLive.cell, budget, cells, profile, battleFogRevealedCellIds);
    const ids = new Set(reachable.map((c) => c.id));
    ids.delete(movePreviewLive.cell.id);
    return ids;
  }, [orderPick, cells, movePreviewLive, battleFogRevealedCellIds]);

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
    };
    const path = findMovementPath(live.cell, target, cells, profile, battleFogRevealedCellIds);
    if (!path || path.length < 2) return moveHoverPath;
    const maxCost = getBattleMoveBudgetForOrder(u, p.orderKey as 'move' | 'moveWar');
    if (pathTerrainCost(path, profile.type) > maxCost) return moveHoverPath;
    return path;
  }, [battleUnitTip, battleUnitOrders, orderPick, pendingOrders, cells, moveHoverPath, battleFogRevealedCellIds]);

  const reportReplay: any = battleReportReplay;
  const cellsHoverPath =
    reportReplay?.kind === 'move' && Array.isArray(reportReplay.path)
      ? (reportReplay.path as Cell[])
      : battleReportReplay != null
        ? null
        : mapHoverPath;

  const battleReportReplayHighlight = useMemo(
    (): BattleReportReplayHighlight | null => buildBattleReportReplayHighlight(battleReportReplay),
    [battleReportReplay],
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
    const iid = Number(orderPick.unit.instanceId);
    if (!Number.isFinite(iid)) return null;
    return findUnitCellByInstanceId(cells, iid);
  }, [orderPick, cells]);

  const battleFireHighlights = useMemo(() => {
    if (!orderPick || !firePickLive) return null;
    if (!['fire', 'fireHard', 'attack'].includes(orderPick.orderKey)) return null;
    const u = firePickLive.unit as unknown as Record<string, unknown>;
    return computeBattleFireHighlights(
      u,
      firePickLive.cell,
      cells,
      orderPick.orderKey as 'fire' | 'fireHard' | 'attack',
      battleFogRevealedCellIds,
    );
  }, [orderPick, cells, firePickLive, battleFogRevealedCellIds]);

  const battleFireTargetInstanceIds =
    battleFireHighlights &&
    (orderPick?.orderKey === 'fire' || orderPick?.orderKey === 'fireHard' || orderPick?.orderKey === 'attack')
      ? battleFireHighlights.instanceIds
      : null;

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
    if (Number.isFinite(facingId) && Number.isFinite(cap) && cap >= 1) {
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
    if (!Number.isFinite(facingId) || !Array.isArray(sectorRaw) || sectorRaw.length === 0) return null;
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

  return {
    battleCellSize,
    battleFogRevealedCellIds,
    moveReachableCellIds,
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
  };
}

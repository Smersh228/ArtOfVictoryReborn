import React from 'react';
import Cells from '../map/Cells';
import styles from '../../pages/styleModules/battle.module.css';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import BattleMapHud from './BattleMapHud';
import BattleResolvingOverlay from './BattleResolvingOverlay';
import { findUnitCellByInstanceId, findGroundBattleUnitByInstanceId, battleInstanceIdInList, findMovementPath } from '../../game/battleMovePreview';
import { airOrderNeedsHexTarget, computeBombardmentAreaCellIds, isAirUnitAirborneForInterception, isBattleAirUnitType, readAirFlightPositionCellId, readBattleVisionRange, readReconRingStepsFromUnit } from '../../game/battleAirSupport';
import { battleUnitHasPropKey, hexDistCells, maxAirMissionHexStepsForUnit, maxShootRangeStepsForUnit } from '../../game/battleFirePreview';
import { cellsEligibleForCutWire, edgeIndexFromPoint } from '../../game/cellWireEdges';
import { cellsEligibleForTrenchFacing, isTrenchForbiddenOnCell } from '../../game/cellTrenchEdges';
import { cellsEligibleForCutEj } from '../../game/cellAntiTankEdges';
import { cellsEligibleForPonton } from '../../game/cellPonton';
import { cellsEligibleForDemining } from '../../game/editorMapFortifications';
import { cellsEligibleForExplomost } from '../../game/cellSmoke';
import { getCellCenter } from '../map/cellsInteraction';
import {
  buildDotHoverTip,
  cellsEligibleForEnterDot,
  cellsEligibleForExitDot,
  hasDotOnCell,
  resolveDotOccupantUnit,
  shouldShowDotTipForUnitHover,
} from '../../game/cellDot';
import { computeHexFlightPathCellIds, computeInterceptionMeetingCell } from '../../game/battleFlightPath';
import { cellHasWarehouse, buildStorageHoverTip, maxAmmoLoadFromWarehouse, maxAmmoTransferFromTruckTo, readStorageAmmo } from '../../game/battleLogisticsUi';
import { hoverTipFromDot, type BattleHoverTipView } from './BattleDotTipCard';
import { buildMineHoverTip, isMineVisibleOnBattleMap } from '../../game/editorMapFortifications';
import { fireMoveLosCellIds } from '../../game/battleHiddenState';

type BattleMapStageProps = {
  battleMapLoad: 'loading' | 'ready';
  hasGrid: boolean;
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  battleHoverCellId: number | null;
  orderPick: { orderKey?: string; unit?: { instanceId?: number | string; faction?: string }; unloadCargoInstanceId?: number | string | null; defendStep?: 'facing' | 'range'; defendFacingPickedId?: number } | null;
  battleAreaFireCellIds: number[] | null;
  battleDotSectorCellIds?: number[] | null;
  enterDotGlowCellIds?: number[] | null;
  loadingSupGlowCellIds?: number[] | null;
  cells: Cell[];
  mapViewport: { w: number; h: number };
  battleCellSize: number;
  battlePointerCursor: string;
  viewerBattleFaction: 'rkka' | 'wehrmacht' | 'none';
  viewerBattleTeam?: number | null;
  battleUnitOrders: { unit: { [key: string]: any }; cell: Cell; clientX: number; clientY: number } | null;
  turn: number;
  setBattleUnitTip: (tip: { unit: { [key: string]: any }; cell: Cell; clientX: number; clientY: number; capturedAtTurn: number } | null) => void;
  setBattleDotTip: React.Dispatch<
    React.SetStateAction<{
      cell: Cell;
      clientX: number;
      clientY: number;
      tip: BattleHoverTipView;
      pinned?: boolean;
    } | null>
  >;
  setBattleHoverCellId: React.Dispatch<React.SetStateAction<number | null>>;
  moveReachableCellIds: number[] | null;
  defendPickHighlightCellIds: number[] | null;
  defendRangeOrderPreview: any;
  battleReportSectorHover: any;
  battleDefendHover: any;
  battleFireTargetInstanceIds: number[] | null;
  battlePendingShootPreview: any;
  cellsHoverPath: Cell[] | null;
  cellsHoverPathIsAirMission?: boolean;
  battleReportReplayHighlight: any;
  battleFogRevealedCellIds: number[] | null;
  battleLogisticsPickInstanceIds: number[] | null;
  battleUnloadCellIds: number[] | null;
  battleAirDepartureHoverCellId: number | null;
  battleAirDeparturePickCellId: number | null;
  battleAirMissionPreview: { targetCellId: number; orderKey: string } | null;
  battlePatrolVisibilityCellIds: number[] | null;
  battlePatrolCenterCellId: number | null;
  battleBombardmentAreaCellIds: number[] | null;
  bombardmentDirectionPickCellIds: number[] | null;
  bombardmentApproachCellId: number | null;
  patrolRangePickCellIds: number[] | null;
  battleAirInterceptionTargets: import('../../game/battleAirSupport').AirInterceptionTarget[] | null;
  battleAirUnitsInFlight: import('../../game/battleAirSupport').AirUnitInFlight[];
  fireAdjustmentToggleAvailable?: boolean;
  battlePendingLogisticsPreview: any;
  orderPickRef: React.MutableRefObject<{ [key: string]: any } | null>;
  apiRoomId: number | null;
  dismissOrderPicking: () => void;
  setPendingOrders: (updater: (prev: BattleOrderPayload[]) => BattleOrderPayload[]) => void;
  factionsOpposedOnMap: (fa: string, fb: string) => boolean;
  readonlyBattle: boolean;
  myBattleFaction: 'rkka' | 'wehrmacht' | 'none';
  unitIsMineOnMap: (unit: { [key: string]: any }, viewerFaction: 'rkka' | 'wehrmacht' | 'none') => boolean;
  readBattleUnitOrdersFromPayload: (unit: { [key: string]: any }) => { id: number; name: string; order_key?: string }[];
  setBattleUnitOrders: (value: { unit: { [key: string]: any }; cell: Cell; clientX: number; clientY: number } | null) => void;
  defendRangePickCellIds: number[] | null;
  defendFacingPickCellIds: number[] | null;
  setOrderPick: (value: any) => void;
  setBattleAmmoModal: (value: any) => void;
  showResolvingOverlay: boolean;
  resolvingTitle?: string;
  resolvingHint?: string;
  hiddenBattleInstanceIds?: number[] | null;
};

const BattleMapStage: React.FC<BattleMapStageProps> = ({
  battleMapLoad,
  hasGrid,
  mapWrapRef,
  battleHoverCellId,
  orderPick,
  battleAreaFireCellIds,
  battleDotSectorCellIds = null,
  enterDotGlowCellIds = null,
  loadingSupGlowCellIds = null,
  cells,
  mapViewport,
  battleCellSize,
  battlePointerCursor,
  viewerBattleFaction,
  viewerBattleTeam = null,
  battleUnitOrders,
  turn,
  setBattleUnitTip,
  setBattleDotTip,
  setBattleHoverCellId,
  moveReachableCellIds,
  defendPickHighlightCellIds,
  defendRangeOrderPreview,
  battleReportSectorHover,
  battleDefendHover,
  battleFireTargetInstanceIds,
  battlePendingShootPreview,
  cellsHoverPath,
  cellsHoverPathIsAirMission,
  battleReportReplayHighlight,
  battleFogRevealedCellIds,
  battleLogisticsPickInstanceIds,
  battleUnloadCellIds,
  battleAirDepartureHoverCellId,
  battleAirDeparturePickCellId,
  battleAirMissionPreview,
  battlePatrolVisibilityCellIds,
  battlePatrolCenterCellId,
  battleBombardmentAreaCellIds,
  bombardmentDirectionPickCellIds,
  bombardmentApproachCellId,
  patrolRangePickCellIds,
  battleAirInterceptionTargets,
  battleAirUnitsInFlight,
  fireAdjustmentToggleAvailable,
  battlePendingLogisticsPreview,
  orderPickRef,
  apiRoomId,
  dismissOrderPicking,
  setPendingOrders,
  factionsOpposedOnMap,
  readonlyBattle,
  myBattleFaction,
  unitIsMineOnMap,
  readBattleUnitOrdersFromPayload,
  setBattleUnitOrders,
  defendRangePickCellIds,
  defendFacingPickCellIds,
  setOrderPick,
  setBattleAmmoModal,
  showResolvingOverlay,
  resolvingTitle,
  resolvingHint,
  hiddenBattleInstanceIds = null,
}) => {
  const parseId = (value: string | number | null | undefined): number => parseInt(`${value ?? ''}`, 10);
  const isValidId = (value: number): boolean => Number.isFinite(value);
  const tryOpenGetSupModal = (truckUnit: { [key: string]: any }, recipient: { [key: string]: any }): boolean => {
    const truckId = parseId(truckUnit.instanceId);
    const liveTruck = Number.isFinite(truckId) ? findUnitCellByInstanceId(cells, truckId) : null;
    const giver = (liveTruck?.unit ?? truckUnit) as { [key: string]: any };
    if (!battleInstanceIdInList(battleLogisticsPickInstanceIds, recipient.instanceId)) return false;
    const max = maxAmmoTransferFromTruckTo(giver, recipient);
    if (max < 1) return false;
    setBattleUnitTip(null);
    setBattleAmmoModal({
      giver,
      receiver: recipient,
      maxTransfer: max,
    });
    return true;
  };
  const findLogisticsTargetOnCell = (cell: Cell): { [key: string]: any } | null => {
    const ids = battleLogisticsPickInstanceIds;
    if (!ids?.length) return null;
    for (const raw of cell.units || []) {
      const u = raw as { [key: string]: any };
      if (battleInstanceIdInList(ids, u.instanceId)) return u;
    }
    return null;
  };
  const sameCellId = (a: unknown, b: unknown): boolean => {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
  };
  const cellIdInList = (ids: number[] | null | undefined, cellId: unknown): boolean => {
    if (!ids?.length) return false;
    return ids.some((id) => sameCellId(id, cellId));
  };
  const hexTargetOrderKeys = new Set([
    'enterDot',
    'exitDot',
    'cutWire',
    'trenches',
    'buildPonton',
    'cutEj',
    'demining',
    'smoke',
    'explomost',
    'move',
    'moveWar',
    'unloading',
    'railUnloading',
    'loadingSup',
    'defend',
    'ambush',
    'deploy',
    'changeSector',
    'bombardment',
    'patrol',
    'razvedka',
    'svzy',
  ]);
  const ignoreUnitClicks = Boolean(
    orderPick?.orderKey &&
      (hexTargetOrderKeys.has(String(orderPick.orderKey)) ||
        (orderPick.orderKey === 'fireMove' &&
          (orderPick as { fireMoveStep?: string }).fireMoveStep &&
          (orderPick as { fireMoveStep?: string }).fireMoveStep !== 'target')),
  );
  const loadingSupHoverTruckId = (() => {
    if (battleHoverCellId == null) return null;
    const pendingWh =
      battlePendingLogisticsPreview?.kind === 'loadingSup' &&
      Number(battlePendingLogisticsPreview.targetCellId) === Number(battleHoverCellId)
        ? Number(battlePendingLogisticsPreview.truckInstanceId)
        : null;
    if (Number.isFinite(pendingWh) && pendingWh != null && pendingWh > 0) return pendingWh;
    if (orderPick?.orderKey !== 'loadingSup' || !cellIdInList(loadingSupGlowCellIds, battleHoverCellId)) return null;
    const tid = parseId(orderPick.unit?.instanceId);
    return isValidId(tid) ? tid : null;
  })();
  const loadingSupHoverPreview = battlePendingLogisticsPreview;
  const fireOrderExtras = (pick: { orderKey?: string; useFireAdjustment?: boolean }) =>
    pick.orderKey === 'fire' && pick.useFireAdjustment ? { useFireAdjustment: true as const } : {};
  const upsertOrder = (
    prev: BattleOrderPayload[],
    unitInstanceId: number,
    payload: BattleOrderPayload,
  ): BattleOrderPayload[] => {
    const next: BattleOrderPayload[] = [];
    for (const row of prev) {
      if (row.unitInstanceId !== unitInstanceId) next.push(row);
    }
    next.push(payload);
    return next;
  };

  const pinnedMineCellIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    pinnedMineCellIdRef.current = null;
  }, [turn]);

  const clearPinnedMineInfo = () => {
    pinnedMineCellIdRef.current = null;
    setBattleDotTip(null);
  };

  const pinMineInfo = (cell: Cell, clientX: number, clientY: number) => {
    pinnedMineCellIdRef.current = Number(cell.id);
    setBattleUnitTip(null);
    setBattleDotTip({
      cell,
      clientX,
      clientY,
      tip: buildMineHoverTip(cell.builds),
      pinned: true,
    });
  };

  const trySubmitAirHexOrderPick = (cell: Cell): boolean => {
    const pick = orderPickRef.current;
    const ok = String(pick?.orderKey ?? '').trim();
    if (!pick || !airOrderNeedsHexTarget(ok) || apiRoomId == null || !isFinite(apiRoomId)) return false;
    const uid = parseId(pick.unit.instanceId);
    if (!isValidId(uid)) {
      dismissOrderPicking();
      return true;
    }
    const liveIA = findUnitCellByInstanceId(cells, uid);
    if (!liveIA) {
      dismissOrderPicking();
      return true;
    }
    const uIA = pick.unit as { [key: string]: any };
    const maxDist = maxAirMissionHexStepsForUnit(uIA);
    const distIA = hexDistCells(liveIA.cell, cell);
    if (distIA < 1 || distIA > maxDist) {
      dismissOrderPicking();
      return true;
    }
    const pathIdsIA = computeHexFlightPathCellIds(cells, liveIA.cell, cell);
    if (!pathIdsIA) {
      dismissOrderPicking();
      return true;
    }
    if (ok === 'bombardment' && (pick.bombardmentStep ?? 'target') === 'target') {
      setBattleUnitTip(null);
      setOrderPick({
        ...pick,
        bombardmentStep: 'direction',
        bombardmentTargetCellId: cell.id,
        bombardmentFlightPathCellIds: pathIdsIA,
      });
      return true;
    }
    if (ok === 'bombardment') {
      return false;
    }
    if (ok === 'patrol' && (pick.patrolStep ?? 'target') === 'target') {
      setBattleUnitTip(null);
      setOrderPick({
        ...pick,
        patrolStep: 'radius',
        patrolTargetCellId: cell.id,
        patrolFlightPathCellIds: pathIdsIA,
      });
      return true;
    }
    if (ok === 'patrol') {
      return false;
    }
    setBattleUnitTip(null);
    setPendingOrders((prev) =>
      upsertOrder(prev, uid, {
        unitInstanceId: uid,
        orderKey: ok,
        targetCellId: cell.id,
        flightPathCellIds: pathIdsIA,
      }),
    );
    dismissOrderPicking();
    return true;
  };

  const trySubmitInterceptionPick = (targetUnit: Record<string, unknown>): boolean => {
    const pick = orderPickRef.current;
    if (!pick || pick.orderKey !== 'interception' || apiRoomId == null || !isFinite(apiRoomId)) {
      return false;
    }
    const iid = parseId((targetUnit as { instanceId?: unknown }).instanceId);
    const interceptorIid = parseId(pick.unit?.instanceId);
    if (!isValidId(interceptorIid) || !isValidId(iid) || interceptorIid === iid) {
      dismissOrderPicking();
      return true;
    }
    if (!isBattleAirUnitType((targetUnit as { type?: unknown }).type)) {
      dismissOrderPicking();
      return true;
    }
    const af = `${pick.unit?.faction ?? ''}`;
    const tf = `${targetUnit.faction ?? ''}`;
    if (!factionsOpposedOnMap(af, tf)) {
      dismissOrderPicking();
      return true;
    }
    const liveIA = findUnitCellByInstanceId(cells, interceptorIid);
    const targetLive = findUnitCellByInstanceId(cells, iid);
    if (!liveIA || !targetLive) {
      dismissOrderPicking();
      return true;
    }
    const targetRec = targetLive.unit as Record<string, unknown>;
    if (!isAirUnitAirborneForInterception(targetRec)) {
      dismissOrderPicking();
      return true;
    }
    const meeting = computeInterceptionMeetingCell(
      cells,
      liveIA.cell,
      targetRec,
      (unit, _fallbackId) => readAirFlightPositionCellId(unit, targetLive.cell.id),
    );
    if (!meeting) {
      dismissOrderPicking();
      return true;
    }
    setBattleUnitTip(null);
    setPendingOrders((prev) =>
      upsertOrder(prev, interceptorIid, {
        unitInstanceId: interceptorIid,
        orderKey: 'interception',
        targetUnitInstanceId: iid,
        targetCellId: meeting.meetingCellId,
        flightPathCellIds: meeting.interceptorPath,
      }),
    );
    dismissOrderPicking();
    return true;
  };

  return (
    <div className={styles.battleMap} role="region" aria-label="Карта боя">
      {battleMapLoad === 'loading' ? (
        <p className={styles.mapPlaceholder}>Загрузка карты…</p>
      ) : hasGrid ? (
        <div ref={mapWrapRef} className={styles.mapCanvasWrap}>
          <BattleMapHud
            battleHoverCellId={battleHoverCellId}
            orderPick={orderPick}
            battleAreaFireCellIds={battleAreaFireCellIds}
            fireAdjustmentToggleAvailable={fireAdjustmentToggleAvailable}
            onToggleFireAdjustment={() => {
              setOrderPick((prev: { useFireAdjustment?: boolean } | null) =>
                prev ? { ...prev, useFireAdjustment: !prev.useFireAdjustment } : prev,
              );
            }}
          />
          <Cells
            mode="battle"
            cells={cells}
            width={mapViewport.w}
            height={mapViewport.h}
            cellSize={battleCellSize}
            wrapClassName={styles.battleCellsRoot}
            battleHoverCursor={battlePointerCursor}
            viewerBattleFaction={viewerBattleFaction}
            viewerBattleTeam={viewerBattleTeam}
            ignoreUnitClicks={ignoreUnitClicks}
            hiddenBattleInstanceIds={hiddenBattleInstanceIds}
            onUnitHover={(unit, cell, e) => {
              if (battleUnitOrders) return;
              const u = unit as Record<string, unknown>;
              if (shouldShowDotTipForUnitHover(cell, u)) {
                setBattleUnitTip(null);
                setBattleDotTip({
                  cell,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  tip: hoverTipFromDot(buildDotHoverTip(cell, cells, viewerBattleFaction)),
                });
                return;
              }
              setBattleDotTip(null);
              setBattleUnitTip({
                unit: u,
                cell,
                clientX: e.clientX,
                clientY: e.clientY,
                capturedAtTurn: turn,
              });
            }}
            onUnitLeave={() => {
              setBattleUnitTip(null);
            }}
            onCellHover={(cell, e) => {
              setBattleHoverCellId(cell?.id ?? null);
              if (pinnedMineCellIdRef.current != null) return;
              const fogHidesBuilding =
                battleFogRevealedCellIds != null &&
                viewerBattleFaction !== 'none' &&
                cell != null &&
                !battleFogRevealedCellIds.some((id) => Number(id) === Number(cell.id));
              if (cell && hasDotOnCell(cell.builds) && !battleUnitOrders && !fogHidesBuilding) {
                setBattleDotTip({
                  cell,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  tip: hoverTipFromDot(buildDotHoverTip(cell, cells, viewerBattleFaction)),
                });
              } else if (cell && cellHasWarehouse(cell) && !battleUnitOrders && !fogHidesBuilding) {
                setBattleDotTip({
                  cell,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  tip: buildStorageHoverTip(cell),
                });
              } else if (cell && isMineVisibleOnBattleMap(cell.builds, viewerBattleFaction) && !battleUnitOrders) {
                setBattleDotTip({
                  cell,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  tip: buildMineHoverTip(cell.builds),
                });
              } else {
                setBattleDotTip(null);
              }
            }}
            onCellLeave={() => {
              setBattleHoverCellId(null);
              if (pinnedMineCellIdRef.current != null) return;
              setBattleDotTip(null);
            }}
            moveReachableCellIds={moveReachableCellIds}
            defendFacingPickCellIds={defendPickHighlightCellIds}
            battleDefendHover={defendRangeOrderPreview ?? battleReportSectorHover ?? battleDefendHover}
            battleFireTargetInstanceIds={battleFireTargetInstanceIds}
            battleAreaFireCellIds={battleAreaFireCellIds}
            battleDotSectorCellIds={battleDotSectorCellIds}
            enterDotGlowCellIds={enterDotGlowCellIds}
            loadingSupGlowCellIds={loadingSupGlowCellIds}
            battlePendingShootPreview={battlePendingShootPreview}
            hoverPath={cellsHoverPath}
            hoverPathIsAirMission={cellsHoverPathIsAirMission}
            battleReportReplayHighlight={battleReportReplayHighlight}
            battleFogRevealedCellIds={battleFogRevealedCellIds}
            battleLogisticsPickInstanceIds={
              loadingSupHoverTruckId != null ? [loadingSupHoverTruckId] : battleLogisticsPickInstanceIds
            }
            battleUnloadCellIds={battleUnloadCellIds}
            battleAirDepartureHoverCellId={battleAirDepartureHoverCellId}
            battleAirDeparturePickCellId={battleAirDeparturePickCellId}
            battleAirMissionPreview={battleAirMissionPreview}
            battlePatrolVisibilityCellIds={battlePatrolVisibilityCellIds}
            battlePatrolCenterCellId={battlePatrolCenterCellId}
            battleBombardmentAreaCellIds={battleBombardmentAreaCellIds}
            bombardmentDirectionPickCellIds={bombardmentDirectionPickCellIds}
            bombardmentApproachCellId={bombardmentApproachCellId}
            patrolRangePickCellIds={patrolRangePickCellIds}
            battleAirInterceptionTargets={battleAirInterceptionTargets}
            battleAirUnitsInFlight={battleAirUnitsInFlight}
            battleLogisticsUnitDecal={null}
            battlePendingLogisticsPreview={loadingSupHoverPreview}
            onUnitClick={(unit, cell, e) => {
              const u = unit as { [key: string]: any };
              const iid = parseId(u.instanceId);
              const pick = orderPickRef.current;
              if (!pick) clearPinnedMineInfo();
              if (trySubmitAirHexOrderPick(cell)) return;
              if (
                pick &&
                pick.orderKey === 'interception' &&
                apiRoomId != null &&
                isValidId(iid)
              ) {
                if (trySubmitInterceptionPick(u as Record<string, unknown>)) return;
              }
              if (
                pick &&
                apiRoomId != null &&
                isValidId(iid) &&
                ['fire', 'fireHard', 'attack', 'hardMove', 'fireMove'].includes(pick.orderKey)
              ) {
                setBattleUnitTip(null);
                const attacker = pick.unit;
                if (
                  (pick.orderKey === 'fire' || pick.orderKey === 'fireHard') &&
                  battleUnitHasPropKey(attacker as { [key: string]: any }, 'areaFire')
                ) {
                  if (battleAreaFireCellIds == null || !battleAreaFireCellIds.includes(cell.id)) {
                    dismissOrderPicking();
                    return;
                  }
                  setPendingOrders((prev) => {
                    return upsertOrder(prev, parseId(pick.unit.instanceId), {
                      unitInstanceId: parseId(pick.unit.instanceId),
                      orderKey: pick.orderKey,
                      targetCellId: cell.id,
                      ...fireOrderExtras(pick),
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                const af = `${attacker.faction ?? ''}`;
                const tf = `${u.faction ?? ''}`;
                if (!factionsOpposedOnMap(af, tf)) {
                  dismissOrderPicking();
                  return;
                }
                if (parseId(attacker.instanceId) === iid) {
                  dismissOrderPicking();
                  return;
                }
                if (
                  !(
                    (pick.orderKey === 'fire' || pick.orderKey === 'fireHard') &&
                    battleUnitHasPropKey(attacker as { [key: string]: any }, 'areaFire')
                  ) &&
                  (!battleFireTargetInstanceIds || !battleInstanceIdInList(battleFireTargetInstanceIds, iid))
                ) {
                  dismissOrderPicking();
                  return;
                }
                if (pick.orderKey === 'fireMove') {
                  setOrderPick({
                    ...pick,
                    fireMoveStep: 'dest',
                    fireMoveTargetUnitId: iid,
                  });
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: pick.orderKey,
                    targetUnitInstanceId: iid,
                    ...fireOrderExtras(pick),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (
                pick &&
                apiRoomId != null &&
                isValidId(iid) &&
                ['getSup', 'loading', 'tow', 'railLoading'].includes(pick.orderKey)
              ) {
                setBattleUnitTip(null);
                if (pick.orderKey === 'getSup') {
                  if (!tryOpenGetSupModal(pick.unit as { [key: string]: any }, u)) {
                    dismissOrderPicking();
                  }
                  return;
                }
                if (!battleInstanceIdInList(battleLogisticsPickInstanceIds, iid)) {
                  dismissOrderPicking();
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: pick.orderKey,
                    targetUnitInstanceId: iid,
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && (pick.orderKey === 'move' || pick.orderKey === 'moveWar')) {
                if (!moveReachableCellIds?.includes(cell.id)) {
                  dismissOrderPicking();
                }
                return;
              }
              if (
                pick &&
                (pick.orderKey === 'defend' ||
                  pick.orderKey === 'ambush' ||
                  pick.orderKey === 'deploy' ||
                  pick.orderKey === 'changeSector')
              ) {
                return;
              }
              if (pick && (pick.orderKey === 'unloading' || pick.orderKey === 'railUnloading' || pick.orderKey === 'loadingSup')) {
                return;
              }
              if (pick && (pick.orderKey === 'enterDot' || pick.orderKey === 'exitDot' || pick.orderKey === 'cutWire' || pick.orderKey === 'trenches' || pick.orderKey === 'buildPonton' || pick.orderKey === 'cutEj' || pick.orderKey === 'demining' || pick.orderKey === 'smoke' || pick.orderKey === 'explomost')) {
                return;
              }
              if (pick && pick.orderKey === 'bombardment' && pick.bombardmentStep === 'direction') {
                return;
              }
              if (pick && pick.orderKey === 'patrol' && pick.patrolStep === 'radius') {
                return;
              }
              if (pick && (pick.orderKey === 'razvedka' || pick.orderKey === 'svzy')) {
                return;
              }
              if (pick) {
                dismissOrderPicking();
                return;
              }
              if (readonlyBattle || !unitIsMineOnMap(u, myBattleFaction)) return;
              if (readBattleUnitOrdersFromPayload(u).length === 0) {
                setBattleUnitTip({
                  unit: u,
                  cell,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  capturedAtTurn: turn,
                });
                return;
              }
              setBattleUnitTip(null);
              setBattleUnitOrders({
                unit: u,
                cell,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }}
            onCellClick={(cell, unitId, clickPos) => {
              const pick = orderPickRef.current;

              if (trySubmitAirHexOrderPick(cell)) return;

              if (pick?.orderKey === 'interception' && battleAirInterceptionTargets?.length) {
                const target = battleAirInterceptionTargets.find(
                  (t) => Number(t.engagementCell.id) === Number(cell.id),
                );
                if (target && trySubmitInterceptionPick(target.unit)) return;
              }

              if (
                pick &&
                pick.orderKey === 'bombardment' &&
                pick.bombardmentStep === 'direction'
              ) {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!bombardmentDirectionPickCellIds?.includes(cell.id)) {
                  return;
                }
                const uid = parseId(pick.unit.instanceId);
                if (!isValidId(uid)) {
                  dismissOrderPicking();
                  return;
                }
                const targetId = pick.bombardmentTargetCellId;
                const pathIds = pick.bombardmentFlightPathCellIds;
                if (targetId == null || !pathIds?.length) {
                  dismissOrderPicking();
                  return;
                }
                const targetCell = cells.find((c) => c.id === targetId);
                const dirCell = cells.find((c) => c.id === cell.id);
                const liveB = findUnitCellByInstanceId(cells, uid);
                if (!targetCell || !dirCell || !liveB) {
                  dismissOrderPicking();
                  return;
                }
                const areaIds = computeBombardmentAreaCellIds(
                  targetCell,
                  liveB.unit as Record<string, unknown>,
                  cells,
                  dirCell,
                );
                setBattleUnitTip(null);
                setPendingOrders((prev) =>
                  upsertOrder(prev, uid, {
                    unitInstanceId: uid,
                    orderKey: 'bombardment',
                    targetCellId: targetId,
                    flightPathCellIds: pathIds,
                    bombardmentDirectionCellId: dirCell.id,
                    bombardmentAreaCellIds: areaIds,
                  }),
                );
                dismissOrderPicking();
                return;
              }

              if (pick && (pick.orderKey === 'razvedka' || pick.orderKey === 'svzy')) {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const uid = parseId(pick.unit.instanceId);
                if (!isValidId(uid)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, uid);
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const maxR = readReconRingStepsFromUnit(live.unit as Record<string, unknown>, String(pick.orderKey));
                const dist = hexDistCells(live.cell, cell);
                if (dist > maxR) return;
                const radiusSteps = Math.max(1, dist < 1 ? 1 : dist);
                setBattleUnitTip(null);
                setPendingOrders((prev) =>
                  upsertOrder(prev, uid, {
                    unitInstanceId: uid,
                    orderKey: String(pick.orderKey),
                    reconRangeSteps: radiusSteps,
                  }),
                );
                dismissOrderPicking();
                return;
              }

              if (pick && pick.orderKey === 'patrol' && pick.patrolStep === 'radius') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!patrolRangePickCellIds?.includes(cell.id)) {
                  return;
                }
                const uid = parseId(pick.unit.instanceId);
                if (!isValidId(uid)) {
                  dismissOrderPicking();
                  return;
                }
                const centerId = pick.patrolTargetCellId;
                const pathIds = pick.patrolFlightPathCellIds;
                if (centerId == null || !pathIds?.length) {
                  dismissOrderPicking();
                  return;
                }
                const centerCell = cells.find((c) => c.id === centerId);
                const liveP = findUnitCellByInstanceId(cells, uid);
                if (!centerCell || !liveP) {
                  dismissOrderPicking();
                  return;
                }
                const dist = hexDistCells(centerCell, cell);
                const maxR = readBattleVisionRange(liveP.unit as Record<string, unknown>);
                if (dist < 1 || dist > maxR) return;
                setBattleUnitTip(null);
                setPendingOrders((prev) =>
                  upsertOrder(prev, uid, {
                    unitInstanceId: uid,
                    orderKey: 'patrol',
                    targetCellId: centerId,
                    flightPathCellIds: pathIds,
                    patrolRangeSteps: dist,
                  }),
                );
                dismissOrderPicking();
                return;
              }

              if (pick && ['getSup', 'loading', 'tow', 'railLoading'].includes(pick.orderKey)) {
                if (unitId !== undefined && unitId !== null && String(unitId) !== '') return;
                const onCell = findLogisticsTargetOnCell(cell);
                if (onCell) {
                  if (pick.orderKey === 'getSup') {
                    if (!tryOpenGetSupModal(pick.unit as { [key: string]: any }, onCell)) {
                      dismissOrderPicking();
                    }
                    return;
                  }
                  const iid = parseId(onCell.instanceId);
                  if (!isValidId(iid) || !battleInstanceIdInList(battleLogisticsPickInstanceIds, iid)) {
                    dismissOrderPicking();
                    return;
                  }
                  setPendingOrders((prev) => {
                    return upsertOrder(prev, parseId(pick.unit.instanceId), {
                      unitInstanceId: parseId(pick.unit.instanceId),
                      orderKey: pick.orderKey,
                      targetUnitInstanceId: iid,
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                dismissOrderPicking();
                return;
              }
              if (
                pick &&
                (pick.orderKey === 'defend' ||
                  pick.orderKey === 'ambush' ||
                  pick.orderKey === 'deploy' ||
                  pick.orderKey === 'changeSector')
              ) {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (pick.defendStep === 'range') {
                  if (!defendRangePickCellIds?.includes(cell.id)) {
                    return;
                  }
                  const liveR = findUnitCellByInstanceId(cells, parseId(pick.unit.instanceId));
                  if (!liveR) {
                    dismissOrderPicking();
                    return;
                  }
                  const wmaxR = maxShootRangeStepsForUnit(pick.unit as { [key: string]: any });
                  if (wmaxR < 1) {
                    dismissOrderPicking();
                    return;
                  }
                  const dR = hexDistCells(liveR.cell, cell);
                  const capR = Math.max(1, Math.min(wmaxR, dR));
                  if (pick.defendFacingPickedId == null) {
                    dismissOrderPicking();
                    return;
                  }
                  setPendingOrders((prev) => {
                    return upsertOrder(prev, parseId(pick.unit.instanceId), {
                      unitInstanceId: parseId(pick.unit.instanceId),
                      orderKey: pick.orderKey,
                      defendFacingCellId: pick.defendFacingPickedId,
                      defendMaxRangeSteps: capR,
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                if (pick.defendStep === 'facing') {
                  if (!defendFacingPickCellIds?.includes(cell.id)) {
                    dismissOrderPicking();
                    return;
                  }
                  const fc = cells.find((c) => c.id === cell.id);
                  if (!fc) {
                    dismissOrderPicking();
                    return;
                  }
                  const wmax = maxShootRangeStepsForUnit(pick.unit as { [key: string]: any });
                  if (wmax < 1) {
                    dismissOrderPicking();
                    return;
                  }
                  if (pick.orderKey === 'defend' || pick.orderKey === 'ambush') {
                    setOrderPick({
                      ...pick,
                      defendStep: 'range',
                      defendFacingPickedId: fc.id,
                    });
                    return;
                  }
                  setPendingOrders((prev) => {
                    return upsertOrder(prev, parseId(pick.unit.instanceId), {
                      unitInstanceId: parseId(pick.unit.instanceId),
                      orderKey: pick.orderKey,
                      defendFacingCellId: fc.id,
                      defendMaxRangeSteps: wmax,
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                dismissOrderPicking();
                return;
              }
              if (pick && (pick.orderKey === 'unloading' || pick.orderKey === 'railUnloading')) {
                const cargoId = pick.unloadCargoInstanceId;
                if (cargoId == null || !isValidId(parseId(cargoId))) {
                  dismissOrderPicking();
                  return;
                }
                if (!battleUnloadCellIds?.includes(cell.id)) {
                  dismissOrderPicking();
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: pick.orderKey,
                    targetUnitInstanceId: parseId(cargoId),
                    targetCellId: cell.id,
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'loadingSup') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const liveWh = cells.find((c) => sameCellId(c.id, cell.id)) ?? cell;
                if (!cellIdInList(loadingSupGlowCellIds, liveWh.id)) {
                  dismissOrderPicking();
                  return;
                }
                const truckId = parseId(pick.unit.instanceId);
                const liveTruck = Number.isFinite(truckId) ? findUnitCellByInstanceId(cells, truckId) : null;
                const truck = (liveTruck?.unit ?? pick.unit) as { [key: string]: unknown };
                const max = maxAmmoLoadFromWarehouse(truck, liveWh);
                if (max < 1) {
                  dismissOrderPicking();
                  return;
                }
                setBattleUnitTip(null);
                setBattleDotTip(null);
                setBattleAmmoModal({
                  giver: { name: 'Склад', ammoCount: readStorageAmmo(liveWh) },
                  receiver: truck,
                  maxTransfer: max,
                  warehouseCellId: Number(liveWh.id),
                });
                return;
              }
              if (pick && pick.orderKey === 'trenches') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                if (isTrenchForbiddenOnCell(live.cell)) {
                  return;
                }
                const trenchOk = cellsEligibleForTrenchFacing(live.cell, cells).some((c) =>
                  sameCellId(c.id, cell.id),
                );
                if (!trenchOk) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'trenches',
                    targetCellId: Number(cell.id),
                    defendFacingCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'cutWire') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const wireOk = cellsEligibleForCutWire(live.cell, cells).some((c) => sameCellId(c.id, cell.id));
                if (!wireOk) {
                  return;
                }
                const sameHex = sameCellId(live.cell.id, cell.id);
                const center = getCellCenter(
                  cell.coor.x,
                  cell.coor.z,
                  battleCellSize,
                  mapViewport.w,
                  mapViewport.h,
                );
                const edgeDir = clickPos
                  ? edgeIndexFromPoint(center.x, center.y, clickPos.canvasX, clickPos.canvasY)
                  : 0;
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'cutWire',
                    targetCellId: Number(cell.id),
                    ...(sameHex ? { wireEdgeDir: edgeDir } : {}),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'buildPonton') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const ok = cellsEligibleForPonton(live.cell, cells).some((c) => sameCellId(c.id, cell.id));
                if (!ok) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'buildPonton',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'cutEj') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const ok = cellsEligibleForCutEj(live.cell, cells).some((c) => sameCellId(c.id, cell.id));
                if (!ok) {
                  return;
                }
                const sameHex = sameCellId(live.cell.id, cell.id);
                const center = getCellCenter(
                  cell.coor.x,
                  cell.coor.z,
                  battleCellSize,
                  mapViewport.w,
                  mapViewport.h,
                );
                const edgeDir = clickPos
                  ? edgeIndexFromPoint(center.x, center.y, clickPos.canvasX, clickPos.canvasY)
                  : 0;
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'cutEj',
                    targetCellId: Number(cell.id),
                    ...(sameHex ? { wireEdgeDir: edgeDir } : {}),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'demining') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const ok = cellsEligibleForDemining(live.cell, cells, viewerBattleFaction).some((c) =>
                  sameCellId(c.id, cell.id),
                );
                if (!ok) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'demining',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'smoke') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!cellIdInList(moveReachableCellIds, cell.id)) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'smoke',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'explomost') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                if (!live) {
                  dismissOrderPicking();
                  return;
                }
                const ok = cellsEligibleForExplomost(live.cell, cells).some((c) => sameCellId(c.id, cell.id));
                if (!ok) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'explomost',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'enterDot') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const live = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                const getStr = (u: Record<string, unknown>) => {
                  const n = Number(u.str ?? u.strength);
                  return Number.isFinite(n) ? n : 0;
                };
                const fogOk =
                  battleFogRevealedCellIds == null ||
                  viewerBattleFaction === 'none' ||
                  cellIdInList(battleFogRevealedCellIds, cell.id);
                const highlighted = cellIdInList(moveReachableCellIds, cell.id);
                const eligible =
                  live &&
                  cellsEligibleForEnterDot(live.cell, cells, getStr).some((c) => sameCellId(c.id, cell.id));
                if (!live || !fogOk || !(highlighted || eligible)) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'enterDot',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'exitDot') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const liveExit = findUnitCellByInstanceId(cells, Number(pick.unit.instanceId));
                const getStrExit = (u: Record<string, unknown>) => {
                  const n = Number(u.str ?? u.strength);
                  return Number.isFinite(n) ? n : 0;
                };
                const highlightedExit = cellIdInList(moveReachableCellIds, cell.id);
                const eligibleExit =
                  liveExit &&
                  cellsEligibleForExitDot(liveExit.cell, cells, getStrExit).some((c) =>
                    sameCellId(c.id, cell.id),
                  );
                if (!liveExit || !(highlightedExit || eligibleExit)) {
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'exitDot',
                    targetCellId: Number(cell.id),
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && (pick.orderKey === 'move' || pick.orderKey === 'moveWar')) {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!moveReachableCellIds?.includes(cell.id)) {
                  dismissOrderPicking();
                  return;
                }
                setPendingOrders((prev) => {
                  return upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: pick.orderKey,
                    targetCellId: cell.id,
                  });
                });
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'fireMove' && (pick as { fireMoveStep?: string }).fireMoveStep === 'shot') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!moveReachableCellIds?.includes(cell.id)) {
                  dismissOrderPicking();
                  return;
                }
                const destId = Number((pick as { fireMoveDestCellId?: number }).fireMoveDestCellId);
                const tgtId = Number((pick as { fireMoveTargetUnitId?: number }).fireMoveTargetUnitId);
                setPendingOrders((prev) =>
                  upsertOrder(prev, parseId(pick.unit.instanceId), {
                    unitInstanceId: parseId(pick.unit.instanceId),
                    orderKey: 'fireMove',
                    targetCellId: destId,
                    targetUnitInstanceId: tgtId,
                    fireFromCellId: cell.id,
                  }),
                );
                dismissOrderPicking();
                return;
              }
              if (pick && pick.orderKey === 'fireMove' && (pick as { fireMoveStep?: string }).fireMoveStep === 'dest') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                if (!moveReachableCellIds?.includes(cell.id)) {
                  dismissOrderPicking();
                  return;
                }
                const uid = parseId(pick.unit.instanceId);
                const live = findUnitCellByInstanceId(cells, uid);
                const dest = cells.find((c) => c.id === cell.id);
                const tgtId = Number((pick as { fireMoveTargetUnitId?: number }).fireMoveTargetUnitId);
                const tgtLive = findUnitCellByInstanceId(cells, tgtId);
                if (!live || !dest || !tgtLive) {
                  dismissOrderPicking();
                  return;
                }
                const u = live.unit as Record<string, unknown>;
                const path = findMovementPath(
                  live.cell,
                  dest,
                  cells,
                  {
                    type: String(u.type ?? 'infantry'),
                    faction: String(u.faction ?? ''),
                    properties: u.properties,
                  },
                  null,
                );
                const los = path ? fireMoveLosCellIds(path, tgtLive.cell, cells) : [];
                if (los.length <= 1) {
                  setPendingOrders((prev) =>
                    upsertOrder(prev, uid, {
                      unitInstanceId: uid,
                      orderKey: 'fireMove',
                      targetCellId: dest.id,
                      targetUnitInstanceId: tgtId,
                      fireFromCellId: los[0] ?? dest.id,
                    }),
                  );
                  dismissOrderPicking();
                  return;
                }
                setOrderPick({
                  ...pick,
                  fireMoveStep: 'shot',
                  fireMoveDestCellId: dest.id,
                });
                return;
              }
              if (pick && ['fire', 'fireHard', 'attack', 'hardMove'].includes(pick.orderKey)) {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
                const uAtk = pick.unit as { [key: string]: any };
                if (
                  (pick.orderKey === 'fire' || pick.orderKey === 'fireHard') &&
                  battleUnitHasPropKey(uAtk, 'areaFire')
                ) {
                  if (battleAreaFireCellIds == null || !battleAreaFireCellIds.includes(cell.id)) {
                    dismissOrderPicking();
                    return;
                  }
                  setPendingOrders((prev) => {
                    return upsertOrder(prev, parseId(pick.unit.instanceId), {
                      unitInstanceId: parseId(pick.unit.instanceId),
                      orderKey: pick.orderKey,
                      targetCellId: cell.id,
                      ...fireOrderExtras(pick),
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                const occ = resolveDotOccupantUnit(cell, cells);
                if (occ) {
                  const tgt = occ.unit as { [key: string]: any };
                  const iid = parseId(tgt.instanceId);
                  const af = `${uAtk.faction ?? ''}`;
                  const tf = `${tgt.faction ?? ''}`;
                  if (
                    isValidId(iid) &&
                    factionsOpposedOnMap(af, tf) &&
                    parseId(uAtk.instanceId) !== iid &&
                    battleInstanceIdInList(battleFireTargetInstanceIds, iid)
                  ) {
                    setPendingOrders((prev) => {
                      return upsertOrder(prev, parseId(pick.unit.instanceId), {
                        unitInstanceId: parseId(pick.unit.instanceId),
                        orderKey: pick.orderKey,
                        targetUnitInstanceId: iid,
                        ...fireOrderExtras(pick),
                      });
                    });
                    dismissOrderPicking();
                    return;
                  }
                }
                dismissOrderPicking();
                return;
              }
              if (pick) {
                dismissOrderPicking();
                return;
              }
              if (isMineVisibleOnBattleMap(cell.builds, viewerBattleFaction)) {
                const cx = clickPos?.clientX ?? 0;
                const cy = clickPos?.clientY ?? 0;
                if (pinnedMineCellIdRef.current === Number(cell.id)) {
                  clearPinnedMineInfo();
                  return;
                }
                pinMineInfo(cell, cx, cy);
                return;
              }
              if (pinnedMineCellIdRef.current != null) clearPinnedMineInfo();
              if (hasDotOnCell(cell.builds)) {
                const occ = resolveDotOccupantUnit(cell, cells);
                if (occ && !readonlyBattle && unitIsMineOnMap(occ.unit as { [key: string]: any }, myBattleFaction)) {
                  const u = occ.unit as { [key: string]: any };
                  const cx = clickPos?.clientX ?? 0;
                  const cy = clickPos?.clientY ?? 0;
                  if (readBattleUnitOrdersFromPayload(u).length === 0) {
                    setBattleUnitTip({
                      unit: u,
                      cell: occ.cell,
                      clientX: cx,
                      clientY: cy,
                      capturedAtTurn: turn,
                    });
                    return;
                  }
                  setBattleUnitTip(null);
                  setBattleUnitOrders({
                    unit: u,
                    cell: occ.cell,
                    clientX: cx,
                    clientY: cy,
                  });
                  return;
                }
              }
              if (unitId === undefined) setBattleUnitOrders(null);
            }}
          />
          <BattleResolvingOverlay
            active={showResolvingOverlay}
            title={resolvingTitle}
            hint={resolvingHint}
          />
        </div>
      ) : (
        <p className={styles.mapPlaceholder}>Нет данных поля боя</p>
      )}
    </div>
  );
};

export default BattleMapStage;

import React from 'react';
import Cells from '../map/Cells';
import styles from '../../pages/styleModules/battle.module.css';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import BattleMapHud from './BattleMapHud';
import BattleResolvingOverlay from './BattleResolvingOverlay';
import { findUnitCellByInstanceId } from '../../game/battleMovePreview';
import { battleUnitHasPropKey, hexDistCells, maxShootRangeStepsForUnit } from '../../game/battleFirePreview';
import { maxAmmoTransferFromTruckTo } from '../../game/battleLogisticsUi';
import type { BattleOrderPayload } from '../../api/rooms';

type BattleMapStageProps = {
  battleMapLoad: 'loading' | 'ready';
  hasGrid: boolean;
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  battleHoverCellId: number | null;
  orderPick: { orderKey?: string; unit?: { instanceId?: number | string; faction?: string }; unloadCargoInstanceId?: number | string | null; defendStep?: 'facing' | 'range'; defendFacingPickedId?: number } | null;
  battleAreaFireCellIds: number[] | null;
  cells: Cell[];
  mapViewport: { w: number; h: number };
  battleCellSize: number;
  battlePointerCursor: string;
  viewerBattleFaction: 'rkka' | 'wehrmacht' | 'none';
  battleUnitOrders: { unit: { [key: string]: any }; cell: Cell; clientX: number; clientY: number } | null;
  turn: number;
  setBattleUnitTip: (tip: { unit: { [key: string]: any }; cell: Cell; clientX: number; clientY: number; capturedAtTurn: number } | null) => void;
  setBattleHoverCellId: React.Dispatch<React.SetStateAction<number | null>>;
  moveReachableCellIds: number[] | null;
  defendPickHighlightCellIds: number[] | null;
  defendRangeOrderPreview: any;
  battleReportSectorHover: any;
  battleDefendHover: any;
  battleFireTargetInstanceIds: number[] | null;
  battlePendingShootPreview: any;
  cellsHoverPath: Cell[] | null;
  battleReportReplayHighlight: any;
  battleFogRevealedCellIds: number[] | null;
  battleLogisticsPickInstanceIds: number[] | null;
  battleUnloadCellIds: number[] | null;
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
};

const BattleMapStage: React.FC<BattleMapStageProps> = ({
  battleMapLoad,
  hasGrid,
  mapWrapRef,
  battleHoverCellId,
  orderPick,
  battleAreaFireCellIds,
  cells,
  mapViewport,
  battleCellSize,
  battlePointerCursor,
  viewerBattleFaction,
  battleUnitOrders,
  turn,
  setBattleUnitTip,
  setBattleHoverCellId,
  moveReachableCellIds,
  defendPickHighlightCellIds,
  defendRangeOrderPreview,
  battleReportSectorHover,
  battleDefendHover,
  battleFireTargetInstanceIds,
  battlePendingShootPreview,
  cellsHoverPath,
  battleReportReplayHighlight,
  battleFogRevealedCellIds,
  battleLogisticsPickInstanceIds,
  battleUnloadCellIds,
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
}) => {
  const parseId = (value: string | number | null | undefined): number => parseInt(`${value ?? ''}`, 10);
  const isValidId = (value: number): boolean => isFinite(value);
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
            onUnitHover={(unit, cell, e) => {
              if (battleUnitOrders) return;
              const u = unit as { [key: string]: any };
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
            onCellHover={(cell) => {
              setBattleHoverCellId(cell?.id ?? null);
            }}
            onCellLeave={() => {
              setBattleHoverCellId(null);
            }}
            moveReachableCellIds={moveReachableCellIds}
            defendFacingPickCellIds={defendPickHighlightCellIds}
            battleDefendHover={defendRangeOrderPreview ?? battleReportSectorHover ?? battleDefendHover}
            battleFireTargetInstanceIds={battleFireTargetInstanceIds}
            battleAreaFireCellIds={battleAreaFireCellIds}
            battlePendingShootPreview={battlePendingShootPreview}
            hoverPath={cellsHoverPath}
            battleReportReplayHighlight={battleReportReplayHighlight}
            battleFogRevealedCellIds={battleFogRevealedCellIds}
            battleLogisticsPickInstanceIds={battleLogisticsPickInstanceIds}
            battleUnloadCellIds={battleUnloadCellIds}
            battleLogisticsUnitDecal={null}
            battlePendingLogisticsPreview={battlePendingLogisticsPreview}
            onUnitClick={(unit, cell, e) => {
              const u = unit as { [key: string]: any };
              const iid = parseId(u.instanceId);
              const pick = orderPickRef.current;
              if (
                pick &&
                apiRoomId != null &&
                isValidId(iid) &&
                ['fire', 'fireHard', 'attack'].includes(pick.orderKey)
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
                  (!battleFireTargetInstanceIds || !battleFireTargetInstanceIds.includes(iid))
                ) {
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
              if (
                pick &&
                apiRoomId != null &&
                isValidId(iid) &&
                ['getSup', 'loading', 'tow'].includes(pick.orderKey)
              ) {
                setBattleUnitTip(null);
                if (!battleLogisticsPickInstanceIds?.includes(iid)) {
                  dismissOrderPicking();
                  return;
                }
                if (pick.orderKey === 'getSup') {
                  const max = maxAmmoTransferFromTruckTo(pick.unit as { [key: string]: any }, u);
                  if (max < 1) {
                    dismissOrderPicking();
                    return;
                  }
                  setBattleAmmoModal({
                    giver: pick.unit as { [key: string]: any },
                    receiver: u,
                    maxTransfer: max,
                  });
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
              if (pick && pick.orderKey === 'unloading') {
                return;
              }
              if (pick) {
                dismissOrderPicking();
                return;
              }
              if (readonlyBattle || !unitIsMineOnMap(u, myBattleFaction)) return;
              setBattleUnitTip(null);
              if (readBattleUnitOrdersFromPayload(u).length === 0) return;
              setBattleUnitOrders({
                unit: u,
                cell,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }}
            onCellClick={(cell, unitId) => {
              const pick = orderPickRef.current;

              if (pick && unitId !== undefined && ['getSup', 'loading', 'tow'].includes(pick.orderKey)) {
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
              if (pick && pick.orderKey === 'unloading') {
                if (apiRoomId == null || !isFinite(apiRoomId)) {
                  dismissOrderPicking();
                  return;
                }
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
                    orderKey: 'unloading',
                    targetUnitInstanceId: parseId(cargoId),
                    targetCellId: cell.id,
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
              if (pick && ['fire', 'fireHard', 'attack'].includes(pick.orderKey)) {
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
                    });
                  });
                  dismissOrderPicking();
                  return;
                }
                dismissOrderPicking();
                return;
              }
              if (pick) {
                dismissOrderPicking();
                return;
              }
              if (unitId === undefined) setBattleUnitOrders(null);
            }}
          />
          <BattleResolvingOverlay active={showResolvingOverlay} />
        </div>
      ) : (
        <p className={styles.mapPlaceholder}>Нет данных поля боя</p>
      )}
    </div>
  );
};

export default BattleMapStage;

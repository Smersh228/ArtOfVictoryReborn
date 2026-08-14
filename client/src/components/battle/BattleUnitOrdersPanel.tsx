import React from 'react';
import BattleUnitOrdersInner from './BattleUnitOrdersInner';
import styles from '../../pages/styleModules/battle.module.css';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../../api/rooms';
import type { AccompanimentEscortCandidate } from '../../game/battleAirSupport';
import type { BattleUnitOrdersInnerUnit } from './BattleUnitOrdersInner';

interface BattleUnitOrdersState {
  unit: BattleUnitOrdersInnerUnit;
  cell: Cell;
}

interface BattleUnitOrdersPanelProps {
  battleOrdersRef: React.RefObject<HTMLDivElement | null>;
  battleOrdersPos: { left: number; top: number };
  battleUnitOrders: BattleUnitOrdersState;
  apiRoomId: number | null;
  battleStarted: boolean;
  myBattleFaction: 'rkka' | 'wehrmacht' | 'none';
  cells: Cell[];
  battleFogRevealedCellIds: number[] | null;
  readBattleUnitOrdersFromPayload: (unit: BattleUnitOrdersInnerUnit) => Array<{ id: number; name: string; order_key?: string }>;
  inferOrderKey: (o: { name: string; order_key?: string }) => string | null;
  isTruckUnitBattle: (unit: BattleUnitOrdersInnerUnit) => boolean;
  getCarriedUnitsFromTruck: (unit: BattleUnitOrdersInnerUnit) => BattleUnitOrdersInnerUnit[];
  resolveBattleCellOnField: (cell: Cell, fieldCells: Cell[]) => Cell | null | undefined;
  canPlaceAmbushFromEnemyVision: (
    unit: BattleUnitOrdersInnerUnit,
    ownCell: Cell,
    cells: Cell[],
  ) => boolean;
  getBattleOrderIconUrl: (orderKey: string) => string | null;
  findUnitCellByInstanceId: (
    cells: Cell[],
    unitInstanceId: number,
  ) => { unit: BattleUnitOrdersInnerUnit; cell: Cell } | null;
  readAmmoCountUi: (unit: BattleUnitOrdersInnerUnit) => number;
  computeBattleFireHighlights: (
    unit: BattleUnitOrdersInnerUnit,
    ownCell: Cell,
    cells: Cell[],
    orderKey: 'fire' | 'fireHard' | 'attack',
    fogRevealedCellIds: number[] | null,
  ) => { instanceIds: number[] | null; areaCellIds: number[] | null };
  explainNoFireTargets: (
    unit: BattleUnitOrdersInnerUnit,
    ownCell: Cell,
    cells: Cell[],
    orderKey: 'fire' | 'fireHard',
    fogRevealedCellIds: number[] | null,
  ) => string;
  setBattleUnitOrders: React.Dispatch<React.SetStateAction<any>>;
  setOrderPick: React.Dispatch<React.SetStateAction<any>>;
  setUnloadCargoPickModal: React.Dispatch<
    React.SetStateAction<{
      truck: BattleUnitOrdersInnerUnit;
      cell: Cell;
      orderLabel: string;
      carried: BattleUnitOrdersInnerUnit[];
    } | null>
  >;
  setPendingOrders: React.Dispatch<React.SetStateAction<BattleOrderPayload[]>>;
  pendingOrders: BattleOrderPayload[];
  setAccompanimentPickModal: React.Dispatch<
    React.SetStateAction<{
      escorter: BattleUnitOrdersInnerUnit;
      cell: Cell;
      orderLabel: string;
      candidates: AccompanimentEscortCandidate[];
    } | null>
  >;
}

const BattleUnitOrdersPanel: React.FC<BattleUnitOrdersPanelProps> = ({
  battleOrdersRef,
  battleOrdersPos,
  battleUnitOrders,
  apiRoomId,
  battleStarted,
  myBattleFaction,
  cells,
  battleFogRevealedCellIds,
  readBattleUnitOrdersFromPayload,
  inferOrderKey,
  isTruckUnitBattle,
  getCarriedUnitsFromTruck,
  resolveBattleCellOnField,
  canPlaceAmbushFromEnemyVision,
  getBattleOrderIconUrl,
  findUnitCellByInstanceId,
  readAmmoCountUi,
  computeBattleFireHighlights,
  explainNoFireTargets,
  setBattleUnitOrders,
  setOrderPick,
  setUnloadCargoPickModal,
  setPendingOrders,
  pendingOrders,
  setAccompanimentPickModal,
}) => {
  return (
    <div
      ref={battleOrdersRef}
      className={styles.battleUnitOrders}
      style={{ left: battleOrdersPos.left, top: battleOrdersPos.top }}
      role="dialog"
      aria-label="Приказы юниту"
    >
      <header className={styles.battleUnitOrdersHeader}>
        <h3 className={styles.battleUnitOrdersTitle}>{battleUnitOrders.unit.name ?? 'Юнит'}</h3>
        <p className={styles.battleUnitOrdersSubtitle}>Приказы</p>
      </header>
      <BattleUnitOrdersInner
        layout="dialog"
        unit={battleUnitOrders.unit}
        cell={battleUnitOrders.cell}
        apiRoomId={apiRoomId}
        battleStarted={battleStarted}
        myBattleFaction={myBattleFaction}
        cells={cells}
        battleFogRevealedCellIds={battleFogRevealedCellIds}
        readBattleUnitOrdersFromPayload={readBattleUnitOrdersFromPayload}
        inferOrderKey={inferOrderKey}
        isTruckUnitBattle={isTruckUnitBattle}
        getCarriedUnitsFromTruck={getCarriedUnitsFromTruck}
        resolveBattleCellOnField={resolveBattleCellOnField}
        canPlaceAmbushFromEnemyVision={canPlaceAmbushFromEnemyVision}
        getBattleOrderIconUrl={getBattleOrderIconUrl}
        findUnitCellByInstanceId={findUnitCellByInstanceId}
        readAmmoCountUi={readAmmoCountUi}
        computeBattleFireHighlights={computeBattleFireHighlights}
        explainNoFireTargets={explainNoFireTargets}
        setBattleUnitOrders={setBattleUnitOrders}
        setOrderPick={setOrderPick}
        setUnloadCargoPickModal={setUnloadCargoPickModal}
        setPendingOrders={setPendingOrders}
        pendingOrders={pendingOrders}
        setAccompanimentPickModal={setAccompanimentPickModal}
      />
    </div>
  );
};

export default BattleUnitOrdersPanel;

import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../../api/rooms';

interface BattleUnitData {
  instanceId?: number | string;
  name?: string;
  type?: string;
  faction?: string;
  tactical?: {
    artilleryDeployed?: boolean;
    meleeOpponentInstanceId?: number | string | null;
    fireSuppression?: boolean;
  };
  [key: string]: any;
}

interface BattleUnitOrdersState {
  unit: BattleUnitData;
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
  readBattleUnitOrdersFromPayload: (unit: BattleUnitData) => Array<{ id: number; name: string; order_key?: string }>;
  inferOrderKey: (o: { name: string; order_key?: string }) => string | null;
  isTruckUnitBattle: (unit: BattleUnitData) => boolean;
  getCarriedUnitsFromTruck: (unit: BattleUnitData) => BattleUnitData[];
  resolveBattleCellOnField: (cell: Cell, fieldCells: Cell[]) => Cell | null | undefined;
  canPlaceAmbushFromEnemyVision: (unit: BattleUnitData, ownCell: Cell, cells: Cell[]) => boolean;
  getBattleOrderIconUrl: (orderKey: string) => string | null;
  findUnitCellByInstanceId: (cells: Cell[], unitInstanceId: number) => { unit: BattleUnitData; cell: Cell } | null;
  readAmmoCountUi: (unit: BattleUnitData) => number;
  computeBattleFireHighlights: (
    unit: BattleUnitData,
    ownCell: Cell,
    cells: Cell[],
    orderKey: 'fire' | 'fireHard' | 'attack',
    fogRevealedCellIds: number[] | null,
  ) => { instanceIds: number[] | null; areaCellIds: number[] | null };
  setBattleUnitOrders: React.Dispatch<React.SetStateAction<any>>;
  setOrderPick: React.Dispatch<React.SetStateAction<any>>;
  setUnloadCargoPickModal: React.Dispatch<
    React.SetStateAction<{
      truck: BattleUnitData;
      cell: Cell;
      orderLabel: string;
      carried: BattleUnitData[];
    } | null>
  >;
  setPendingOrders: React.Dispatch<React.SetStateAction<BattleOrderPayload[]>>;
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
  setBattleUnitOrders,
  setOrderPick,
  setUnloadCargoPickModal,
  setPendingOrders,
}) => {
  const toId = (value: unknown): number => parseInt(`${value ?? ''}`, 10);
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
      <div className={styles.battleUnitOrdersBody}>
        {readBattleUnitOrdersFromPayload(battleUnitOrders.unit).map((o) => {
          const key = inferOrderKey(o);
          const uOrd = battleUnitOrders.unit;
          let can = Boolean(key) && apiRoomId != null && battleStarted;
          if (can && (key === 'getSup' || key === 'loading' || key === 'tow') && !isTruckUnitBattle(uOrd)) {
            can = false;
          }
          if (can && key === 'unloading') {
            if (!isTruckUnitBattle(uOrd) || getCarriedUnitsFromTruck(uOrd).length === 0) can = false;
          }
          const cellForAmbush = resolveBattleCellOnField(battleUnitOrders.cell, cells) ?? battleUnitOrders.cell;
          const ambushBlocked =
            key === 'ambush' &&
            !canPlaceAmbushFromEnemyVision(
              uOrd as Parameters<typeof canPlaceAmbushFromEnemyVision>[0],
              cellForAmbush,
              cells,
            );
          const isArtilleryOrd = `${uOrd.type || ''}`.toLowerCase() === 'artillery';
          const artTac = uOrd.tactical as { artilleryDeployed?: boolean } | undefined;
          const artDeployedOrd = artTac?.artilleryDeployed === true;
          let artOrderBlocked = false;
          let artOrderTitle = '';
          if (isArtilleryOrd) {
            if (key === 'ambush') {
              artOrderBlocked = true;
              artOrderTitle = 'Засада недоступна для артиллерии';
            } else if ((key === 'fire' || key === 'fireHard') && !artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Сначала «Развёртывание», затем сектор («Оборона») и огонь';
            } else if (key === 'attack' && artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Развёрнутое орудие не ведёт ближний бой — только огонь';
            } else if (key === 'defend' && !artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Сектор обстрела только после «Развёртывание»';
            } else if ((key === 'move' || key === 'moveWar') && artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Развёрнутое орудие не двигается — «Свёртывание»';
            } else if (key === 'deploy' && artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Орудие уже развёрнуто';
            } else if (key === 'changeSector' && !artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Смена сектора: сначала «Развёртывание»';
            } else if (key === 'clotting' && !artDeployedOrd) {
              artOrderBlocked = true;
              artOrderTitle = 'Орудие уже свёрнуто';
            }
          }
          const orderIcon = key ? getBattleOrderIconUrl(key) : null;
          return (
            <button
              key={`${o.id}-${o.name}`}
              type="button"
              className={styles.battleUnitOrderBtn}
              disabled={!can || ambushBlocked || artOrderBlocked}
              title={
                artOrderTitle ||
                (ambushBlocked
                  ? 'Засада: ваш гекс должен быть вне обзора всех юнитов противника (туман, рельеф, дистанция).'
                  : !can
                    ? 'Нужен бой по сети и стабильный ключ приказа (order_key в БД или узнаваемое имя)'
                    : 'Назначить приказ — затем укажите цель на карте')
              }
              onClick={() => {
                if (!key) return;
                const tac = uOrd.tactical as { meleeOpponentInstanceId?: unknown; fireSuppression?: boolean } | undefined;
                if (tac?.meleeOpponentInstanceId != null && isFinite(toId(tac.meleeOpponentInstanceId))) {
                  window.alert(
                    myBattleFaction === 'wehrmacht'
                      ? 'За фюрера! Отряд в ближнем бою — приказы недоступны.'
                      : 'За Сталина! Отряд в ближнем бою — приказы недоступны.',
                  );
                  return;
                }
                if (tac?.fireSuppression) {
                  window.alert('Отряд в огневом положении — нельзя выполнять другие приказы.');
                  return;
                }
                const iid = toId(battleUnitOrders.unit.instanceId);
                if (!isFinite(iid)) return;
                if ((key === 'getSup' || key === 'loading' || key === 'tow') && !isTruckUnitBattle(uOrd)) return;
                if (key === 'unloading') {
                  if (!isTruckUnitBattle(uOrd)) return;
                  const carried = getCarriedUnitsFromTruck(uOrd);
                  if (!carried.length) return;
                  const unitSave = battleUnitOrders.unit;
                  const cellSave = battleUnitOrders.cell;
                  setBattleUnitOrders(null);
                  if (carried.length === 1) {
                    setOrderPick({
                      unit: unitSave as any,
                      cell: cellSave,
                      orderKey: 'unloading',
                      orderLabel: o.name,
                      unloadCargoInstanceId: toId(carried[0].instanceId),
                    });
                    return;
                  }
                  setUnloadCargoPickModal({
                    truck: uOrd,
                    cell: cellSave,
                    orderLabel: o.name,
                    carried,
                  });
                  return;
                }
                if (key === 'defend' || key === 'ambush') {
                  if (`${uOrd.type || ''}`.toLowerCase() === 'artillery') {
                    if (key === 'ambush') {
                      window.alert('Засада для артиллерии недоступна.');
                      return;
                    }
                    const at = uOrd.tactical as { artilleryDeployed?: boolean } | undefined;
                    if (at?.artilleryDeployed !== true) {
                      window.alert('Сектор обстрела: сначала приказ «Развёртывание».');
                      return;
                    }
                  }
                  const cellAmbush = resolveBattleCellOnField(battleUnitOrders.cell, cells) ?? battleUnitOrders.cell;
                  if (
                    key === 'ambush' &&
                    !canPlaceAmbushFromEnemyVision(
                      uOrd as Parameters<typeof canPlaceAmbushFromEnemyVision>[0],
                      cellAmbush,
                      cells,
                    )
                  ) {
                    window.alert('Засада: ваш гекс должен быть вне обзора всех юнитов противника (туман, рельеф, дистанция).');
                    return;
                  }
                  setOrderPick({
                    unit: battleUnitOrders.unit,
                    cell: battleUnitOrders.cell,
                    orderKey: key,
                    orderLabel: o.name,
                    defendStep: 'facing',
                  });
                  setBattleUnitOrders(null);
                  return;
                }
                if (key === 'clotting') {
                  if (`${uOrd.type || ''}`.toLowerCase() !== 'artillery') return;
                  setPendingOrders((prev) => {
                    const next = prev.filter((x) => x.unitInstanceId !== iid);
                    next.push({ unitInstanceId: iid, orderKey: 'clotting' });
                    return next;
                  });
                  setBattleUnitOrders(null);
                  return;
                }
                if (key === 'deploy') {
                  if (`${uOrd.type || ''}`.toLowerCase() !== 'artillery') return;
                  setOrderPick({
                    unit: battleUnitOrders.unit,
                    cell: battleUnitOrders.cell,
                    orderKey: 'deploy',
                    orderLabel: o.name,
                    defendStep: 'facing',
                  });
                  setBattleUnitOrders(null);
                  return;
                }
                if (key === 'changeSector') {
                  if (`${uOrd.type || ''}`.toLowerCase() !== 'artillery') return;
                  const atc = uOrd.tactical as { artilleryDeployed?: boolean } | undefined;
                  if (atc?.artilleryDeployed !== true) {
                    window.alert('Смена сектора: орудие должно быть развёрнуто.');
                    return;
                  }
                  setOrderPick({
                    unit: battleUnitOrders.unit,
                    cell: battleUnitOrders.cell,
                    orderKey: 'changeSector',
                    orderLabel: o.name,
                    defendStep: 'facing',
                  });
                  setBattleUnitOrders(null);
                  return;
                }
                if (key === 'fire' || key === 'fireHard') {
                  const liveForFire = findUnitCellByInstanceId(cells, iid);
                  if (!liveForFire) return;
                  const ammoNow = readAmmoCountUi(uOrd);
                  const needAmmo = key === 'fireHard' ? 3 : 1;
                  if (ammoNow < needAmmo) {
                    window.alert(
                      key === 'fireHard'
                        ? `Недостаточно БК для огня на подавление: нужно ${needAmmo}, сейчас ${ammoNow}.`
                        : 'Нет боеприпасов для стрельбы.',
                    );
                    return;
                  }
                  const fh = computeBattleFireHighlights(
                    uOrd,
                    liveForFire.cell,
                    cells,
                    key,
                    battleFogRevealedCellIds,
                  );
                  const hasFire = (fh.areaCellIds && fh.areaCellIds.length > 0) || (fh.instanceIds && fh.instanceIds.length > 0);
                  if (!hasFire) {
                    window.alert('Нет целей в зоне огня: недостаточная дальность, цели вне сектора, туман войны или рельеф.');
                    return;
                  }
                }
                setOrderPick({
                  unit: battleUnitOrders.unit,
                  cell: battleUnitOrders.cell,
                  orderKey: key,
                  orderLabel: o.name,
                });
                setBattleUnitOrders(null);
              }}
            >
              <span className={styles.battleUnitOrderBtnInner}>
                {orderIcon ? <img src={orderIcon} alt="" className={styles.battleUnitOrderBtnIcon} /> : null}
                <span className={styles.battleUnitOrderBtnLabel}>{o.name}</span>
              </span>
            </button>
          );
        })}
        <div className={styles.battleUnitOrdersCancelWrap}>
          <Button
            name="Отмена приказа"
            className={styles.battleModalBtn}
            onClick={() => {
              const iid = toId(battleUnitOrders.unit.instanceId);
              if (isFinite(iid)) {
                setPendingOrders((prev) => prev.filter((x) => x.unitInstanceId !== iid));
              }
              setBattleUnitOrders(null);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default BattleUnitOrdersPanel;

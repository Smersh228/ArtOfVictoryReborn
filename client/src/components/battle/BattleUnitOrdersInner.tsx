import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../../api/rooms';
import {
  buildAccompanimentOrderPayload,
  listAccompanimentEscortCandidates,
  type AccompanimentEscortCandidate,
} from '../../game/battleAirSupport';
import {
  canOfferFireAdjustment,
  canArtilleryUseFireAdjustment,
} from '../../game/battleFireAdjustment';
import {
  MELEE_ONLY_FIRE_ORDER_BLOCK_TITLE,
  unitHasMeleeOnlyFireRowOptions,
} from '../../game/battleUnitFireOptions';
import { findGroundBattleUnitByInstanceId, findUnitCellByInstanceId } from '../../game/battleMovePreview';
import {
  canTruckAcceptLoading,
  canTruckAcceptTow,
  computeLoadingSupTargetCellIds,
} from '../../game/battleLogisticsUi';
import {
  canRailAcceptLoading,
  isRailwayUnitBattle,
} from '../../game/battleRailway';
import {
  cellsEligibleForExplomost,
  SMOKE_BLOCKED_ORDERS,
} from '../../game/cellSmoke';
import { getUnitExplosivesStock, getUnitMinesStock, getUnitSmokeShellsStock } from '../../game/battleUnitStatsTip';
import {
  canEnterDotUnitType,
  cellsEligibleForEnterDot,
  cellsEligibleForExitDot,
  getDotAmmo,
  unitDotEntering,
  unitDotExiting,
  unitInDot,
} from '../../game/cellDot';
import { cellsEligibleForPonton } from '../../game/cellPonton';
import { cellsEligibleForCutEj } from '../../game/cellAntiTankEdges';
import { cellsEligibleForDemining, hasMineOnCell } from '../../game/editorMapFortifications';

export interface BattleUnitOrdersInnerUnit {
  instanceId?: number | string;
  name?: string;
  type?: string;
  faction?: string;
  tactical?: {
    artilleryDeployed?: boolean;
    meleeOpponentInstanceId?: number | string | null;
    fireSuppression?: boolean;
    desantEquipping?: boolean;
    desantEquipScheduled?: boolean;
    desantOnlyBattleMoveTurnsLeft?: number;
    dotExitTurnsLeft?: number;
    dotEnterTurnsLeft?: number;
    inDot?: boolean;
    trenchDigTurnsLeft?: number;
    sapperJob?: { key?: string; turnsLeft?: number };
    railJob?: { key?: string; turnsLeft?: number };
    onSmoke?: boolean;
    inTrench?: boolean;
  };
  [key: string]: unknown;
}

export interface BattleUnitOrdersInnerProps {
  unit: BattleUnitOrdersInnerUnit;
  cell: Cell;
  layout: 'dialog' | 'airEmbedded';
  apiRoomId: number | null;
  battleStarted: boolean;
  myBattleFaction: 'rkka' | 'wehrmacht' | 'none';
  cells: Cell[];
  battleFogRevealedCellIds: number[] | null;
  readBattleUnitOrdersFromPayload: (
    unit: BattleUnitOrdersInnerUnit,
  ) => Array<{ id: number; name: string; order_key?: string }>;
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

export type BattleUnitOrdersDeps = Omit<BattleUnitOrdersInnerProps, 'unit' | 'cell' | 'layout'>;

const BattleUnitOrdersInner: React.FC<BattleUnitOrdersInnerProps> = ({
  unit,
  cell,
  layout,
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
  const toId = (value: unknown): number => parseInt(`${value ?? ''}`, 10);
  const bodyClass =
    layout === 'airEmbedded'
      ? `${styles.battleUnitOrdersBody} ${styles.airSupportEmbeddedOrdersBody}`
      : styles.battleUnitOrdersBody;

  return (
    <div className={bodyClass}>
      {readBattleUnitOrdersFromPayload(unit).map((o) => {
        const key = inferOrderKey(o);
        const iidOrd = toId(unit.instanceId);
        const liveGroundOrd =
          isFinite(iidOrd) ? findGroundBattleUnitByInstanceId(cells, iidOrd) : null;
        const uOrd =
          liveGroundOrd && !liveGroundOrd.inCargo
            ? (liveGroundOrd.unit as BattleUnitOrdersInnerUnit)
            : unit;
        let can = Boolean(key) && apiRoomId != null && battleStarted;
        if (can && (key === 'getSup' || key === 'loadingSup' || key === 'loading' || key === 'tow') && !isTruckUnitBattle(uOrd)) {
          can = false;
        }
        if (can && (key === 'railLoading' || key === 'railUnloading') && !isRailwayUnitBattle(uOrd)) {
          can = false;
        }
        if (can && key === 'unloading') {
          if (!isTruckUnitBattle(uOrd) || getCarriedUnitsFromTruck(uOrd).length === 0) can = false;
        }
        if (can && key === 'railUnloading') {
          if (!isRailwayUnitBattle(uOrd) || getCarriedUnitsFromTruck(uOrd).length === 0) can = false;
        }
        let truckLogisticsTitle = '';
        if (can && (key === 'loading' || key === 'tow') && isTruckUnitBattle(uOrd)) {
          const truckCell = resolveBattleCellOnField(cell, cells) ?? cell;
          const hasRoom =
            key === 'loading'
              ? canTruckAcceptLoading(cells, uOrd, truckCell)
              : canTruckAcceptTow(cells, uOrd, truckCell);
          if (!hasRoom) {
            can = false;
            truckLogisticsTitle =
              key === 'loading'
                ? 'Кузов заполнен или рядом нет пехоты для погрузки'
                : 'Кузов заполнен или рядом нет свёрнутого орудия для буксира';
          }
        }
        if (can && key === 'loadingSup' && isTruckUnitBattle(uOrd)) {
          const liveTruck = findUnitCellByInstanceId(cells, Number(uOrd.instanceId));
          const truckUnit = liveTruck?.unit ?? uOrd;
          const truckCell = liveTruck?.cell ?? resolveBattleCellOnField(cell, cells) ?? cell;
          if (computeLoadingSupTargetCellIds(cells, truckUnit, truckCell).size === 0) {
            can = false;
            truckLogisticsTitle = 'Рядом нет склада с БК или боезапас грузовика полный';
          }
        }
        if (can && key === 'railLoading' && isRailwayUnitBattle(uOrd)) {
          const trainCell = resolveBattleCellOnField(cell, cells) ?? cell;
          if (!canRailAcceptLoading(cells, uOrd, trainCell)) {
            can = false;
            truckLogisticsTitle = 'Нет места или рядом нет отряда для погрузки на ЖД';
          }
        }
        if (can && key === 'smoke') {
          if (getUnitSmokeShellsStock(uOrd) < 1) {
            can = false;
            truckLogisticsTitle = 'Нет дымовых снарядов';
          }
        }
        if (can && key === 'explomost') {
          if (getUnitExplosivesStock(uOrd) < 1) {
            can = false;
            truckLogisticsTitle = 'Нет взрывчатки';
          } else {
            const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
            if (!cellsEligibleForExplomost(liveCell, cells).length) {
              can = false;
              truckLogisticsTitle = 'Рядом нет понтонного моста';
            }
          }
        }
        let desantOrderTitle = '';
        if (can && key === 'desant') {
          if (getCarriedUnitsFromTruck(uOrd).length === 0) {
            can = false;
            desantOrderTitle = 'На борту нет десантников — высадка недоступна';
          }
        }
        const cellForAmbush = resolveBattleCellOnField(cell, cells) ?? cell;
        const ambushBlocked =
          key === 'ambush' &&
          !canPlaceAmbushFromEnemyVision(uOrd as Parameters<typeof canPlaceAmbushFromEnemyVision>[0], cellForAmbush, cells);
        const tacOrd = uOrd.tactical;
        let desantOrderBlocked = false;
        let desantOrderBlockTitle = '';
        let dotOrderBlocked = false;
        let dotOrderTitle = '';
        const inDotOrd = unitInDot(uOrd);
        const dotExitingOrd = unitDotExiting(uOrd);
        const dotEnteringOrd = unitDotEntering(uOrd);
        const getStr = (u: Record<string, unknown>) => {
          const n = Number(u.str ?? u.strength);
          return Number.isFinite(n) ? n : 0;
        };
        if (dotEnteringOrd) {
          dotOrderBlocked = true;
          dotOrderTitle = 'Занимает ДОТ — приказы недоступны до следующего хода';
        } else if (dotExitingOrd) {
          dotOrderBlocked = true;
          dotOrderTitle = 'Выход из ДОТ — другие приказы недоступны';
        } else if (inDotOrd && key !== 'fire' && key !== 'fireHard' && key !== 'exitDot') {
          dotOrderBlocked = true;
          dotOrderTitle = 'В ДОТ доступны только «Огонь», «Огонь на подавление» и «Покинуть ДОТ»';
        }
        const diggingTrench = Number(tacOrd?.trenchDigTurnsLeft) > 0;
        const sapperJobLeft = Number(tacOrd?.sapperJob?.turnsLeft);
        const sapperWorking = Number.isFinite(sapperJobLeft) && sapperJobLeft > 0;
        const railJobLeft = Number(tacOrd?.railJob?.turnsLeft);
        const railWorking = Number.isFinite(railJobLeft) && railJobLeft > 0;
        if (diggingTrench) {
          dotOrderBlocked = true;
          dotOrderTitle = 'Окапывается — другие приказы недоступны';
        } else if (sapperWorking) {
          dotOrderBlocked = true;
          const jk = String(tacOrd?.sapperJob?.key || '');
          if (jk === 'buildPonton') dotOrderTitle = 'Наводит переправу — другие приказы недоступны';
          else if (jk === 'cutEj') dotOrderTitle = 'Снимает противотанковые заграждения — другие приказы недоступны';
          else if (jk === 'demining') dotOrderTitle = 'Разминирует — другие приказы недоступны';
          else if (jk === 'mining') dotOrderTitle = 'Минирует — другие приказы недоступны';
          else dotOrderTitle = 'Сапёрные работы — другие приказы недоступны';
        } else if (railWorking) {
          dotOrderBlocked = true;
          dotOrderTitle = 'Погрузка/выгрузка на ЖД — другие приказы недоступны';
        } else if (tacOrd?.onSmoke && SMOKE_BLOCKED_ORDERS.has(String(key || ''))) {
          dotOrderBlocked = true;
          dotOrderTitle = 'Дымовая завеса — приказ недоступен';
        }
        if (can && key === 'trenches' && !diggingTrench && !sapperWorking) {
          if (getStr(uOrd) < 3) {
            can = false;
            dotOrderTitle = 'Окопаться: численность не менее 3';
          }
        }
        if (can && key === 'buildPonton' && !sapperWorking) {
          if (getStr(uOrd) < 2) {
            can = false;
            dotOrderTitle = 'Наведение переправы: численность не менее 2';
          } else {
            const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
            if (!cellsEligibleForPonton(liveCell, cells).length) {
              can = false;
              dotOrderTitle = 'Рядом нет гекса реки без готовой переправы';
            }
          }
        }
        if (can && key === 'cutEj' && !sapperWorking) {
          const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
          if (!cellsEligibleForCutEj(liveCell, cells).length) {
            can = false;
            dotOrderTitle = 'Нет противотанковых заграждений на своём или соседнем гексе';
          }
        }
        if (can && key === 'demining' && !sapperWorking) {
          const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
          if (!cellsEligibleForDemining(liveCell, cells, myBattleFaction).length) {
            can = false;
            dotOrderTitle = 'Нет обнаруженного минного поля на своём или соседнем гексе';
          }
        }
        if (can && key === 'mining' && !sapperWorking) {
          if (getUnitMinesStock(uOrd) < 1) {
            can = false;
            dotOrderTitle = 'Нет мин в запасе';
          } else {
            const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
            if (hasMineOnCell(liveCell.builds)) {
              can = false;
              dotOrderTitle = 'На этом гексе уже есть минное поле';
            }
          }
        }
        if (can && key === 'enterDot') {
          if (!canEnterDotUnitType(uOrd)) {
            can = false;
            dotOrderTitle = 'Занять ДОТ могут только пехота и артиллерия';
          } else if (inDotOrd) {
            can = false;
            dotOrderTitle = 'Юнит уже в ДОТ';
          } else {
            const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
            if (!cellsEligibleForEnterDot(liveCell, cells, getStr).length) {
              can = false;
              dotOrderTitle = 'Рядом нет свободного ДОТ';
            }
          }
        }
        if (can && key === 'exitDot') {
          if (!inDotOrd) {
            can = false;
            dotOrderTitle = 'Юнит не в ДОТ';
          } else if (dotExitingOrd) {
            can = false;
            dotOrderTitle = 'Уже выходит из ДОТ';
          } else {
            const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
            if (!cellsEligibleForExitDot(liveCell, cells, getStr).length) {
              can = false;
              dotOrderTitle = 'Нет свободной клетки для выхода';
            }
          }
        }
        if (can && inDotOrd && (key === 'fire' || key === 'fireHard')) {
          const need = key === 'fireHard' ? 3 : 1;
          const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
          if (getDotAmmo(liveCell.builds) < need) {
            can = false;
            dotOrderTitle = `Недостаточно боезапаса в ДОТ (нужно ${need})`;
          }
        }
        if (tacOrd?.desantEquipping || tacOrd?.desantEquipScheduled) {
          desantOrderBlocked = true;
          desantOrderBlockTitle = 'Снаряжение после десантирования — приказы недоступны';
        } else if (
          tacOrd?.desantOnlyBattleMoveTurnsLeft != null &&
          Number(tacOrd.desantOnlyBattleMoveTurnsLeft) > 0 &&
          key !== 'moveWar'
        ) {
          desantOrderBlocked = true;
          desantOrderBlockTitle =
            'После десанта на водную/болотную местность доступно только «Боевое положение»';
        }
        const meleeOnlyFire =
          (key === 'fire' || key === 'fireHard') && unitHasMeleeOnlyFireRowOptions(uOrd);
        const inMelee =
          tacOrd?.meleeOpponentInstanceId != null && isFinite(toId(tacOrd.meleeOpponentInstanceId));
        const meleeLockedOrder =
          inMelee && key !== 'attack' && key !== 'hardMove' && key !== 'move';
        const meleeLockedTitle = meleeLockedOrder
          ? 'В ближнем бою доступны только «Атака» и отход («Движение» на соседний гекс)'
          : '';
        const isArtilleryOrd = `${uOrd.type || ''}`.toLowerCase() === 'artillery';
        const artTac = uOrd.tactical as { artilleryDeployed?: boolean } | undefined;
        const artDeployedOrd = artTac?.artilleryDeployed === true;
        let artOrderBlocked = false;
        let artOrderTitle = '';
        if (isArtilleryOrd) {
          if (key === 'ambush') {
            artOrderBlocked = true;
            artOrderTitle = 'Засада недоступна для артиллерии';
          } else if ((key === 'fire' || key === 'fireHard' || key === 'fireMove') && !artDeployedOrd && !inDotOrd) {
            artOrderBlocked = true;
            artOrderTitle = 'Сначала «Развёртывание», затем сектор («Оборона») и огонь';
          } else if ((key === 'attack' || key === 'hardMove') && artDeployedOrd) {
            artOrderBlocked = true;
            artOrderTitle = 'Развёрнутое орудие не ведёт ближний бой — только огонь';
          } else if (key === 'defend' && !artDeployedOrd) {
            artOrderBlocked = true;
            artOrderTitle = 'Сектор обстрела только после «Развёртывание»';
          } else if ((key === 'move' || key === 'moveWar' || key === 'fireMove') && artDeployedOrd) {
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
            disabled={!can || ambushBlocked || artOrderBlocked || desantOrderBlocked || meleeOnlyFire || meleeLockedOrder || dotOrderBlocked}
            title={
              meleeLockedTitle ||
              dotOrderTitle ||
              artOrderTitle ||
              desantOrderTitle ||
              desantOrderBlockTitle ||
              truckLogisticsTitle ||
              (meleeOnlyFire ? MELEE_ONLY_FIRE_ORDER_BLOCK_TITLE : '') ||
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
                if (key !== 'attack' && key !== 'hardMove' && key !== 'move') {
                  window.alert(
                    myBattleFaction === 'wehrmacht'
                      ? 'За фюрера! В ближнем бою — только «Атака» или отход («Движение» на соседний гекс).'
                      : 'За Сталина! В ближнем бою — только «Атака» или отход («Движение» на соседний гекс).',
                  );
                  return;
                }
              }
              if (tac?.fireSuppression) {
                window.alert('Отряд в огневом подавлении — приказы недоступны.');
                return;
              }
              const iid = toId(unit.instanceId);
              if (!isFinite(iid)) return;
              let pickUseFireAdjustment = false;
              if ((key === 'getSup' || key === 'loadingSup' || key === 'loading' || key === 'tow') && !isTruckUnitBattle(uOrd)) return;
              if (key === 'unloading') {
                if (!isTruckUnitBattle(uOrd)) return;
                const carried = getCarriedUnitsFromTruck(uOrd);
                if (!carried.length) return;
                const unitSave = unit;
                const cellSave = cell;
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
              if (key === 'railUnloading') {
                if (!isRailwayUnitBattle(uOrd)) return;
                const carried = getCarriedUnitsFromTruck(uOrd);
                if (!carried.length) return;
                const unitSave = unit;
                const cellSave = cell;
                setBattleUnitOrders(null);
                if (carried.length === 1) {
                  setOrderPick({
                    unit: unitSave as any,
                    cell: cellSave,
                    orderKey: 'railUnloading',
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
                const cellAmbush = resolveBattleCellOnField(cell, cells) ?? cell;
                if (
                  key === 'ambush' &&
                  !canPlaceAmbushFromEnemyVision(
                    uOrd as Parameters<typeof canPlaceAmbushFromEnemyVision>[0],
                    cellAmbush,
                    cells,
                  )
                ) {
                  window.alert(
                    'Засада: ваш гекс должен быть вне обзора всех юнитов противника (туман, рельеф, дистанция).',
                  );
                  return;
                }
                setOrderPick({
                  unit,
                  cell,
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
              if (key === 'medical') {
                setPendingOrders((prev) => {
                  const next = prev.filter((x) => x.unitInstanceId !== iid);
                  next.push({ unitInstanceId: iid, orderKey: 'medical' });
                  return next;
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'enterDot') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: 'enterDot',
                  orderLabel: o.name,
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'exitDot') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: 'exitDot',
                  orderLabel: o.name,
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'mining') {
                const liveCell = resolveBattleCellOnField(cell, cells) ?? cell;
                if (getUnitMinesStock(uOrd) < 1) {
                  window.alert('Нет мин в запасе.');
                  return;
                }
                if (hasMineOnCell(liveCell.builds)) {
                  window.alert('На этом гексе уже есть минное поле.');
                  return;
                }
                setPendingOrders((prev) => {
                  const next = prev.filter((x) => x.unitInstanceId !== iid);
                  next.push({
                    unitInstanceId: iid,
                    orderKey: 'mining',
                    targetCellId: Number(liveCell.id),
                  });
                  return next;
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'deploy') {
                if (`${uOrd.type || ''}`.toLowerCase() !== 'artillery') return;
                setOrderPick({
                  unit,
                  cell,
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
                  unit,
                  cell,
                  orderKey: 'changeSector',
                  orderLabel: o.name,
                  defendStep: 'facing',
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'fire' || key === 'fireHard' || key === 'fireMove') {
                const liveForFire = findGroundBattleUnitByInstanceId(cells, iid);
                if (!liveForFire) {
                  window.alert('Юнит не найден на карте.');
                  return;
                }
                if (liveForFire.inCargo) {
                  window.alert('Отряд ещё на борту — огонь доступен после высадки на гекс.');
                  return;
                }
                const liveUnit = liveForFire.unit as BattleUnitOrdersInnerUnit;
                const needAmmo = key === 'fireHard' ? 3 : 1;
                const ammoNow = unitInDot(liveUnit)
                  ? getDotAmmo(liveForFire.cell.builds)
                  : readAmmoCountUi(liveUnit);
                if (ammoNow < needAmmo) {
                  const fromDot = unitInDot(liveUnit);
                  window.alert(
                    key === 'fireHard'
                      ? `Недостаточно ${fromDot ? 'боезапаса ДОТ' : 'БК'} для огня на подавление: нужно ${needAmmo}, сейчас ${ammoNow}.`
                      : fromDot
                        ? 'Нет боезапаса в ДОТ для стрельбы.'
                        : 'Нет боеприпасов для стрельбы.',
                  );
                  return;
                }
                const findUnitById = (id: number) => {
                  const live = findGroundBattleUnitByInstanceId(cells, id);
                  if (!live || live.inCargo) return null;
                  return (live.unit as BattleUnitOrdersInnerUnit | undefined) ?? null;
                };
                const offerAdj =
                  key === 'fire' &&
                  canArtilleryUseFireAdjustment(liveUnit, key) &&
                  canOfferFireAdjustment(cells, myBattleFaction, pendingOrders, findUnitById);
                const highlightOpts = { viewerFaction: myBattleFaction };
                let useFireAdj = false;
                let fh = computeBattleFireHighlights(
                  liveUnit,
                  liveForFire.cell,
                  cells,
                  key,
                  battleFogRevealedCellIds,
                  { ...highlightOpts, useFireAdjustment: false },
                );
                const countHighlights = (h: typeof fh) => {
                  const areaCount =
                    h.areaCellIds instanceof Set
                      ? h.areaCellIds.size
                      : Array.isArray(h.areaCellIds)
                        ? h.areaCellIds.length
                        : 0;
                  const targetCount =
                    h.instanceIds instanceof Set
                      ? h.instanceIds.size
                      : Array.isArray(h.instanceIds)
                        ? h.instanceIds.length
                        : 0;
                  return areaCount > 0 || targetCount > 0;
                };
                if (!countHighlights(fh) && offerAdj) {
                  fh = computeBattleFireHighlights(
                    liveUnit,
                    liveForFire.cell,
                    cells,
                    key,
                    battleFogRevealedCellIds,
                    { ...highlightOpts, useFireAdjustment: true },
                  );
                  if (countHighlights(fh)) useFireAdj = true;
                }
                pickUseFireAdjustment = useFireAdj;
                if (!countHighlights(fh)) {
                  window.alert(
                    explainNoFireTargets(
                      liveUnit,
                      liveForFire.cell,
                      cells,
                      key === 'fireHard' ? 'fireHard' : 'fire',
                      battleFogRevealedCellIds,
                    ),
                  );
                  return;
                }
                setOrderPick({
                  unit: { ...(liveUnit as Record<string, unknown>), instanceId: iid },
                  cell: liveForFire.cell,
                  orderKey: key,
                  orderLabel: o.name,
                  ...(key === 'fire' && pickUseFireAdjustment ? { useFireAdjustment: true } : {}),
                  ...(key === 'fireMove' ? { fireMoveStep: 'target' as const } : {}),
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'accompaniment') {
                const escorterIid = toId(unit.instanceId);
                if (!isFinite(escorterIid)) return;
                const candidates = listAccompanimentEscortCandidates(
                  escorterIid,
                  uOrd.faction,
                  pendingOrders,
                  cells,
                );
                if (!candidates.length) {
                  window.alert(
                    'Нет дружественной авиации с назначенным приказом, которую можно сопровождать (та же цель должна быть в дальности полёта).',
                  );
                  return;
                }
                setBattleUnitOrders(null);
                const submitAccompaniment = (candidate: AccompanimentEscortCandidate) => {
                  const payload = buildAccompanimentOrderPayload(escorterIid, candidate, cells);
                  if (!payload) {
                    window.alert('Не удалось построить траекторию сопровождения.');
                    return;
                  }
                  setPendingOrders((prev) => {
                    const next = prev.filter((x) => x.unitInstanceId !== escorterIid);
                    next.push(payload);
                    return next;
                  });
                };
                if (candidates.length === 1) {
                  submitAccompaniment(candidates[0]);
                  return;
                }
                setAccompanimentPickModal({
                  escorter: unit,
                  cell,
                  orderLabel: o.name,
                  candidates,
                });
                return;
              }
              if (key === 'interception') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: key,
                  orderLabel: o.name,
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'patrol') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: key,
                  orderLabel: o.name,
                  patrolStep: 'target',
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'bombardment') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: key,
                  orderLabel: o.name,
                  bombardmentStep: 'target',
                });
                setBattleUnitOrders(null);
                return;
              }
              if (key === 'razvedka' || key === 'svzy') {
                setOrderPick({
                  unit,
                  cell,
                  orderKey: key,
                  orderLabel: o.name,
                  reconRangeStep: 'radius',
                });
                setBattleUnitOrders(null);
                return;
              }
              setOrderPick({
                unit,
                cell,
                orderKey: key,
                orderLabel: o.name,
                ...(key === 'fire' && pickUseFireAdjustment ? { useFireAdjustment: true } : {}),
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
            const iid = toId(unit.instanceId);
            if (isFinite(iid)) {
              setPendingOrders((prev) => prev.filter((x) => x.unitInstanceId !== iid));
            }
            setBattleUnitOrders(null);
          }}
        />
      </div>
    </div>
  );
};

export default BattleUnitOrdersInner;

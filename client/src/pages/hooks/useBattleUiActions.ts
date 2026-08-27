import { useCallback, useMemo } from 'react';
import type React from 'react';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import type { BattleOrderPayload } from '../../api/rooms';
import { buildAccompanimentOrderPayload } from '../../game/battleAirSupport';
import { sanitizeDotOrdersBeforeSubmit } from '../../game/cellDot';

type BattleLeftPanelId = 'report' | 'tasks';
type BattleCenterModalId = 'surrender' | 'nextTurn' | null;

export function useBattleUiActions(params: {
  leftMenu: BattleLeftPanelId | null;
  setLeftMenu: React.Dispatch<React.SetStateAction<BattleLeftPanelId | null>>;
  centerModal: BattleCenterModalId;
  setCenterModal: React.Dispatch<React.SetStateAction<BattleCenterModalId>>;
  battleEndedOverlay: boolean;
  readonlyBattle: boolean;
  missionMaxTurns: string;
  pendingOrders: BattleOrderPayload[];
  confirmNextTurn: (snapshot: BattleOrderPayload[]) => Promise<boolean>;
  setPendingOrders: React.Dispatch<React.SetStateAction<BattleOrderPayload[]>>;
  dismissOrderPicking: () => void;
  broadcastSurrender: () => Promise<void>;
  leaveBattleRoomAndGoMain: () => Promise<void>;
  dismissScenarioOutcome: () => void;
  dismissVictory: () => void;
  battleAmmoModal: any;
  ammoPickCount: number;
  apiRoomId: number | null;
  setBattleAmmoModal: React.Dispatch<React.SetStateAction<any>>;
  setOrderPick: React.Dispatch<React.SetStateAction<any>>;
  unloadCargoPickModal: any;
  setUnloadCargoPickModal: React.Dispatch<React.SetStateAction<any>>;
  accompanimentPickModal: {
    escorter: { instanceId?: number | string };
    candidates: import('../../game/battleAirSupport').AccompanimentEscortCandidate[];
  } | null;
  setAccompanimentPickModal: React.Dispatch<React.SetStateAction<any>>;
  cells: Cell[];
}) {
  const {
    leftMenu,
    setLeftMenu,
    centerModal,
    setCenterModal,
    battleEndedOverlay,
    readonlyBattle,
    missionMaxTurns,
    pendingOrders,
    confirmNextTurn,
    setPendingOrders,
    dismissOrderPicking,
    broadcastSurrender,
    leaveBattleRoomAndGoMain,
    dismissScenarioOutcome,
    dismissVictory,
    battleAmmoModal,
    ammoPickCount,
    apiRoomId,
    setBattleAmmoModal,
    setOrderPick,
    unloadCargoPickModal,
    setUnloadCargoPickModal,
    accompanimentPickModal,
    setAccompanimentPickModal,
    cells,
  } = params;

  const closeLeftMenu = useCallback(() => setLeftMenu(null), [setLeftMenu]);
  const closeCenterModal = useCallback(() => setCenterModal(null), [setCenterModal]);

  const openCenterModal = useCallback(
    (id: BattleCenterModalId) => {
      setLeftMenu(null);
      setCenterModal(id);
    },
    [setLeftMenu, setCenterModal],
  );

  const toggleLeftMenu = useCallback(
    (id: BattleLeftPanelId) => {
      setLeftMenu((prev) => (prev === id ? null : id));
    },
    [setLeftMenu],
  );

  const sideTitle = useMemo(
    () => (leftMenu === 'report' ? 'Отчёт о бою' : leftMenu === 'tasks' ? 'Задания' : ''),
    [leftMenu],
  );

  const sideSubtitle = useMemo(() => {
    if (leftMenu !== 'tasks') return '';
    return missionMaxTurns
      ? `Сценарные задачи · лимит ходов миссии: ${missionMaxTurns}`
      : 'Сценарные задачи с карты миссии';
  }, [leftMenu, missionMaxTurns]);

  const backdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      if (battleEndedOverlay) return;
      if (centerModal) closeCenterModal();
      else closeLeftMenu();
    },
    [battleEndedOverlay, centerModal, closeCenterModal, closeLeftMenu],
  );

  const onConfirmSurrender = useCallback(async () => {
    await broadcastSurrender();
    closeCenterModal();
    await leaveBattleRoomAndGoMain();
  }, [broadcastSurrender, closeCenterModal, leaveBattleRoomAndGoMain]);

  const onConfirmNextTurn = useCallback(() => {
    closeCenterModal();
    const snapshot = sanitizeDotOrdersBeforeSubmit([...pendingOrders], cells);
    void confirmNextTurn(snapshot).then((ok) => {
      if (ok) {
        setPendingOrders([]);
        dismissOrderPicking();
      }
    });
  }, [closeCenterModal, pendingOrders, cells, confirmNextTurn, setPendingOrders, dismissOrderPicking]);

  const onExitAfterScenario = useCallback(async () => {
    dismissScenarioOutcome();
    await leaveBattleRoomAndGoMain();
  }, [dismissScenarioOutcome, leaveBattleRoomAndGoMain]);

  const onExitAfterVictory = useCallback(async () => {
    dismissVictory();
    await leaveBattleRoomAndGoMain();
  }, [dismissVictory, leaveBattleRoomAndGoMain]);

  const onLeaveOrSurrender = useCallback(() => {
    if (readonlyBattle) {
      void leaveBattleRoomAndGoMain();
      return;
    }
    openCenterModal('surrender');
  }, [readonlyBattle, leaveBattleRoomAndGoMain, openCenterModal]);

  const onShowReport = useCallback(() => toggleLeftMenu('report'), [toggleLeftMenu]);
  const onShowTasks = useCallback(() => toggleLeftMenu('tasks'), [toggleLeftMenu]);
  const onNextTurn = useCallback(() => openCenterModal('nextTurn'), [openCenterModal]);

  const onCloseAmmoModal = useCallback(() => setBattleAmmoModal(null), [setBattleAmmoModal]);
  const onCloseUnloadCargoModal = useCallback(
    () => setUnloadCargoPickModal(null),
    [setUnloadCargoPickModal],
  );

  const onConfirmAmmoTransfer = useCallback(() => {
    if (!battleAmmoModal || apiRoomId == null || !Number.isFinite(apiRoomId)) return;
    const give = Math.max(1, Math.min(battleAmmoModal.maxTransfer, Math.floor(ammoPickCount) || 1));
    const warehouseCellId = Number(battleAmmoModal.warehouseCellId);
    if (battleAmmoModal.warehouseCellId != null && Number.isFinite(warehouseCellId)) {
      const truckId = Number(battleAmmoModal.receiver.instanceId);
      if (!Number.isFinite(truckId)) return;
      setPendingOrders((prev) => {
        const next = prev.filter((x) => x.unitInstanceId !== truckId);
        next.push({
          unitInstanceId: truckId,
          orderKey: 'loadingSup',
          targetCellId: warehouseCellId,
          transferAmmo: give,
        });
        return next;
      });
      setBattleAmmoModal(null);
      dismissOrderPicking();
      return;
    }
    const giverId = Number(battleAmmoModal.giver.instanceId);
    const recvId = Number(battleAmmoModal.receiver.instanceId);
    if (!Number.isFinite(giverId) || !Number.isFinite(recvId)) return;
    setPendingOrders((prev) => {
      const next = prev.filter((x) => x.unitInstanceId !== giverId);
      next.push({
        unitInstanceId: giverId,
        orderKey: 'getSup',
        targetUnitInstanceId: recvId,
        transferAmmo: give,
      });
      return next;
    });
    setBattleAmmoModal(null);
    dismissOrderPicking();
  }, [
    battleAmmoModal,
    apiRoomId,
    ammoPickCount,
    setPendingOrders,
    setBattleAmmoModal,
    dismissOrderPicking,
  ]);

  const onSelectUnloadCargo = useCallback(
    (iid: number) => {
      if (!unloadCargoPickModal) return;
      setOrderPick({
        unit: unloadCargoPickModal.truck,
        cell: unloadCargoPickModal.cell,
        orderKey: 'unloading',
        orderLabel: unloadCargoPickModal.orderLabel,
        unloadCargoInstanceId: iid,
      });
      setUnloadCargoPickModal(null);
    },
    [unloadCargoPickModal, setOrderPick, setUnloadCargoPickModal],
  );

  const onCloseAccompanimentModal = useCallback(() => {
    setAccompanimentPickModal(null);
  }, [setAccompanimentPickModal]);

  const onSelectAccompanimentTarget = useCallback(
    (targetInstanceId: number) => {
      if (!accompanimentPickModal) return;
      const escorterIid = parseInt(`${accompanimentPickModal.escorter.instanceId ?? ''}`, 10);
      if (!Number.isFinite(escorterIid)) return;
      const candidate = accompanimentPickModal.candidates.find((c) => c.unitInstanceId === targetInstanceId);
      if (!candidate) return;
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
      setAccompanimentPickModal(null);
    },
    [accompanimentPickModal, cells, setPendingOrders, setAccompanimentPickModal],
  );

  return {
    closeLeftMenu,
    closeCenterModal,
    sideTitle,
    sideSubtitle,
    backdropMouseDown,
    onConfirmSurrender,
    onConfirmNextTurn,
    onExitAfterScenario,
    onExitAfterVictory,
    onLeaveOrSurrender,
    onShowReport,
    onShowTasks,
    onNextTurn,
    onCloseAmmoModal,
    onConfirmAmmoTransfer,
    onCloseUnloadCargoModal,
    onSelectUnloadCargo,
    onCloseAccompanimentModal,
    onSelectAccompanimentTarget,
  };
}

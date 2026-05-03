import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import sovBattleTopicUrl from '../img/backgrondImage/SOVTopic.png';
import werBattleTopicUrl from '../img/backgrondImage/WERTopic1.png';
import menuBackgroundUrl from '../img/backgrondImage/Menu.jpg';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import styles from './styleModules/battle.module.css';
import BattleMapStage from '../components/battle/BattleMapStage';
import BattleCenterModals from '../components/battle/BattleCenterModals';
import BattleActionModals from '../components/battle/BattleActionModals';
import BattleSidePanel from '../components/battle/BattleSidePanel';
import BattleToolbar from '../components/battle/BattleToolbar';
import BattleUnitOrdersPanel from '../components/battle/BattleUnitOrdersPanel';
import BattleUnitTipCard from '../components/battle/BattleUnitTipCard';
import { useBattleDerivedState } from './hooks/useBattleDerivedState';
import { useBattleHudLayout } from './hooks/useBattleHudLayout';
import { useBattleReportRows } from './hooks/useBattleReportRows';
import { useBattleUiActions } from './hooks/useBattleUiActions';
import { useBattleViewState } from './hooks/useBattleViewState';
import {
  buildInitialBattleCells,
  cellsFromEditorPayload,
  factionsOpposedOnMap,
  formatBattleTechCargoLine,
  formatBattleUnitFactionLabel,
  formatBattleUnitPlayerLabel,
  inferOrderKey,
  readBattleUnitOrdersFromPayload,
  resolveBattleCellOnField,
  unitIsMineOnMap,
} from './battlePageUtils';
import { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { parseBattlePlayer, useBattleSync } from '../game/battleSync';
import { findUnitCellByInstanceId } from '../game/battleMovePreview';
import { computeBattleFireHighlights } from '../game/battleFirePreview';
import {
  getCarriedUnitsFromTruck,
  isTruckUnitBattle,
  readAmmoCountUi,
  getAmmoCapacityMaxUi,
} from '../game/battleLogisticsUi';
import { canPlaceAmbushFromEnemyVision } from '../game/hexVisibility';
import {
  fetchRoomDetail,
  fetchRoomLobbyMap,
  leaveRoom,
  type BattleOrderPayload,
  type LobbyFaction,
} from '../api/rooms';
import type { EditorMapPayloadLobby } from '../api/maps';
import { getBattleOrderIconUrl } from '../game/battleOrderIcons';
import {
  battleLogEntryReplayWithFallback,
} from './battleReportLog';

const MAP_PAD = 16;

type BattleLogReplayState = ReturnType<typeof battleLogEntryReplayWithFallback>;

type BattleLeftPanelId = 'report' | 'tasks';
type BattleCenterModalId = 'surrender' | 'nextTurn';

const PANEL_MARGIN_LEFT = 20;
const GAP_BEFORE_BATTLE = 16;
const MIN_SIDE_PANEL_WIDTH = 220;

type BattleUnitTipState = {
  unit: Record<string, unknown>;
  cell: Cell;
  clientX: number;
  clientY: number;
  capturedAtTurn: number;
};

type BattleUnitOrdersState = {
  unit: Record<string, unknown>;
  cell: Cell;
  clientX: number;
  clientY: number;
};

type OrderPickState = {
  unit: Record<string, unknown>;
  cell: Cell;
  orderKey: string;
  orderLabel: string;
  defendStep?: 'facing' | 'range';
  defendFacingPickedId?: number;
  unloadCargoInstanceId?: number;
};

const battlePointerCursor =
  typeof import.meta !== 'undefined'
    ? `url(${new URL('../img/cursors/cursorPointer.cur', import.meta.url).href}), pointer`
    : 'pointer';

const Battle: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const serverIdFromState = (location.state as { serverId?: number } | null)?.serverId ?? null;
  const spectatorFromState = Boolean((location.state as { spectator?: boolean } | null)?.spectator);
  const roomParam = searchParams.get('room');
  const serverIdFromUrl =
    roomParam != null && roomParam !== '' ? Number(roomParam) : Number.NaN;
  const apiRoomId =
    serverIdFromState != null && Number.isFinite(serverIdFromState)
      ? serverIdFromState
      : Number.isFinite(serverIdFromUrl)
        ? serverIdFromUrl
        : null;
  const roomIdForSync =
    apiRoomId != null && Number.isFinite(apiRoomId) ? String(apiRoomId) : (searchParams.get('room') ?? 'default');
  const playerId = parseBattlePlayer(searchParams.get('p'));
  const solo = searchParams.get('solo') === '1';
  const spectatorFromQuery = searchParams.get('spectator') === '1';

  const {
    turn,
    waitingNextTurn,
    opponentVictory,
    scenarioBattleOutcome,
    dismissVictory,
    dismissScenarioOutcome,
    broadcastSurrender,
    confirmNextTurn,
    myBattleFaction,
    roomDetail,
  } = useBattleSync(roomIdForSync, playerId, solo, apiRoomId);

  const battleEndedOverlay = opponentVictory || scenarioBattleOutcome != null;
  const selfMember = roomDetail?.members?.find((m) => m.isYou);
  const readonlyBattle = spectatorFromState || spectatorFromQuery || (roomDetail?.battleStartedAt != null && !selfMember);
  const viewerBattleFaction: LobbyFaction = readonlyBattle ? 'none' : myBattleFaction;
  const spectatorResolving =
    readonlyBattle &&
    Number(roomDetail?.battleTurnAckNeed || 0) > 0 &&
    Number(roomDetail?.battleTurnAckCount || 0) > 0;
  const showResolvingOverlay = (waitingNextTurn || spectatorResolving) && !battleEndedOverlay;
  const spectatorNames = useMemo(() => {
    const out: { rkka?: string; wehrmacht?: string } = {}
    for (const m of roomDetail?.members ?? []) {
      if (!m?.label) continue
      if (m.faction === 'rkka' && !out.rkka) out.rkka = m.label
      if (m.faction === 'wehrmacht' && !out.wehrmacht) out.wehrmacht = m.label
    }
    return out
  }, [roomDetail?.members]);

  useLayoutEffect(() => {
    const url =
      myBattleFaction === 'rkka'
        ? sovBattleTopicUrl
        : myBattleFaction === 'wehrmacht'
          ? werBattleTopicUrl
          : menuBackgroundUrl;
    document.body.style.backgroundImage = `url(${url})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';
    return () => {
      document.body.style.backgroundImage = `url(${menuBackgroundUrl})`;
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
    };
  }, [myBattleFaction]);

  const leaveBattleRoomAndGoMain = useCallback(async () => {
    if (apiRoomId != null && Number.isFinite(apiRoomId) && !readonlyBattle) {
      try {
        await leaveRoom(apiRoomId);
      } catch {
        /* уходим в меню даже если API недоступен */
      }
    }
    navigate('/main');
  }, [apiRoomId, navigate, readonlyBattle]);

  const battleRef = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [battleMapLoad, setBattleMapLoad] = useState<'loading' | 'ready'>('loading');
  const [leftMenu, setLeftMenu] = useState<BattleLeftPanelId | null>(null);
  const [centerModal, setCenterModal] = useState<BattleCenterModalId | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const hasGrid = cells.length > 0;
  const [battleUnitTip, setBattleUnitTip] = useState<BattleUnitTipState | null>(null);

  useEffect(() => {
    setBattleUnitTip(null);
  }, [turn]);
  /** id клетки под курсором — показывается в углу карты */
  const [battleHoverCellId, setBattleHoverCellId] = useState<number | null>(null);
  const [battleUnitOrders, setBattleUnitOrders] = useState<BattleUnitOrdersState | null>(null);
  const [battleMapPayload, setBattleMapPayload] = useState<EditorMapPayloadLobby | null>(null);
  const lastBattleFieldRevisionRef = useRef<number>(0);
  const [pendingOrders, setPendingOrders] = useState<BattleOrderPayload[]>([]);
  const [orderPick, setOrderPick] = useState<OrderPickState | null>(null);
  const orderPickRef = useRef<OrderPickState | null>(null);
  orderPickRef.current = orderPick;
  const [battleAmmoModal, setBattleAmmoModal] = useState<{
    giver: Record<string, unknown>;
    receiver: Record<string, unknown>;
    maxTransfer: number;
  } | null>(null);
  const [ammoPickCount, setAmmoPickCount] = useState(1);
  const [unloadCargoPickModal, setUnloadCargoPickModal] = useState<{
    truck: Record<string, unknown>;
    cell: Cell;
    orderLabel: string;
    carried: Record<string, unknown>[];
  } | null>(null);
  const [battleReportReplay, setBattleReportReplay] = useState<BattleLogReplayState | null>(null);

  const dismissOrderPicking = useCallback(() => {
    orderPickRef.current = null;
    setOrderPick(null);
    setBattleUnitOrders(null);
    setBattleHoverCellId(null);
    setBattleAmmoModal(null);
    setUnloadCargoPickModal(null);
  }, []);

  useEffect(() => {
    if (battleAmmoModal) setAmmoPickCount(1);
  }, [battleAmmoModal]);

  useEffect(() => {
    let cancelled = false;

    const applyFallback = () => {
      if (cancelled) return;
      setCells(buildInitialBattleCells());
      setBattleMapPayload(null);
      setBattleMapLoad('ready');
    };

    const run = async () => {
      setBattleMapLoad('loading');
      setCells([]);

      if (apiRoomId == null || !Number.isFinite(apiRoomId)) {
        applyFallback();
        return;
      }

      try {
        const tabVis = typeof document === 'undefined' || document.visibilityState === 'visible';
        const detail = await fetchRoomDetail(apiRoomId, { battleTabVisible: tabVis });
        if (cancelled) return;

        const mid = detail.room.mapId != null ? Number(detail.room.mapId) : NaN;

        if (
          detail.battleStartedAt != null &&
          Array.isArray(detail.battleCells) &&
          detail.battleCells.length > 0
        ) {
          lastBattleFieldRevisionRef.current = detail.battleFieldRevision ?? 0;
          setCells(detail.battleCells as Cell[]);
          if (Number.isFinite(mid)) {
            try {
              const { map } = await fetchRoomLobbyMap(apiRoomId);
              if (!cancelled) setBattleMapPayload((map?.payload ?? null) as EditorMapPayloadLobby | null);
            } catch {
              if (!cancelled) setBattleMapPayload(null);
            }
          } else if (!cancelled) {
            setBattleMapPayload(null);
          }
          if (!cancelled) setBattleMapLoad('ready');
          return;
        }

        if (Number.isFinite(mid)) {
          const { map } = await fetchRoomLobbyMap(apiRoomId);
          const pl = map?.payload ?? null;
          const fromEditor = cellsFromEditorPayload(pl);
          if (fromEditor && !cancelled) {
            setCells(fromEditor);
            setBattleMapPayload(pl as EditorMapPayloadLobby | null);
            setBattleMapLoad('ready');
            return;
          }
        }
        applyFallback();
      } catch {
        applyFallback();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [apiRoomId]);

  useEffect(() => {
    if (!roomDetail?.battleStartedAt) return;
    const rev = roomDetail.battleFieldRevision ?? 0;
    const serverCells = roomDetail.battleCells;
    if (!Array.isArray(serverCells) || serverCells.length === 0) return;
    if (rev === lastBattleFieldRevisionRef.current) return;
    lastBattleFieldRevisionRef.current = rev;
    setCells(serverCells as Cell[]);
  }, [roomDetail?.battleFieldRevision, roomDetail?.battleCells, roomDetail?.battleStartedAt]);

  const { mapViewport } = useBattleViewState({
    mapWrapRef,
    battleMapLoad,
    hasGrid,
    orderPick,
    leftMenu,
    centerModal,
    battleEndedOverlay,
    battleAmmoModal,
    unloadCargoPickModal,
    battleRef,
    dismissOrderPicking,
  });

  const {
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
  } = useBattleDerivedState({
    cells,
    mapViewport,
    mapPad: MAP_PAD,
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
  });

  useEffect(() => {
    setBattleReportReplay(null);
  }, [roomDetail?.battleFieldRevision, roomDetail?.battleTurnIndex]);

  useEffect(() => {
    if (leftMenu !== 'report') setBattleReportReplay(null);
  }, [leftMenu]);

  useEffect(() => {
    if (battleEndedOverlay) setCenterModal(null);
  }, [battleEndedOverlay]);

  const missionMaxTurns = battleMapPayload?.conditions?.maxTurns?.trim() ?? '';

  const allyTasksBattle = battleMapPayload?.conditions?.allyTasks?.trim() ?? '';
  const axisTasksBattle = battleMapPayload?.conditions?.axisTasks?.trim() ?? '';

  const {
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
  } = useBattleUiActions({
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
  });

  const { battleReportRows, destroyedSummary } = useBattleReportRows({
    battleLog: roomDetail?.battleLog,
    cells,
    viewerBattleFaction,
    battleFogRevealedCellIds,
    hasGrid,
  });

  const { battleOrdersRef, battleTipRef, battleTipPos, battleOrdersPos, standardPanelStyle } = useBattleHudLayout({
    battleRef,
    battleUnitTip,
    battleUnitOrders,
    setBattleUnitOrders,
    leftMenu,
    centerModal,
    battleEndedOverlay,
    panelMarginLeft: PANEL_MARGIN_LEFT,
    gapBeforeBattle: GAP_BEFORE_BATTLE,
    minSidePanelWidth: MIN_SIDE_PANEL_WIDTH,
  });

  const dimBackdrop = centerModal !== null || battleEndedOverlay;

  const showOverlay = leftMenu !== null || centerModal !== null || battleEndedOverlay;

  const overlayPortal =
    showOverlay &&
    createPortal(
      <>
        <div
          className={`${styles.leftMenuBackdrop} ${dimBackdrop ? styles.leftMenuBackdropDim : ''}`}
          role="presentation"
          aria-hidden
          onMouseDown={backdropMouseDown}
        />
        <BattleSidePanel
          leftMenu={leftMenu}
          sideTitle={sideTitle}
          sideSubtitle={sideSubtitle}
          standardPanelStyle={standardPanelStyle ?? {}}
          apiRoomId={apiRoomId}
          battleStartedAt={roomDetail?.battleStartedAt}
          battleReportRows={battleReportRows}
          destroyedSummary={destroyedSummary}
          onHoverReportRow={setBattleReportReplay}
          onCloseLeftMenu={closeLeftMenu}
          myBattleFaction={myBattleFaction}
          allyTasksBattle={allyTasksBattle}
          axisTasksBattle={axisTasksBattle}
        />
        <BattleCenterModals
          centerModal={centerModal}
          readonlyBattle={readonlyBattle}
          pendingOrdersCount={pendingOrders.length}
          scenarioBattleOutcome={scenarioBattleOutcome as any}
          opponentVictory={opponentVictory}
          myBattleFaction={myBattleFaction}
          onCloseCenterModal={closeCenterModal}
          onConfirmSurrender={onConfirmSurrender}
          onConfirmNextTurn={onConfirmNextTurn}
          onExitAfterScenario={onExitAfterScenario}
          onExitAfterVictory={onExitAfterVictory}
        />
      </>,
      document.body,
    );

  const toolbarBusy = showResolvingOverlay || battleEndedOverlay;
  const battleControlsDisabled = toolbarBusy || readonlyBattle;

  const unitHudPortal =
    (battleUnitTip || battleUnitOrders) &&
    createPortal(
      <>
        {battleUnitTip && !battleUnitOrders && (
          <BattleUnitTipCard
            battleTipRef={battleTipRef}
            left={battleTipPos.left}
            top={battleTipPos.top}
            unit={battleUnitTip.unit}
            factionLabel={formatBattleUnitFactionLabel(battleUnitTip.unit)}
            playerLabel={formatBattleUnitPlayerLabel(
              battleUnitTip.unit,
              viewerBattleFaction,
              playerId,
              spectatorNames,
            )}
            cargoLine={formatBattleTechCargoLine(battleUnitTip.unit as unknown as Record<string, unknown>)}
          />
        )}
        {battleUnitOrders && (
          <BattleUnitOrdersPanel
            battleOrdersRef={battleOrdersRef}
            battleOrdersPos={battleOrdersPos}
            battleUnitOrders={battleUnitOrders}
            apiRoomId={apiRoomId}
            battleStarted={Boolean(roomDetail?.battleStartedAt)}
            myBattleFaction={myBattleFaction}
            cells={cells}
            battleFogRevealedCellIds={battleFogRevealedCellIds ? Array.from(battleFogRevealedCellIds) : null}
            readBattleUnitOrdersFromPayload={readBattleUnitOrdersFromPayload}
            inferOrderKey={inferOrderKey}
            isTruckUnitBattle={isTruckUnitBattle}
            getCarriedUnitsFromTruck={getCarriedUnitsFromTruck}
            resolveBattleCellOnField={resolveBattleCellOnField}
            canPlaceAmbushFromEnemyVision={canPlaceAmbushFromEnemyVision}
            getBattleOrderIconUrl={getBattleOrderIconUrl}
            findUnitCellByInstanceId={findUnitCellByInstanceId}
            readAmmoCountUi={readAmmoCountUi}
            computeBattleFireHighlights={computeBattleFireHighlights as any}
            setBattleUnitOrders={setBattleUnitOrders}
            setOrderPick={setOrderPick}
            setUnloadCargoPickModal={setUnloadCargoPickModal}
            setPendingOrders={setPendingOrders}
          />
        )}
      </>,
      document.body,
    );

  return (
    <>
      {overlayPortal}
      {unitHudPortal}
      <BattleActionModals
        battleAmmoModal={battleAmmoModal}
        ammoPickCount={ammoPickCount}
        onChangeAmmoPickCount={setAmmoPickCount}
        onCloseAmmoModal={onCloseAmmoModal}
        onConfirmAmmoTransfer={onConfirmAmmoTransfer}
        readAmmoCountUi={readAmmoCountUi}
        getAmmoCapacityMaxUi={getAmmoCapacityMaxUi}
        unloadCargoPickModal={unloadCargoPickModal}
        unloadingIconUrl={getBattleOrderIconUrl('unloading')}
        onCloseUnloadCargoModal={onCloseUnloadCargoModal}
        onSelectUnloadCargo={onSelectUnloadCargo}
      />
      <div ref={battleRef} className={styles.battle}>
        <BattleToolbar
          readonlyBattle={readonlyBattle}
          toolbarBusy={toolbarBusy}
          battleControlsDisabled={battleControlsDisabled}
          waitingNextTurn={waitingNextTurn}
          turn={turn}
          onLeaveOrSurrender={onLeaveOrSurrender}
          onShowReport={onShowReport}
          onShowTasks={onShowTasks}
          onNextTurn={onNextTurn}
        />

        <BattleMapStage
          battleMapLoad={battleMapLoad}
          hasGrid={hasGrid}
          mapWrapRef={mapWrapRef}
          battleHoverCellId={battleHoverCellId}
          orderPick={orderPick}
          battleAreaFireCellIds={battleAreaFireCellIds ? Array.from(battleAreaFireCellIds) : null}
          cells={cells}
          mapViewport={mapViewport}
          battleCellSize={battleCellSize}
          battlePointerCursor={battlePointerCursor}
          viewerBattleFaction={viewerBattleFaction}
          battleUnitOrders={battleUnitOrders}
          turn={turn}
          setBattleUnitTip={setBattleUnitTip}
          setBattleHoverCellId={setBattleHoverCellId}
          moveReachableCellIds={moveReachableCellIds ? Array.from(moveReachableCellIds) : null}
          defendPickHighlightCellIds={defendPickHighlightCellIds ? Array.from(defendPickHighlightCellIds) : null}
          defendRangeOrderPreview={defendRangeOrderPreview}
          battleReportSectorHover={battleReportSectorHover}
          battleDefendHover={battleDefendHover}
          battleFireTargetInstanceIds={battleFireTargetInstanceIds ? Array.from(battleFireTargetInstanceIds) : null}
          battlePendingShootPreview={battlePendingShootPreview}
          cellsHoverPath={cellsHoverPath}
          battleReportReplayHighlight={battleReportReplayHighlight}
          battleFogRevealedCellIds={battleFogRevealedCellIds ? Array.from(battleFogRevealedCellIds) : null}
          battleLogisticsPickInstanceIds={battleLogisticsPickInstanceIds ? Array.from(battleLogisticsPickInstanceIds) : null}
          battleUnloadCellIds={battleUnloadCellIds ? Array.from(battleUnloadCellIds) : null}
          battlePendingLogisticsPreview={battlePendingLogisticsPreview}
          orderPickRef={orderPickRef}
          apiRoomId={apiRoomId}
          dismissOrderPicking={dismissOrderPicking}
          setPendingOrders={setPendingOrders}
          factionsOpposedOnMap={factionsOpposedOnMap}
          readonlyBattle={readonlyBattle}
          myBattleFaction={myBattleFaction}
          unitIsMineOnMap={unitIsMineOnMap}
          readBattleUnitOrdersFromPayload={readBattleUnitOrdersFromPayload}
          setBattleUnitOrders={setBattleUnitOrders}
          defendRangePickCellIds={defendRangePickCellIds ? Array.from(defendRangePickCellIds) : null}
          defendFacingPickCellIds={defendFacingPickCellIds ? Array.from(defendFacingPickCellIds) : null}
          setOrderPick={setOrderPick}
          setBattleAmmoModal={setBattleAmmoModal}
          showResolvingOverlay={showResolvingOverlay}
        />
      </div>
    </>
  );
};

export default Battle;

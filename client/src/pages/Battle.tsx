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
import BattleAirSupportPanel from '../components/battle/BattleAirSupportPanel';
import { formatBattleAirDesantLine, type AccompanimentEscortCandidate } from '../game/battleAirSupport';
import BattleToolbar from '../components/battle/BattleToolbar';
import LobbyRoomChat, { type LobbyChatView } from '../components/lobby/LobbyRoomChat';
import { useAuth } from '../context/AuthContext';
import BattleUnitOrdersPanel from '../components/battle/BattleUnitOrdersPanel';
import BattleUnitTipCard from '../components/battle/BattleUnitTipCard';
import BattleDotTipCard from '../components/battle/BattleDotTipCard';
import type { DotHoverTip } from '../game/cellDot';
import { useBattleDerivedState } from './hooks/useBattleDerivedState';
import { useBattleHudLayout } from './hooks/useBattleHudLayout';
import { useBattleReportRows } from './hooks/useBattleReportRows';
import { useBattleUiActions } from './hooks/useBattleUiActions';
import { useBattleViewState } from './hooks/useBattleViewState';
import {
  buildInitialBattleCells,
  cellsFromEditorPayload,
  factionsOpposedOnMap,
  normalizeBattleCells,
  formatBattleTechCargoLine,
  formatBattleUnitFactionLabel,
  formatBattleUnitPlayerLabel,
  formatBattleUnitTeamLabel,
  inferOrderKey,
  readBattleUnitOrdersFromPayload,
  resolveBattleCellOnField,
  unitIsMineOnMap,
} from './battlePageUtils';
import { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { setLiveBattleEnvironment } from '../game/battleEnvironment';
import { parseBattlePlayer, useBattleSync } from '../game/battleSync';
import {
  collectAirSupportUnitsFromCells,
  airSupportUnitsForViewer,
  buildAirSupportReadinessMap,
  isAirUnitOnRecallableMission,
} from '../game/battleAirSupport';
import { hasFriendlyAviationChallengeOnField } from '../game/battleHqMorale';
import { findUnitCellByInstanceId } from '../game/battleMovePreview';
import { computeBattleFireHighlights, explainNoFireTargets } from '../game/battleFirePreview';
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
  postRoomChat,
  type BattleOrderPayload,
  type LobbyFaction,
  type LobbyRoomChatChannel,
  type LobbyRoomChatMessage,
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

type BattleDotTipState = {
  cell: Cell;
  clientX: number;
  clientY: number;
  tip: DotHoverTip;
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
  bombardmentStep?: 'target' | 'direction';
  bombardmentTargetCellId?: number;
  bombardmentFlightPathCellIds?: number[];
  patrolStep?: 'target' | 'radius';
  patrolTargetCellId?: number;
  patrolFlightPathCellIds?: number[];
  useFireAdjustment?: boolean;
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
    setRoomDetail,
  } = useBattleSync(roomIdForSync, playerId, solo, apiRoomId);

  const battleEndedOverlay = opponentVictory || scenarioBattleOutcome != null;
  const selfMember = roomDetail?.members?.find((m) => m.isYou);
  const readonlyBattle = spectatorFromState || spectatorFromQuery || (roomDetail?.battleStartedAt != null && !selfMember);
  const viewerBattleFaction: LobbyFaction = readonlyBattle ? 'none' : myBattleFaction;
  const viewerBattleTeam =
    !readonlyBattle && Number.isFinite(Number(selfMember?.team)) && Number(selfMember?.team) > 0
      ? Number(selfMember?.team)
      : null;
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
       
      }
    }
    navigate('/main');
  }, [apiRoomId, navigate, readonlyBattle]);

  const battleRef = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [battleMapLoad, setBattleMapLoad] = useState<'loading' | 'ready'>('loading');
  const [leftMenu, setLeftMenu] = useState<BattleLeftPanelId | null>(null);
  const [airSupportOpen, setAirSupportOpen] = useState(false);
  const [airSupportPanelHover, setAirSupportPanelHover] = useState<{ cellId: number; instanceId: number } | null>(
    null,
  );
  const [centerModal, setCenterModal] = useState<BattleCenterModalId | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSeen, setChatSeen] = useState({ all: 0, team: 0, rkka: 0, wehrmacht: 0 });
  const { user } = useAuth();

  useEffect(() => {
    setChatSeen({ all: 0, team: 0, rkka: 0, wehrmacht: 0 });
    setChatOpen(false);
    setChatError(null);
  }, [apiRoomId]);

  const chatMessages: LobbyRoomChatMessage[] = Array.isArray(roomDetail?.lobbyChat)
    ? roomDetail.lobbyChat
    : [];
  const unreadAll = chatMessages.filter((m) => (m.channel === 'team' ? false : m.id > chatSeen.all)).length;
  const unreadTeam = chatMessages.filter((m) => m.channel === 'team' && m.id > chatSeen.team).length;
  const unreadRkka = chatMessages.filter((m) => m.channel === 'team' && m.teamKey === 'rkka' && m.id > chatSeen.rkka).length;
  const unreadWehrmacht = chatMessages.filter(
    (m) => m.channel === 'team' && m.teamKey === 'wehrmacht' && m.id > chatSeen.wehrmacht,
  ).length;
  const chatUnreadCount = readonlyBattle
    ? unreadAll + unreadRkka + unreadWehrmacht
    : unreadAll + unreadTeam;

  const markChatSeen = useCallback((channel: LobbyChatView, lastId: number) => {
    if (!lastId) return;
    setChatSeen((prev) => (prev[channel] >= lastId ? prev : { ...prev, [channel]: lastId }));
  }, []);

  useEffect(() => {
    const env = roomDetail?.battleEnvironment
    setLiveBattleEnvironment(
      env
        ? {
            nightEnabled: Boolean(env.nightEnabled),
            nightFromFirst: env.nightFromFirst !== false,
            isNight: Boolean(env.isNight),
            fogActive: Boolean(env.fogActive),
            rainActive: Boolean(env.rainActive),
            strongWindActive: Boolean(env.strongWindActive),
            visionPenalty: Number(env.visionPenalty) || 0,
            accuracyShift: Number(env.accuracyShift) || 0,
            intensityPenalty: Number(env.intensityPenalty) || 0,
            labels: Array.isArray(env.labels) ? env.labels.map(String) : [],
          }
        : null,
    )
    return () => setLiveBattleEnvironment(null)
  }, [roomDetail?.battleEnvironment, roomDetail?.battleTurnIndex])

  const runSendChat = useCallback(
    async (text: string, channel: LobbyRoomChatChannel) => {
      if (readonlyBattle || apiRoomId == null || !Number.isFinite(apiRoomId)) return;
      setChatSending(true);
      setChatError(null);
      try {
        const data = await postRoomChat(apiRoomId, text, channel);
        setRoomDetail(data);
      } catch (e) {
        setChatError(e instanceof Error ? e.message : 'Не удалось отправить');
      } finally {
        setChatSending(false);
      }
    },
    [apiRoomId, setRoomDetail, readonlyBattle],
  );
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const hasGrid = cells.length > 0;
  const [battleUnitTip, setBattleUnitTip] = useState<BattleUnitTipState | null>(null);
  const [battleDotTip, setBattleDotTip] = useState<BattleDotTipState | null>(null);

  useEffect(() => {
    setBattleUnitTip(null);
    setBattleDotTip(null);
  }, [turn]);
 
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
    warehouseCellId?: number;
  } | null>(null);
  const [ammoPickCount, setAmmoPickCount] = useState(1);
  const [unloadCargoPickModal, setUnloadCargoPickModal] = useState<{
    truck: Record<string, unknown>;
    cell: Cell;
    orderLabel: string;
    carried: Record<string, unknown>[];
  } | null>(null);
  const [accompanimentPickModal, setAccompanimentPickModal] = useState<{
    escorter: Record<string, unknown>;
    cell: Cell;
    orderLabel: string;
    candidates: AccompanimentEscortCandidate[];
  } | null>(null);
  const [battleReportReplay, setBattleReportReplay] = useState<BattleLogReplayState | null>(null);
  const [reportAcknowledgedTurn, setReportAcknowledgedTurn] = useState<number | null>(null);

  const dismissOrderPicking = useCallback(() => {
    orderPickRef.current = null;
    setOrderPick(null);
    setBattleUnitOrders(null);
    setBattleHoverCellId(null);
    setBattleDotTip(null);
    setBattleAmmoModal(null);
    setUnloadCargoPickModal(null);
    setAccompanimentPickModal(null);
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
          setCells(normalizeBattleCells(detail.battleCells as Cell[]));
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
    setCells(normalizeBattleCells(serverCells as Cell[]));
  }, [roomDetail?.battleFieldRevision, roomDetail?.battleCells, roomDetail?.battleStartedAt]);

  const { mapViewport } = useBattleViewState({
    mapWrapRef,
    battleMapLoad,
    hasGrid,
    orderPick,
    leftMenu,
    airSupportOpen,
    centerModal,
    battleEndedOverlay,
    battleAmmoModal,
    unloadCargoPickModal,
    accompanimentPickModal,
    battleRef,
    dismissOrderPicking,
  });

  const {
    battleCellSize,
    battleFogRevealedCellIds,
    moveReachableCellIds,
    cutWireTargetCellIds,
    enterDotTargetCellIds,
    exitDotTargetCellIds,
    loadingSupTargetCellIds,
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
    battleDotSectorCellIds,
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
    airSupportHoverCellId: airSupportPanelHover?.cellId ?? null,
    airSupportHoverUnitInstanceId: airSupportPanelHover?.instanceId ?? null,
    airSupportOpen,
    battleReconByFaction: roomDetail?.battleReconByFaction ?? null,
  });

  const handleHoverReportRow = useCallback(
    (payload: BattleLogReplayState | { text?: string; meta?: unknown; phase?: number } | null) => {
      if (!payload) {
        setBattleReportReplay(null);
        return;
      }
      if (typeof payload === 'object' && 'text' in payload && !('kind' in payload)) {
        setBattleReportReplay(battleLogEntryReplayWithFallback(payload, cells));
        return;
      }
      setBattleReportReplay(payload as BattleLogReplayState);
    },
    [cells],
  );

  const airSupportUnitsRaw = useMemo(() => collectAirSupportUnitsFromCells(cells), [cells]);
  const airSupportUnits = useMemo(
    () => airSupportUnitsForViewer(airSupportUnitsRaw, viewerBattleFaction),
    [airSupportUnitsRaw, viewerBattleFaction],
  );
  const showAirSupportButton = airSupportUnits.length > 0;
  const airSupportDisabled = !hasFriendlyAviationChallengeOnField(cells, viewerBattleFaction);

  const airSupportReadiness = useMemo(() => buildAirSupportReadinessMap(cells, turn), [cells, turn]);

  const recallAirUnit = useCallback(
    (instanceId: number) => {
      setPendingOrders((prev) => {
        const next = prev.filter((x) => x.unitInstanceId !== instanceId);
        next.push({ unitInstanceId: instanceId, orderKey: 'airRecall' });
        return next;
      });
    },
    [setPendingOrders],
  );

  const toggleAirSupport = useCallback(() => {
    if (airSupportDisabled) return;
    setAirSupportOpen((prev) => {
      const next = !prev;
      if (next) setLeftMenu(null);
      return next;
    });
  }, [setLeftMenu, airSupportDisabled]);

  useEffect(() => {
    if (!showAirSupportButton) setAirSupportOpen(false);
  }, [showAirSupportButton]);

  useEffect(() => {
    if (!airSupportOpen) setAirSupportPanelHover(null);
  }, [airSupportOpen]);

  useEffect(() => {
    setBattleReportReplay(null);
  }, [roomDetail?.battleFieldRevision, roomDetail?.battleTurnIndex]);

  useEffect(() => {
    if (leftMenu !== 'report') setBattleReportReplay(null);
  }, [leftMenu]);

  useEffect(() => {
    if (battleEndedOverlay) setCenterModal(null);
  }, [battleEndedOverlay]);

  useEffect(() => {
    if (battleEndedOverlay) {
      setAirSupportOpen(false);
      setAirSupportPanelHover(null);
    }
  }, [battleEndedOverlay]);

  const missionMaxTurns = battleMapPayload?.conditions?.maxTurns?.trim() ?? '';

  const allyTasksBattle = battleMapPayload?.conditions?.allyTasks?.trim() ?? '';
  const axisTasksBattle = battleMapPayload?.conditions?.axisTasks?.trim() ?? '';

  const {
    closeLeftMenu,
    closeCenterModal,
    sideTitle,
    sideSubtitle,
    backdropMouseDown: hookBackdropMouseDown,
    onConfirmSurrender,
    onConfirmNextTurn,
    onExitAfterScenario,
    onExitAfterVictory,
    onLeaveOrSurrender: hookLeaveOrSurrender,
    onShowReport: hookShowReport,
    onShowTasks: hookShowTasks,
    onNextTurn: hookNextTurn,
    onCloseAmmoModal,
    onConfirmAmmoTransfer,
    onCloseUnloadCargoModal,
    onSelectUnloadCargo,
    onCloseAccompanimentModal,
    onSelectAccompanimentTarget,
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
    accompanimentPickModal,
    setAccompanimentPickModal,
    cells,
  });

  const backdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setAirSupportOpen(false);
      hookBackdropMouseDown(e);
    },
    [hookBackdropMouseDown],
  );

  const { battleReportRows, destroyedSummary, battleReportLatestTurn, battleReportActionCount } =
    useBattleReportRows({
      battleLog: roomDetail?.battleLog,
      battleTurnIndex: turn,
      cells,
      viewerBattleFaction,
      battleFogRevealedCellIds,
      hasGrid,
    });

  const reportBadgeCount =
    leftMenu === 'report' ||
    battleReportLatestTurn == null ||
    battleReportActionCount <= 0 ||
    (reportAcknowledgedTurn != null && battleReportLatestTurn <= reportAcknowledgedTurn)
      ? 0
      : battleReportActionCount;

  const onShowReport = useCallback(() => {
    setAirSupportOpen(false);
    if (leftMenu !== 'report' && battleReportLatestTurn != null) {
      setReportAcknowledgedTurn(battleReportLatestTurn);
    }
    hookShowReport();
  }, [hookShowReport, leftMenu, battleReportLatestTurn]);

  const onShowTasks = useCallback(() => {
    setAirSupportOpen(false);
    hookShowTasks();
  }, [hookShowTasks]);

  const onNextTurn = useCallback(() => {
    setAirSupportOpen(false);
    hookNextTurn();
  }, [hookNextTurn]);

  const onLeaveOrSurrender = useCallback(() => {
    setAirSupportOpen(false);
    hookLeaveOrSurrender();
  }, [hookLeaveOrSurrender]);

  const { battleOrdersRef, battleTipRef, battleTipPos, battleOrdersPos, standardPanelStyle } = useBattleHudLayout({
    battleRef,
    battleUnitTip,
    battleDotTip,
    battleUnitOrders,
    setBattleUnitOrders,
    leftMenu,
    airSupportOpen,
    centerModal,
    battleEndedOverlay,
    panelMarginLeft: PANEL_MARGIN_LEFT,
    gapBeforeBattle: GAP_BEFORE_BATTLE,
    minSidePanelWidth: MIN_SIDE_PANEL_WIDTH,
  });

  const battleTipPendingOrderKey = useMemo(() => {
    if (!battleUnitTip) return null;
    const iid = Number(battleUnitTip.unit.instanceId);
    if (!Number.isFinite(iid)) return null;
    const p = pendingOrders.find((x) => x.unitInstanceId === iid);
    return p?.orderKey ?? null;
  }, [battleUnitTip, pendingOrders]);

  const dimBackdrop = centerModal !== null || battleEndedOverlay;

  const showOverlay = leftMenu !== null || centerModal !== null || battleEndedOverlay || airSupportOpen;

  const overlayPortal =
    showOverlay &&
    createPortal(
      <>
        <div
          className={`${styles.leftMenuBackdrop} ${dimBackdrop ? styles.leftMenuBackdropDim : ''} ${orderPick ? styles.leftMenuBackdropPassThrough : ''}`}
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
          onHoverReportRow={handleHoverReportRow}
          onCloseLeftMenu={closeLeftMenu}
          myBattleFaction={myBattleFaction}
          allyTasksBattle={allyTasksBattle}
          axisTasksBattle={axisTasksBattle}
          environmentLabels={roomDetail?.battleEnvironment?.labels ?? []}
        />
        <BattleAirSupportPanel
          open={airSupportOpen}
          onClose={() => setAirSupportOpen(false)}
          units={airSupportUnits}
          cells={cells}
          standardPanelStyle={standardPanelStyle ?? {}}
          onHoverAirSupportRow={setAirSupportPanelHover}
          readonlyBattle={readonlyBattle}
          viewerBattleFaction={viewerBattleFaction}
          unitIsMineOnMap={unitIsMineOnMap}
          airSupportReadiness={airSupportReadiness}
          onRecallAir={recallAirUnit}
          ordersDeps={{
            apiRoomId,
            battleStarted: Boolean(roomDetail?.battleStartedAt),
            myBattleFaction,
            cells,
            battleFogRevealedCellIds: battleFogRevealedCellIds ? Array.from(battleFogRevealedCellIds) : null,
            readBattleUnitOrdersFromPayload,
            inferOrderKey,
            isTruckUnitBattle,
            getCarriedUnitsFromTruck,
            resolveBattleCellOnField,
            canPlaceAmbushFromEnemyVision,
            getBattleOrderIconUrl,
            findUnitCellByInstanceId,
            readAmmoCountUi,
            computeBattleFireHighlights: computeBattleFireHighlights as any,
            explainNoFireTargets: explainNoFireTargets as any,
            setBattleUnitOrders,
            setOrderPick,
            setUnloadCargoPickModal,
            setPendingOrders,
            pendingOrders,
            setAccompanimentPickModal,
          }}
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
    (battleUnitTip || battleDotTip || battleUnitOrders) &&
    createPortal(
      <>
        {battleUnitTip && !battleUnitOrders && (
          <BattleUnitTipCard
            battleTipRef={battleTipRef}
            left={battleTipPos.left}
            top={battleTipPos.top}
            unit={battleUnitTip.unit}
            unitCell={battleUnitTip.cell}
            cells={cells}
            pendingOrderKey={battleTipPendingOrderKey}
            factionLabel={formatBattleUnitFactionLabel(battleUnitTip.unit)}
            teamLabel={formatBattleUnitTeamLabel(battleUnitTip.unit)}
            playerLabel={formatBattleUnitPlayerLabel(
              battleUnitTip.unit,
              viewerBattleFaction,
              playerId,
              spectatorNames,
            )}
            cargoLine={formatBattleTechCargoLine(battleUnitTip.unit as unknown as Record<string, unknown>)}
            desantLine={formatBattleAirDesantLine(battleUnitTip.unit as unknown as Record<string, unknown>)}
          />
        )}
        {battleDotTip && !battleUnitTip && !battleUnitOrders && (
          <BattleDotTipCard
            battleTipRef={battleTipRef}
            left={battleTipPos.left}
            top={battleTipPos.top}
            tip={battleDotTip.tip}
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
            explainNoFireTargets={explainNoFireTargets as any}
            setBattleUnitOrders={setBattleUnitOrders}
            setOrderPick={setOrderPick}
            setUnloadCargoPickModal={setUnloadCargoPickModal}
            setPendingOrders={setPendingOrders}
            pendingOrders={pendingOrders}
            setAccompanimentPickModal={setAccompanimentPickModal}
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
        accompanimentPickModal={
          accompanimentPickModal
            ? {
                orderLabel: accompanimentPickModal.orderLabel,
                candidates: accompanimentPickModal.candidates,
              }
            : null
        }
        accompanimentIconUrl={getBattleOrderIconUrl('accompaniment')}
        onCloseAccompanimentModal={onCloseAccompanimentModal}
        onSelectAccompanimentTarget={onSelectAccompanimentTarget}
      />
      <div ref={battleRef} className={styles.battle}>
        <BattleToolbar
          readonlyBattle={readonlyBattle}
          toolbarBusy={toolbarBusy}
          battleControlsDisabled={battleControlsDisabled}
          waitingNextTurn={waitingNextTurn}
          turn={turn}
          environmentLabels={roomDetail?.battleEnvironment?.labels ?? []}
          showAirSupportButton={showAirSupportButton}
          airSupportDisabled={airSupportDisabled}
          onToggleAirSupport={toggleAirSupport}
          onLeaveOrSurrender={onLeaveOrSurrender}
          onShowReport={onShowReport}
          onShowTasks={onShowTasks}
          onOpenChat={() => setChatOpen(true)}
          onNextTurn={onNextTurn}
          reportBadgeCount={reportBadgeCount}
          chatUnreadCount={chatUnreadCount}
        />

        <BattleMapStage
          battleMapLoad={battleMapLoad}
          hasGrid={hasGrid}
          mapWrapRef={mapWrapRef}
          battleHoverCellId={battleHoverCellId}
          orderPick={orderPick}
          battleAreaFireCellIds={battleAreaFireCellIds ? Array.from(battleAreaFireCellIds) : null}
          battleDotSectorCellIds={battleDotSectorCellIds}
          enterDotGlowCellIds={enterDotTargetCellIds ? Array.from(enterDotTargetCellIds) : null}
          cells={cells}
          mapViewport={mapViewport}
          battleCellSize={battleCellSize}
          battlePointerCursor={battlePointerCursor}
          viewerBattleFaction={viewerBattleFaction}
          viewerBattleTeam={viewerBattleTeam}
          battleUnitOrders={battleUnitOrders}
          turn={turn}
          setBattleUnitTip={setBattleUnitTip}
          setBattleDotTip={setBattleDotTip}
          setBattleHoverCellId={setBattleHoverCellId}
          moveReachableCellIds={
            cutWireTargetCellIds
              ? Array.from(cutWireTargetCellIds)
              : exitDotTargetCellIds
                ? Array.from(exitDotTargetCellIds)
                : loadingSupTargetCellIds
                  ? Array.from(loadingSupTargetCellIds)
                  : moveReachableCellIds
                    ? Array.from(moveReachableCellIds)
                    : null
          }
          defendPickHighlightCellIds={defendPickHighlightCellIds ? Array.from(defendPickHighlightCellIds) : null}
          defendRangeOrderPreview={defendRangeOrderPreview}
          battleReportSectorHover={battleReportSectorHover}
          battleDefendHover={battleDefendHover}
          battleFireTargetInstanceIds={battleFireTargetInstanceIds ? Array.from(battleFireTargetInstanceIds) : null}
          battlePendingShootPreview={battlePendingShootPreview}
          cellsHoverPath={cellsHoverPath}
          cellsHoverPathIsAirMission={cellsHoverPathIsAirMission}
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
          battleAirDepartureHoverCellId={airSupportPanelHover?.cellId ?? null}
          battleAirDeparturePickCellId={battleAirDeparturePickCellId}
          battleAirMissionPreview={battleAirMissionPreview}
          battlePatrolVisibilityCellIds={
            battlePatrolVisibilityCellIds ? Array.from(battlePatrolVisibilityCellIds) : null
          }
          battlePatrolCenterCellId={battlePatrolCenterCellId}
          patrolRangePickCellIds={
            patrolRangePickCellIds ? Array.from(patrolRangePickCellIds) : null
          }
          battleBombardmentAreaCellIds={
            battleBombardmentAreaCellIds ? Array.from(battleBombardmentAreaCellIds) : null
          }
          bombardmentDirectionPickCellIds={
            bombardmentDirectionPickCellIds ? Array.from(bombardmentDirectionPickCellIds) : null
          }
          bombardmentApproachCellId={bombardmentApproachCellId}
          battleAirInterceptionTargets={battleAirInterceptionTargets}
          battleAirUnitsInFlight={battleAirUnitsInFlight}
          fireAdjustmentToggleAvailable={fireAdjustmentToggleAvailable}
        />
      </div>
      <LobbyRoomChat
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        selfLabel={selfMember?.label || ''}
        selfUserId={user?.id}
        selfFaction={selfMember?.faction ?? myBattleFaction}
        sending={chatSending}
        error={chatError}
        onSend={runSendChat}
        onViewChannel={markChatSeen}
        unreadAll={unreadAll}
        unreadTeam={unreadTeam}
        unreadRkka={unreadRkka}
        unreadWehrmacht={unreadWehrmacht}
        readOnly={readonlyBattle}
        spectator={readonlyBattle}
      />
    </>
  );
};

export default Battle;

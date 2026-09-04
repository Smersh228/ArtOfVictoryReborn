import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import sovBattleTopicUrl from '../img/backgrondImage/SOVTopic.png';
import werBattleTopicUrl from '../img/backgrondImage/WERTopic1.png';
import menuBackgroundUrl from '../img/backgrondImage/Menu.jpg';
import { menuThemeImage } from '../utils/userSettings';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import styles from './styleModules/battle.module.css';
import BattleMapStage from '../components/battle/BattleMapStage';
import BattleCenterModals from '../components/battle/BattleCenterModals';
import BattleHqRewritePanel from '../components/battle/BattleHqRewritePanel';
import BattleDeployPanel, { type BattleDeployPick } from '../components/battle/BattleDeployPanel';
import BattleActionModals from '../components/battle/BattleActionModals';
import BattleSidePanel from '../components/battle/BattleSidePanel';
import BattleAirSupportPanel from '../components/battle/BattleAirSupportPanel';
import { formatBattleAirDesantLine, type AccompanimentEscortCandidate } from '../game/battleAirSupport';
import BattleToolbar from '../components/battle/BattleToolbar';
import LobbyRoomChat, { type LobbyChatView } from '../components/lobby/LobbyRoomChat';
import { useAuth } from '../context/AuthContext';
import { useSiteChat } from './hooks/useSiteChat';
import BattleUnitOrdersPanel from '../components/battle/BattleUnitOrdersPanel';
import BattleUnitTipCard from '../components/battle/BattleUnitTipCard';
import BattleDotTipCard from '../components/battle/BattleDotTipCard';
import type { BattleHoverTipView } from '../components/battle/battleHoverTip';
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
  postBattleDeployPlace,
  postBattleDeployReady,
  postBattleDeployRemove,
  postRoomChat,
  type BattleOrderPayload,
  type LobbyFaction,
  type LobbyRoomChatChannel,
  type LobbyRoomChatMessage,
} from '../api/rooms';
import type { EditorMapPayloadLobby } from '../api/maps';
import { fetchEditorCatalog } from '../api/editorCatalog';
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
  tip: BattleHoverTipView;
  pinned?: boolean;
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
  fireModeStep?: 'mode';
  useReactiveFire?: boolean;
  fireMoveStep?: 'dest' | 'target';
  fireMoveTargetUnitId?: number;
  fireMoveDestCellId?: number;
  reconRangeStep?: 'radius';
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
    confirmHqRewrite,
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
  const hqRewrite = roomDetail?.battleHqRewrite ?? null;
  const battleDeploy = roomDetail?.battleDeploy?.active ? roomDetail.battleDeploy : null;
  const deployActive = Boolean(battleDeploy);
  const waitingHqRewrite = Boolean(hqRewrite?.pending && !hqRewrite.youCanRewrite);
  const showResolvingOverlay =
    (waitingNextTurn || spectatorResolving || waitingHqRewrite) &&
    !battleEndedOverlay &&
    !hqRewrite?.youCanRewrite;
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
      document.body.style.backgroundImage = `url(${menuThemeImage()})`;
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
  const [hqRevealedHoverId, setHqRevealedHoverId] = useState<number | null>(null);
  const [airSupportOpen, setAirSupportOpen] = useState(false);
  const [airSupportPanelHover, setAirSupportPanelHover] = useState<{ cellId: number; instanceId: number } | null>(
    null,
  );
  const [centerModal, setCenterModal] = useState<BattleCenterModalId | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSeen, setChatSeen] = useState({ all: 0, team: 0, rkka: 0, wehrmacht: 0, global: 0 });
  const { user } = useAuth();
  const siteChat = useSiteChat();

  useEffect(() => {
    setChatSeen({ all: 0, team: 0, rkka: 0, wehrmacht: 0, global: 0 });
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
  const unreadGlobal = siteChat.messages.filter((m) => m.id > chatSeen.global).length;
  const chatUnreadCount = readonlyBattle
    ? unreadAll + unreadRkka + unreadWehrmacht + unreadGlobal
    : unreadAll + unreadTeam + unreadGlobal;

  const markChatSeen = useCallback((channel: LobbyChatView, lastId: number) => {
    if (!lastId) return;
    setChatSeen((prev) => (prev[channel] >= lastId ? prev : { ...prev, [channel]: lastId }));
  }, []);

  const envSnap = roomDetail?.battleEnvironment
    ? {
        nightEnabled: Boolean(roomDetail.battleEnvironment.nightEnabled),
        nightFromFirst: roomDetail.battleEnvironment.nightFromFirst !== false,
        isNight: Boolean(roomDetail.battleEnvironment.isNight),
        fogActive: Boolean(roomDetail.battleEnvironment.fogActive),
        rainActive: Boolean(roomDetail.battleEnvironment.rainActive),
        strongWindActive: Boolean(roomDetail.battleEnvironment.strongWindActive),
        visionPenalty: Number(roomDetail.battleEnvironment.visionPenalty) || 0,
        accuracyShift: Number(roomDetail.battleEnvironment.accuracyShift) || 0,
        intensityPenalty: Number(roomDetail.battleEnvironment.intensityPenalty) || 0,
        labels: Array.isArray(roomDetail.battleEnvironment.labels)
          ? roomDetail.battleEnvironment.labels.map(String)
          : [],
      }
    : null
  setLiveBattleEnvironment(envSnap)
  useEffect(() => () => setLiveBattleEnvironment(null), [])

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

  const runSendGlobal = useCallback(async (text: string) => {
    setChatSending(true);
    setChatError(null);
    try {
      await siteChat.send(text);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setChatSending(false);
    }
  }, [siteChat.send]);
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
  const [deployPick, setDeployPick] = useState<BattleDeployPick | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployCatalog, setDeployCatalog] = useState<{
    units: Array<{ id: number; name: string; imagePath: string }>;
    buildings: Array<{ dbId: number; name: string; imagePath: string }>;
  }>({ units: [], buildings: [] });
  const [battleMapPayload, setBattleMapPayload] = useState<EditorMapPayloadLobby | null>(null);
  const lastBattleFieldRevisionRef = useRef<number>(0);
  const [pendingOrders, setPendingOrders] = useState<BattleOrderPayload[]>([]);
  const hqRewriteLoadedSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hqRewrite?.youCanRewrite || !Array.isArray(hqRewrite.yourDraftOrders)) return;
    const seq = hqRewrite.seq ?? 0;
    if (hqRewriteLoadedSeqRef.current === seq) return;
    hqRewriteLoadedSeqRef.current = seq;
    setPendingOrders(hqRewrite.yourDraftOrders);
  }, [hqRewrite?.youCanRewrite, hqRewrite?.seq, hqRewrite?.yourDraftOrders]);

  useEffect(() => {
    if (!hqRewrite?.youCanRewrite) setHqRevealedHoverId(null);
  }, [hqRewrite?.youCanRewrite]);
  const [orderPick, setOrderPick] = useState<OrderPickState | null>(null);
  const orderPickRef = useRef<OrderPickState | null>(null);
  orderPickRef.current = orderPick;

  useEffect(() => {
    if (!deployActive) {
      setDeployPick(null);
      setDeployError(null);
      return;
    }
    let cancelled = false;
    fetchEditorCatalog()
      .then((c) => {
        if (cancelled) return;
        setDeployCatalog({
          units: (c.units || []).map((u) => ({ id: u.id, name: u.name, imagePath: u.imagePath })),
          buildings: (c.buildings || []).map((b) => ({
            dbId: b.dbId,
            name: b.name,
            imagePath: b.imagePath,
          })),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deployActive]);

  useEffect(() => {
    if (!deployActive) return;
    setAirSupportOpen(false);
    setBattleUnitOrders(null);
    setOrderPick(null);
  }, [deployActive]);

  useEffect(() => {
    if (!deployPick) return;
    if (deployPick.kind === 'unit') {
      if (!battleDeploy?.remaining?.unitIds.includes(deployPick.catalogUnitId)) setDeployPick(null);
      return;
    }
    if (!battleDeploy?.remaining?.structureIds.includes(deployPick.structureId)) setDeployPick(null);
  }, [battleDeploy?.remaining, deployPick]);
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
  const [miningPickModal, setMiningPickModal] = useState<{
    unitInstanceId: number;
    targetCellId: number;
    orderLabel: string;
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
    setMiningPickModal(null);
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
    sapperHexTargetCellIds,
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
    battlePendingOrderHover,
    battlePendingLogisticsPreview,
    battleDefendHover,
    defendRangeOrderPreview,
    battleAirDeparturePickCellId,
    battleAirMissionPreview,
    battlePatrolVisibilityCellIds,
    battlePatrolCenterCellId,
    patrolRangePickCellIds,
    reconRangePickCellIds,
    battleReconHoverAreaCellIds,
    battleReconHoverCenterCellId,
    battleReconHoverUnitInstanceId,
    battleReconHoverOrderKey,
    battleBombardmentAreaCellIds,
    bombardmentDirectionPickCellIds,
    bombardmentApproachCellId,
    cellsHoverPathIsAirMission,
    battleAirInterceptionTargets,
    battleAirUnitsInFlight,
    fireAdjustmentToggleAvailable,
    hiddenBattleInstanceIds,
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
    visionPenalty: Number(roomDetail?.battleEnvironment?.visionPenalty) || 0,
    extraRevealedCellIds: deployActive ? battleDeploy?.zoneCellIds ?? [] : null,
    hqRevealedOrders: hqRewrite?.youCanRewrite ? hqRewrite.revealedOrders ?? [] : null,
    hqListHoverInstanceId: hqRewrite?.youCanRewrite ? hqRevealedHoverId : null,
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

  const deployMembersReady = useMemo(
    () =>
      (battleDeploy?.membersReady ?? []).map((row) => ({
        ...row,
        label: roomDetail?.members?.find((m) => m.key === row.key)?.label || 'Игрок',
      })),
    [battleDeploy?.membersReady, roomDetail?.members],
  );

  const battleDeployZones = useMemo(() => {
    if (!deployActive || viewerBattleTeam == null) return null;
    return (battleDeploy?.zoneCellIds ?? []).map((cellId) => ({ cellId, team: viewerBattleTeam }));
  }, [deployActive, viewerBattleTeam, battleDeploy?.zoneCellIds]);

  const runDeployAction = useCallback(
    async (info: { cell: Cell; unit: { [key: string]: any } | null }) => {
      if (!deployActive || readonlyBattle || apiRoomId == null || !Number.isFinite(apiRoomId)) return;
      if (deployBusy) return;
      if (battleDeploy?.youReady) {
        setDeployError('Снимите готовность, чтобы менять расстановку');
        return;
      }
      const zone = new Set((battleDeploy?.zoneCellIds ?? []).map((id) => Number(id)));
      const yourPlaced = battleDeploy?.yourPlaced ?? [];
      setDeployError(null);
      try {
        setDeployBusy(true);
        if (info.unit && !deployPick) {
          const iid = Number(info.unit.instanceId);
          const mine = yourPlaced.find((p) => p.kind === 'unit' && Number(p.instanceId) === iid);
          if (!mine || !Number.isFinite(iid)) return;
          const data = await postBattleDeployRemove(apiRoomId, { kind: 'unit', instanceId: iid });
          setRoomDetail(data);
          return;
        }
        if (!zone.has(Number(info.cell.id))) {
          setDeployError('Ставить можно только в своей зоне');
          return;
        }
        if (deployPick?.kind === 'unit') {
          const data = await postBattleDeployPlace(apiRoomId, {
            kind: 'unit',
            catalogUnitId: deployPick.catalogUnitId,
            cellId: Number(info.cell.id),
          });
          setRoomDetail(data);
          return;
        }
        if (deployPick?.kind === 'structure') {
          const data = await postBattleDeployPlace(apiRoomId, {
            kind: 'structure',
            structureId: deployPick.structureId,
            cellId: Number(info.cell.id),
          });
          setRoomDetail(data);
          return;
        }
        const rec = [...yourPlaced]
          .reverse()
          .find((p) => p.kind === 'structure' && Number(p.cellId) === Number(info.cell.id) && p.structureId);
        if (rec?.structureId) {
          const data = await postBattleDeployRemove(apiRoomId, {
            kind: 'structure',
            cellId: Number(info.cell.id),
            structureId: rec.structureId,
          });
          setRoomDetail(data);
        }
      } catch (e) {
        setDeployError(e instanceof Error ? e.message : 'Не удалось изменить расстановку');
      } finally {
        setDeployBusy(false);
      }
    },
    [deployActive, readonlyBattle, apiRoomId, deployBusy, battleDeploy, deployPick, setRoomDetail],
  );

  const onDeployReady = useCallback(
    async (ready: boolean) => {
      if (apiRoomId == null || !Number.isFinite(apiRoomId) || deployBusy) return;
      setDeployError(null);
      setDeployBusy(true);
      try {
        const data = await postBattleDeployReady(apiRoomId, ready);
        setRoomDetail(data);
      } catch (e) {
        setDeployError(e instanceof Error ? e.message : 'Не удалось сменить готовность');
      } finally {
        setDeployBusy(false);
      }
    },
    [apiRoomId, deployBusy, setRoomDetail],
  );

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
    onKeepHqOrders,
    onConfirmHqRewrite,
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
    onCloseMiningModal,
    onSelectMineKind,
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
    confirmHqRewrite,
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
    miningPickModal,
    setMiningPickModal,
    cells,
  });

  const backdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setAirSupportOpen(false);
      hookBackdropMouseDown(e);
    },
    [hookBackdropMouseDown],
  );

  const { battleReportRows, weatherRows, destroyedSummary, battleReportLatestTurn, battleReportActionCount } =
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
  const hqRewriteActive = Boolean(hqRewrite?.youCanRewrite);

  const showOverlay =
    leftMenu !== null || centerModal !== null || battleEndedOverlay || airSupportOpen || hqRewriteActive;
  const mapHoverPassThrough = Boolean(orderPick) || hqRewriteActive || leftMenu === 'report';

  const overlayPortal =
    showOverlay &&
    createPortal(
      <>
        <div
          className={`${styles.leftMenuBackdrop} ${dimBackdrop ? styles.leftMenuBackdropDim : ''} ${mapHoverPassThrough ? styles.leftMenuBackdropPassThrough : ''}`}
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
          weatherRows={weatherRows}
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
            setMiningPickModal,
          }}
        />
        <BattleCenterModals
          centerModal={centerModal}
          readonlyBattle={readonlyBattle}
          pendingOrdersCount={pendingOrders.length}
          scenarioBattleOutcome={scenarioBattleOutcome as any}
          opponentVictory={opponentVictory}
          myBattleFaction={myBattleFaction}
          hqRewriteMode={Boolean(hqRewrite?.youCanRewrite)}
          rewriteMax={hqRewrite?.rewriteMax ?? 0}
          onCloseCenterModal={closeCenterModal}
          onConfirmSurrender={onConfirmSurrender}
          onConfirmNextTurn={hqRewrite?.youCanRewrite ? onConfirmHqRewrite : onConfirmNextTurn}
          onExitAfterScenario={onExitAfterScenario}
          onExitAfterVictory={onExitAfterVictory}
        />
        {hqRewrite?.youCanRewrite ? (
          <BattleHqRewritePanel
            rewriteMax={hqRewrite.rewriteMax ?? 0}
            revealedOrders={hqRewrite.revealedOrders ?? []}
            hqRoll={hqRewrite.hqRoll}
            onKeepOrders={onKeepHqOrders}
            onHoverRevealedUnit={setHqRevealedHoverId}
          />
        ) : null}
      </>,
      document.body,
    );

  const toolbarBusy = showResolvingOverlay || battleEndedOverlay;
  const battleControlsDisabled = toolbarBusy || readonlyBattle || deployActive;

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
            setMiningPickModal={setMiningPickModal}
          />
        )}
      </>,
      document.body,
    );

  const deployPortal =
    deployActive &&
    createPortal(
      <BattleDeployPanel
        youReady={Boolean(battleDeploy?.youReady)}
        readonlyBattle={readonlyBattle}
        remaining={battleDeploy?.remaining ?? { unitIds: [], structureIds: [] }}
        membersReady={deployMembersReady}
        selected={deployPick}
        onSelect={setDeployPick}
        onReady={onDeployReady}
        busy={deployBusy}
        error={deployError}
        catalogUnits={deployCatalog.units}
        catalogBuildings={deployCatalog.buildings}
      />,
      document.body,
    );

  return (
    <>
      {overlayPortal}
      {deployPortal}
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
        miningPickModal={miningPickModal}
        miningIconUrl={getBattleOrderIconUrl('mining')}
        onCloseMiningModal={onCloseMiningModal}
        onSelectMineKind={onSelectMineKind}
      />
      <div ref={battleRef} className={styles.battle}>
        <BattleToolbar
          readonlyBattle={readonlyBattle}
          toolbarBusy={toolbarBusy}
          battleControlsDisabled={battleControlsDisabled}
          waitingNextTurn={waitingNextTurn}
          turn={turn}
          environmentLabels={roomDetail?.battleEnvironment?.labels ?? []}
          showAirSupportButton={showAirSupportButton && !deployActive}
          airSupportDisabled={airSupportDisabled || deployActive}
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
          loadingSupGlowCellIds={loadingSupTargetCellIds ? Array.from(loadingSupTargetCellIds) : null}
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
            sapperHexTargetCellIds
              ? Array.from(sapperHexTargetCellIds)
              : exitDotTargetCellIds
                ? Array.from(exitDotTargetCellIds)
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
          battlePendingOrderHover={battlePendingOrderHover}
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
          resolvingTitle={
            waitingHqRewrite ? 'Противник связывается со штабом' : undefined
          }
          resolvingHint={waitingHqRewrite ? 'Дождитесь смены приказов' : undefined}
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
          reconRangePickCellIds={
            reconRangePickCellIds ? Array.from(reconRangePickCellIds) : null
          }
          battleReconHoverAreaCellIds={
            battleReconHoverAreaCellIds ? Array.from(battleReconHoverAreaCellIds) : null
          }
          battleReconHoverCenterCellId={battleReconHoverCenterCellId}
          battleReconHoverUnitInstanceId={battleReconHoverUnitInstanceId}
          battleReconHoverOrderKey={battleReconHoverOrderKey}
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
          hiddenBattleInstanceIds={hiddenBattleInstanceIds}
          battleDeployActive={deployActive}
          battleDeployZones={battleDeployZones}
          battleDeployBrushTeam={viewerBattleTeam}
          onBattleDeployAction={runDeployAction}
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
        onSendGlobal={runSendGlobal}
        onViewChannel={markChatSeen}
        unreadAll={unreadAll}
        unreadTeam={unreadTeam}
        unreadRkka={unreadRkka}
        unreadWehrmacht={unreadWehrmacht}
        unreadGlobal={unreadGlobal}
        globalMessages={siteChat.messages}
        globalMuted={siteChat.muted}
        readOnly={readonlyBattle}
        spectator={readonlyBattle}
      />
    </>
  );
};

export default Battle;

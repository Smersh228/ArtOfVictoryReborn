import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRoomDetail,
  postBattleOrders,
  postBattleSurrender,
  postBattleTurnReady,
  type BattleOrderPayload,
  type LobbyFaction,
  type RoomDetailResponse,
} from '../api/rooms';

export type BattlePlayerId = 'a' | 'b';

export type ScenarioBattleOutcome = {
  winnerFaction: 'rkka' | 'wehrmacht';
  reason: 'objective' | 'timeout';
};

type BattleChannelMessage =
  | { type: 'surrender'; from: BattlePlayerId; tabId: string }
  | { type: 'turnReady'; tabId: string; turn: number };

export function parseBattlePlayer(param: string | null): BattlePlayerId {
  if (param === '2' || param === 'b' || param === 'B') return 'b';
  return 'a';
}

function surrenderStorageKey(roomId: string) {
  return `aot-battle:surrender:${roomId}`;
}

export function useBattleSync(
  roomId: string,
  playerId: BattlePlayerId,
  solo: boolean,
  apiRoomId: number | null,
) {
  const [turn, setTurn] = useState(0);
  const [waitingNextTurn, setWaitingNextTurn] = useState(false);
  const [opponentVictory, setOpponentVictory] = useState(false);
  const [scenarioBattleOutcome, setScenarioBattleOutcome] = useState<ScenarioBattleOutcome | null>(null);
  const [myBattleFaction, setMyBattleFaction] = useState<LobbyFaction>('none');
  const [roomDetail, setRoomDetail] = useState<RoomDetailResponse | null>(null);

  const turnRef = useRef(turn);
  turnRef.current = turn;

  const soloRef = useRef(solo);
  soloRef.current = solo;

  const chRef = useRef<BroadcastChannel | null>(null);

  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );

  /** Локальный режим без сервера: две разные вкладки = два tabId (не p=a / p=b). */
  const readyTabsRef = useRef<Set<string>>(new Set());

  const selfMemberKeyRef = useRef<string | null>(null);
  const lastSurrenderSeqRef = useRef<number | null>(null);
  const lastScenarioEndSeqRef = useRef<number | null>(null);
  const lastBattleFieldRevisionRef = useRef<number | null>(null);

  const commitTurnAdvance = useCallback(() => {
    readyTabsRef.current.clear();
    const next = turnRef.current + 1;
    turnRef.current = next;
    setTurn(next);
    setWaitingNextTurn(false);
  }, []);

  const tryAddReadyTab = useCallback(
    (tabId: string, turnIndex: number) => {
      if (soloRef.current) return;
      if (turnIndex !== turnRef.current) return;
      readyTabsRef.current.add(tabId);
      if (readyTabsRef.current.size >= 2) {
        commitTurnAdvance();
      }
    },
    [commitTurnAdvance],
  );

  const applyRemoteSurrender = useCallback((remoteTabId: string | undefined) => {
    if (!remoteTabId || remoteTabId === tabIdRef.current) return;
    setOpponentVictory(true);
  }, []);

  useEffect(() => {
    if (apiRoomId == null || !Number.isFinite(apiRoomId)) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const tabVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
        const data = await fetchRoomDetail(apiRoomId, { battleTabVisible: tabVisible });
        if (cancelled) return;
        setRoomDetail(data);
        const selfMem = data.members.find((m) => m.isYou);
        const selfKey = selfMem?.key ?? null;
        if (selfKey) selfMemberKeyRef.current = selfKey;
        setMyBattleFaction((selfMem?.faction as LobbyFaction) ?? 'none');

        const st = data.battleTurnIndex ?? 0;
        if (turnRef.current !== st) {
          turnRef.current = st;
          setTurn(st);
          setWaitingNextTurn(false);
        }

        const rev = data.battleFieldRevision ?? 0;
        const prevRev = lastBattleFieldRevisionRef.current;
        if (prevRev !== null && rev > prevRev) {
          setWaitingNextTurn(false);
        }
        lastBattleFieldRevisionRef.current = rev;

        const seq = data.battleSurrenderSeq ?? 0;
        const by = data.battleSurrenderBy ?? null;
        const sk = selfKey ?? selfMemberKeyRef.current;

        if (lastSurrenderSeqRef.current === null) {
          lastSurrenderSeqRef.current = seq;
          if (seq > 0 && by && sk && by !== sk) setOpponentVictory(true);
        } else if (seq > lastSurrenderSeqRef.current) {
          lastSurrenderSeqRef.current = seq;
          if (by && sk && by !== sk) setOpponentVictory(true);
        }

        const scSeq = data.battleScenarioEndSeq ?? 0;
        const winFac = data.battleScenarioWinnerFaction;
        const scReason = data.battleScenarioReason;
        if (lastScenarioEndSeqRef.current === null) {
          lastScenarioEndSeqRef.current = scSeq;
          if (
            scSeq > 0 &&
            (winFac === 'rkka' || winFac === 'wehrmacht') &&
            (scReason === 'objective' || scReason === 'timeout')
          ) {
            setScenarioBattleOutcome({ winnerFaction: winFac, reason: scReason });
          }
        } else if (scSeq > lastScenarioEndSeqRef.current) {
          lastScenarioEndSeqRef.current = scSeq;
          if (
            scSeq > 0 &&
            (winFac === 'rkka' || winFac === 'wehrmacht') &&
            (scReason === 'objective' || scReason === 'timeout')
          ) {
            setScenarioBattleOutcome({ winnerFaction: winFac, reason: scReason });
          }
        }
      } catch {
       
      }
    };

    void tick();
    const id = window.setInterval(tick, 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [apiRoomId]);

  useEffect(() => {
    const ch = new BroadcastChannel(`aot-battle-${roomId}`);
    chRef.current = ch;
    ch.onmessage = (e: MessageEvent<BattleChannelMessage>) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'surrender') {
        applyRemoteSurrender(msg.tabId);
        return;
      }
      if (msg.type === 'turnReady') {
        tryAddReadyTab(msg.tabId, msg.turn);
      }
    };

    const storageKey = surrenderStorageKey(roomId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return;
      try {
        const data = JSON.parse(e.newValue) as { tabId?: string };
        applyRemoteSurrender(data.tabId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      ch.close();
      chRef.current = null;
    };
  }, [roomId, tryAddReadyTab, applyRemoteSurrender]);

  const broadcastSurrender = useCallback(async () => {
    const payload = {
      type: 'surrender' as const,
      from: playerId,
      tabId: tabIdRef.current,
    } satisfies BattleChannelMessage;

    try {
      const ch = new BroadcastChannel(`aot-battle-${roomId}`);
      ch.postMessage(payload);
      ch.close();
    } catch {
      /* ignore */
    }

    try {
      localStorage.setItem(
        surrenderStorageKey(roomId),
        JSON.stringify({ tabId: tabIdRef.current, from: playerId, t: Date.now() }),
      );
    } catch {
      /* ignore */
    }

    if (apiRoomId != null && Number.isFinite(apiRoomId)) {
      try {
        await postBattleSurrender(apiRoomId);
      } catch {
        /* ignore */
      }
    }
  }, [playerId, roomId, apiRoomId]);

  const confirmNextTurn = useCallback(async (ordersPayload?: BattleOrderPayload[]): Promise<boolean> => {
    if (solo) {
      const next = turnRef.current + 1;
      turnRef.current = next;
      setTurn(next);
      return true;
    }
    if (apiRoomId != null && Number.isFinite(apiRoomId)) {
      setWaitingNextTurn(true);
      try {
        await postBattleOrders(apiRoomId, turnRef.current, ordersPayload ?? []);
        await postBattleTurnReady(apiRoomId, turnRef.current);
        return true;
      } catch (err) {
        setWaitingNextTurn(false);
        const msg = err instanceof Error ? err.message : 'Не удалось отправить приказы';
        window.alert(msg);
        return false;
      }
    }
    setWaitingNextTurn(true);
    const t = turnRef.current;
    chRef.current?.postMessage({ type: 'turnReady', tabId: tabIdRef.current, turn: t } satisfies BattleChannelMessage);
    tryAddReadyTab(tabIdRef.current, t);
    return true;
  }, [apiRoomId, solo, tryAddReadyTab]);

  const dismissVictory = useCallback(() => setOpponentVictory(false), []);
  const dismissScenarioOutcome = useCallback(() => setScenarioBattleOutcome(null), []);

  return {
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
  };
}

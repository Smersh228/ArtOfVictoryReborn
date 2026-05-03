import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './styleModules/lobby.module.css';
import Button from '../components/Button';
import { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import LobbyPlayersPanel from '../components/lobby/LobbyPlayersPanel';
import LobbyMissionPanels from '../components/lobby/LobbyMissionPanels';
import {
  fetchRoomDetail,
  fetchRoomLobbyMap,
  leaveRoom,
  startRoomBattle,
  updateLobbyMe,
  type LobbyFaction,
  type RoomMember,
  type RoomPublic,
} from '../api/rooms';
import type { EditorMapPayloadLobby } from '../api/maps';
import { resolveEditorImageUrl } from '../api/editorCatalog';

const PREVIEW_MAX_W = 520;
const PREVIEW_MAX_H = 320;

function computeLobbyPreviewLayout(cells: Cell[]): { width: number; height: number; cellSize: number } {
  if (!cells.length) return { width: PREVIEW_MAX_W, height: 140, cellSize: 16 };
  for (let cs = 28; cs >= 5; cs -= 1) {
    let minPx = Infinity;
    let maxPx = -Infinity;
    let minPy = Infinity;
    let maxPy = -Infinity;
    for (const c of cells) {
      const q = c.coor.x;
      const r = c.coor.z;
      const px = cs * 1.5 * q;
      const py = cs * (1.732 * r + 0.866 * q);
      minPx = Math.min(minPx, px - cs);
      maxPx = Math.max(maxPx, px + cs);
      minPy = Math.min(minPy, py - cs);
      maxPy = Math.max(maxPy, py + cs);
    }
    const bw = maxPx - minPx + 28;
    const bh = maxPy - minPy + 28;
    if (bw <= PREVIEW_MAX_W && bh <= PREVIEW_MAX_H) {
      return { width: Math.ceil(bw), height: Math.ceil(bh), cellSize: cs };
    }
  }
  return { width: PREVIEW_MAX_W, height: PREVIEW_MAX_H, cellSize: 5 };
}

function factionLabel(f: LobbyFaction | string | undefined): string {
  switch (f) {
    case 'rkka':
      return 'РККА';
    case 'wehrmacht':
      return 'Вермахт';
    default:
      return 'Не выбран';
  }
}

function readyLabel(ready: boolean): string {
  return ready ? 'Готов' : 'Не готов';
}

function normalizeMembers(list: RoomMember[]): RoomMember[] {
  return list.map((m) => ({
    ...m,
    faction: (m.faction ?? 'none') as LobbyFaction,
    ready: Boolean(m.isHost) ? true : Boolean(m.ready),
    isHost: Boolean(m.isHost),
  }));
}


function getStartBattleHint(members: RoomMember[], youAreHost: boolean): string {
  if (!youAreHost || members.length === 0) return '';
  if (members.length < 2) return 'Для начала боя нужно минимум два игрока в комнате';
  for (const m of members) {
    if ((m.faction ?? 'none') === 'none') return 'Все игроки должны выбрать фракцию';
  }
  for (const m of members) {
    if (!m.ready) return 'Все игроки должны быть готовы';
  }
  const facs = members.map((m) => m.faction);
  if (new Set(facs).size !== facs.length) return 'Фракции игроков не должны совпадать';
  return '';
}

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const serverId = (location.state as { serverId?: number } | null)?.serverId;

  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [youAreHost, setYouAreHost] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const battleNavigatedRef = useRef(false);
  const [savedMapPayload, setSavedMapPayload] = useState<EditorMapPayloadLobby | null>(null);
  const [mapPayloadError, setMapPayloadError] = useState(false);

  useEffect(() => {
    if (serverId == null || !Number.isFinite(serverId)) {
      navigate('/main', { replace: true });
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const data = await fetchRoomDetail(serverId);
        if (cancelled) return;
        setRoom(data.room);
        setMembers(normalizeMembers(data.members));
        setYouAreHost(Boolean(data.youAreHost));
        setLobbyError(null);
        if (data.battleStartedAt != null && !battleNavigatedRef.current) {
          battleNavigatedRef.current = true;
          navigate(`/battle?room=${serverId}`, { state: { serverId } });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Ошибка загрузки лобби';
        setLobbyError(msg);
        if (msg.includes('Комната не найдена')) {
          navigate('/main', { replace: true });
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [serverId, navigate]);

  useEffect(() => {
    if (serverId == null || !Number.isFinite(serverId)) {
      setSavedMapPayload(null);
      setMapPayloadError(false);
      return;
    }
    let cancelled = false;
    setMapPayloadError(false);
    fetchRoomLobbyMap(serverId)
      .then(({ map }) => {
        if (!cancelled) {
          setSavedMapPayload((map?.payload ?? null) as EditorMapPayloadLobby | null);
          setMapPayloadError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedMapPayload(null);
          setMapPayloadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, room?.mapId]);

  const previewCells = useMemo(() => {
    const raw = savedMapPayload?.cells;
    if (!Array.isArray(raw) || raw.length === 0) return [] as Cell[];
    return raw as Cell[];
  }, [savedMapPayload]);

  const previewLayout = useMemo(() => computeLobbyPreviewLayout(previewCells), [previewCells]);

  const historyText =
    mapPayloadError && room?.mapId != null
      ? 'Не удалось загрузить данные карты с сервера. Проверьте сеть и обновите страницу.'
      : savedMapPayload?.scenario?.historyText?.trim() ||
        (room?.mapId != null
          ? 'Текст справки не задан в редакторе (вкладка «Сценарий»).'
          : 'Для комнаты не выбрана карта из редактора — задачи и справка недоступны.');

  const allyTasksText = savedMapPayload?.conditions?.allyTasks?.trim() ?? '';
  const axisTasksText = savedMapPayload?.conditions?.axisTasks?.trim() ?? '';
  const maxTurnsMission = savedMapPayload?.conditions?.maxTurns?.trim() ?? '';

  const scenarioPhotos = savedMapPayload?.scenario?.photos;
  const photo0 =
    Array.isArray(scenarioPhotos) && scenarioPhotos[0]?.trim()
      ? resolveEditorImageUrl(scenarioPhotos[0].trim())
      : '';
  const photo1 =
    Array.isArray(scenarioPhotos) && scenarioPhotos[1]?.trim()
      ? resolveEditorImageUrl(scenarioPhotos[1].trim())
      : '';

  const goMain = () => {
    if (serverId != null && Number.isFinite(serverId)) {
      void leaveRoom(serverId).finally(() => navigate('/main'));
    } else {
      navigate('/main');
    }
  };

  const self = members.find((m) => m.isYou);
  const canLobbyAction = Boolean(self && !lobbyError && members.length > 0 && !actionBusy);
  const canToggleReady = canLobbyAction && !youAreHost;

  const startBattleHint = useMemo(() => getStartBattleHint(members, youAreHost), [members, youAreHost]);
  const canStartBattle = youAreHost && members.length > 0 && startBattleHint === '';

  const runLobbyAction = (body: { toggleFaction?: boolean; toggleReady?: boolean }) => {
    if (!canLobbyAction || serverId == null || !Number.isFinite(serverId)) return;
    if (body.toggleReady && youAreHost) return;
    setActionBusy(true);
    void updateLobbyMe(serverId, body)
      .then((data) => {
        setRoom(data.room);
        setMembers(normalizeMembers(data.members));
        setYouAreHost(Boolean(data.youAreHost));
        setLobbyError(null);
        if (data.battleStartedAt != null && !battleNavigatedRef.current) {
          battleNavigatedRef.current = true;
          navigate(`/battle?room=${serverId}`, { state: { serverId } });
        }
      })
      .catch((e) => {
        setLobbyError(e instanceof Error ? e.message : 'Ошибка');
      })
      .finally(() => setActionBusy(false));
  };

  const runStartBattle = () => {
    if (
      !canStartBattle ||
      serverId == null ||
      !Number.isFinite(serverId) ||
      actionBusy ||
      lobbyError
    )
      return;
    setActionBusy(true);
    void startRoomBattle(serverId)
      .then((data) => {
        setRoom(data.room);
        setMembers(normalizeMembers(data.members));
        setYouAreHost(Boolean(data.youAreHost));
        setLobbyError(null);
        if (data.battleStartedAt != null && !battleNavigatedRef.current) {
          battleNavigatedRef.current = true;
          navigate(`/battle?room=${serverId}`, { state: { serverId } });
        }
      })
      .catch((e) => {
        setLobbyError(e instanceof Error ? e.message : 'Ошибка');
      })
      .finally(() => setActionBusy(false));
  };

  const headerTitle =
    room?.name != null && room.name.length > 0
      ? `Игровая комната — ${room.name}`
      : 'Игровая комната';

  return (
    <div className={styles.lobby}>
      {room == null && lobbyError == null && (
        <div className={styles.lobbyLoadingOverlay} role="status" aria-live="polite">
          <p className={styles.lobbyLoadingOverlayTitle}>Загрузка лобби…</p>
          <p className={styles.lobbyLoadingOverlayHint}>Подключаемся к комнате</p>
        </div>
      )}
      <header className={styles.lobbyHeader}>
        <h1 className={styles.lobbyTitle}>{headerTitle}</h1>
        <div className={styles.lobbyNav}>
          <Button name="На главную" size={180} onClick={goMain} />
        </div>
      </header>

      <div className={styles.lobbyBody}>
        <LobbyPlayersPanel
          lobbyError={lobbyError}
          members={members}
          factionLabel={factionLabel}
          readyLabel={readyLabel}
          youAreHost={youAreHost}
          selfReady={Boolean(self?.ready)}
          canToggleReady={canToggleReady}
          canStartBattle={canStartBattle}
          canLobbyAction={canLobbyAction}
          startBattleHint={startBattleHint}
          onToggleReady={() => canToggleReady && runLobbyAction({ toggleReady: true })}
          onStartBattle={runStartBattle}
          onToggleFaction={() => canLobbyAction && runLobbyAction({ toggleFaction: true })}
        />

        <LobbyMissionPanels
          room={room}
          maxTurnsMission={maxTurnsMission}
          allyTasksText={allyTasksText}
          axisTasksText={axisTasksText}
          previewCells={previewCells}
          previewLayout={previewLayout}
          photo0={photo0 ?? ''}
          photo1={photo1 ?? ''}
          historyText={historyText}
        />
      </div>
    </div>
  );
};

export default Lobby;

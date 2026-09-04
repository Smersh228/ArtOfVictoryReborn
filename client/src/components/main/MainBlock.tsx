import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../styleModules/mainBlock.module.css'
import Button from '../Button'
import ListServer from './ListServer'
import CreateServerPanel from './CreateServerPanel'
import type { GameRoom } from './Room'
import { useAuth } from '../../context/AuthContext'
import { isCatalogEditorAdmin } from '../../utils/catalogEditorAdmin'
import MaintenanceAdminPanel from './MaintenanceAdminPanel'
import MainChat from './MainChat'
import MainPlayerCard from './MainPlayerCard'
import Modal from '../Modal'
import { fetchRoomsList, createRoom, joinRoom, spectateRoom } from '../../api/rooms'
import { setOnlineBoost } from '../../api/maintenance'
import {
  fetchLobbyState,
  sendLobbyChat,
  fetchLobbyProfile,
  LobbyHubError,
  decorateLobbyNick,
  lobbyNickClass,
  type LobbyChatMessage,
  type LobbyOnlinePlayer,
  type LobbyPlayerProfile,
  type LobbyRoleKey,
} from '../../api/lobbyHub'
import {
  MENU_THEMES,
  MENU_TRACKS,
  readMenuThemeId,
  readMenuTrackId,
  setMenuThemeId,
  setMenuTrackId,
  SETTINGS_CHANGED_EVENT,
  type MenuThemeId,
  type MenuTrackId,
} from '../../utils/userSettings'

function ruPeopleWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return 'человек'
  if (last === 1) return 'человек'
  if (last >= 2 && last <= 4) return 'человека'
  return 'человек'
}

function onlineWhereLabel(row: LobbyOnlinePlayer): string {
  if (row.where === 'battle') return row.roomName ? `в бою · ${row.roomName}` : 'в бою'
  if (row.where === 'lobby') return row.roomName ? `в комнате · ${row.roomName}` : 'в комнате'
  return 'на сайте'
}

type NetworkView = 'list' | 'create'

const MainBlock: React.FC = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [showNetwork, setShowNetwork] = useState(false)
  const [networkView, setNetworkView] = useState<NetworkView>('list')
  const [servers, setServers] = useState<GameRoom[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [roomsFetchedOnce, setRoomsFetchedOnce] = useState(false)
  const [joiningServerId, setJoiningServerId] = useState<number | null>(null)
  const [showAllowlistModal, setShowAllowlistModal] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [inBattleCount, setInBattleCount] = useState(0)
  const [onlineReal, setOnlineReal] = useState<number | null>(null)
  const [onlineBoost, setOnlineBoostAmount] = useState(0)
  const [boostDraft, setBoostDraft] = useState('0')
  const [boostBusy, setBoostBusy] = useState(false)
  const boostFocusedRef = useRef(false)
  const [chatMessages, setChatMessages] = useState<LobbyChatMessage[]>([])
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatSending, setChatSending] = useState(false)
  const [chatMuted, setChatMuted] = useState(false)
  const [chatLastSentAt, setChatLastSentAt] = useState(0)
  const [playerProfile, setPlayerProfile] = useState<LobbyPlayerProfile | null>(null)
  const [playerProfileLoading, setPlayerProfileLoading] = useState(false)
  const [playerProfileError, setPlayerProfileError] = useState<string | null>(null)
  const [myRoleKey, setMyRoleKey] = useState<LobbyRoleKey>('player')
  const [onlinePlayers, setOnlinePlayers] = useState<LobbyOnlinePlayer[] | null>(null)
  const [showOnlinePlayersModal, setShowOnlinePlayersModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsView, setSettingsView] = useState<'home' | 'theme' | 'music'>('home')
  const [themeId, setThemeId] = useState<MenuThemeId>(() => readMenuThemeId())
  const [trackId, setTrackId] = useState<MenuTrackId>(() => readMenuTrackId())

  const closeSettings = useCallback(() => {
    setShowSettingsModal(false)
    setSettingsView('home')
  }, [])

  const openCreateServer = useCallback(() => {
    setNetworkView('create')
  }, [])

  useEffect(() => {
    const sync = () => {
      setThemeId(readMenuThemeId())
      setTrackId(readMenuTrackId())
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, sync)
  }, [])

  const backToServerList = useCallback(() => {
    setNetworkView('list')
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const state = await fetchLobbyState()
        if (cancelled) return
        setOnlineCount(state.online)
        setInBattleCount(state.inBattle)
        if (state.onlineReal != null) setOnlineReal(state.onlineReal)
        if (state.onlineBoost != null) {
          setOnlineBoostAmount(state.onlineBoost)
          if (!boostFocusedRef.current) setBoostDraft(String(state.onlineBoost))
        }
        setChatMessages(state.messages)
        setChatMuted(state.muted)
        setMyRoleKey(state.roleKey)
        if (state.onlinePlayers) setOnlinePlayers(state.onlinePlayers)
        else setOnlinePlayers(null)
      } catch {
        /* счётчик и чат обновятся на следующем тике */
      }
    }
    void tick()
    const id = window.setInterval(tick, 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!showNetwork || networkView !== 'list') return
    let cancelled = false
    const tick = async () => {
      try {
        const { rooms } = await fetchRoomsList()
        if (!cancelled) {
          setServers(rooms as GameRoom[])
          setListError(null)
          setRoomsFetchedOnce(true)
        }
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : 'Не удалось загрузить комнаты')
          setRoomsFetchedOnce(true)
        }
      }
    }
    void tick()
    const id = window.setInterval(tick, 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [showNetwork, networkView])

  const confirmCreateServer = useCallback(
    async ({ name, map, mapId, maxPlayers }: { name: string; map: string; mapId: number; maxPlayers: number }) => {
      try {
        const { room } = await createRoom({ name, maxPlayers, map, mapId })
        setShowNetwork(false)
        setNetworkView('list')
        navigate('/lobby', { state: { serverId: room.id } })
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Не удалось создать комнату')
      }
    },
    [navigate],
  )

  const joinServer = useCallback(
    async (serverId: number) => {
      setJoiningServerId(serverId)
      try {
        await joinRoom(serverId)
        navigate('/lobby', { state: { serverId } })
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Не удалось войти в комнату')
      } finally {
        setJoiningServerId(null)
      }
    },
    [navigate],
  )

  const spectateServer = useCallback(
    async (serverId: number) => {
      setJoiningServerId(serverId)
      try {
        await spectateRoom(serverId)
        navigate(`/battle?room=${serverId}&spectator=1`, { state: { serverId, spectator: true } })
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Не удалось подключиться как наблюдатель')
      } finally {
        setJoiningServerId(null)
      }
    },
    [navigate],
  )

  const openPlayerProfile = useCallback(async (userId: number) => {
    setPlayerProfileLoading(true)
    setPlayerProfileError(null)
    setPlayerProfile(null)
    try {
      const next = await fetchLobbyProfile(userId)
      setPlayerProfile(next)
    } catch (e) {
      setPlayerProfileError(e instanceof Error ? e.message : 'Не удалось открыть профиль')
    } finally {
      setPlayerProfileLoading(false)
    }
  }, [])

  const closePlayerProfile = useCallback(() => {
    setPlayerProfile(null)
    setPlayerProfileError(null)
    setPlayerProfileLoading(false)
  }, [])

  const toggleNetwork = useCallback(() => {
    closePlayerProfile()
    setShowNetwork((v) => {
      if (v) {
        setNetworkView('list')
        setRoomsFetchedOnce(false)
      }
      return !v
    })
  }, [closePlayerProfile])

  const sendChat = useCallback(async (text: string) => {
    setChatSending(true)
    setChatError(null)
    try {
      const state = await sendLobbyChat(text)
      setOnlineCount(state.online)
      setInBattleCount(state.inBattle)
      setChatMessages(state.messages)
      setChatMuted(state.muted)
      setMyRoleKey(state.roleKey)
      setChatLastSentAt(Date.now())
    } catch (e) {
      if (e instanceof LobbyHubError && e.state) {
        setOnlineCount(e.state.online)
        setInBattleCount(e.state.inBattle)
        setChatMessages(e.state.messages)
        setChatMuted(e.state.muted)
        setMyRoleKey(e.state.roleKey)
      }
      setChatError(e instanceof Error ? e.message : 'Не удалось отправить')
    } finally {
      setChatSending(false)
    }
  }, [])

  const applyOnlineBoost = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (boostBusy) return
      setBoostBusy(true)
      try {
        const next = await setOnlineBoost(Number(boostDraft))
        const boost = next.onlineBoost
        setOnlineBoostAmount(boost)
        setBoostDraft(String(boost))
        const real = onlineReal ?? Math.max(0, onlineCount - onlineBoost)
        setOnlineCount(real + boost)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Не удалось сохранить подкрутку онлайна')
      } finally {
        setBoostBusy(false)
      }
    },
    [boostBusy, boostDraft, onlineReal, onlineCount, onlineBoost],
  )

  return (
    <div className={styles.layout}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Главное меню</h1>
        <p className={styles.subtitle}>
          {user ? `Привет, ${user.username}` : 'Привет'}
        </p>
        <div className={styles.actions}>
          <Button name="Выйти" size={380} onClick={() => void logout().then(() => navigate('/auth'))} />
          <Button name="Сетевая игра" size={380} onClick={toggleNetwork} />
          {showNetwork && networkView === 'list' && (
            <Button name="Создать сервер" size={380} onClick={openCreateServer} />
          )}
          <Button name="Руководство по игре" size={380} onClick={() => navigate('/manual')} />
          <Button
            name="Настройки"
            size={380}
            onClick={() => {
              setSettingsView('home')
              setShowSettingsModal(true)
            }}
          />
          <Button name="Редактор карт" size={380} onClick={() => navigate('/editor-map')} />
          {user && isCatalogEditorAdmin(user.username) && (
            <>
              <Button name="Редактор объектов" size={380} onClick={() => navigate('/editor-unit')} />
              <Button name="Белый список" size={380} onClick={() => setShowAllowlistModal(true)} />
              <Button name="Кто в сети" size={380} onClick={() => setShowOnlinePlayersModal(true)} />
            </>
          )}
        </div>
      </div>
      <Modal
        isOpen={showSettingsModal}
        onClose={closeSettings}
        title="Настройки"
        subtitle={
          settingsView === 'theme' ? 'Смена темы' : settingsView === 'music' ? 'Смена музыки' : undefined
        }
        footer={
          settingsView === 'home' ? (
            <Button name="Закрыть" size={380} onClick={closeSettings} />
          ) : (
            <Button name="Назад" size={380} onClick={() => setSettingsView('home')} />
          )
        }
      >
        <div className={styles.actions}>
          {settingsView === 'home' ? (
            <>
              <Button name="Смена темы" size={380} onClick={() => setSettingsView('theme')} />
              <Button name="Смена музыки" size={380} onClick={() => setSettingsView('music')} />
            </>
          ) : null}
          {settingsView === 'theme'
            ? MENU_THEMES.map((row) => (
                <Button
                  key={row.id}
                  name={row.id === themeId ? `${row.label} · выбрано` : row.label}
                  size={380}
                  onClick={() => setMenuThemeId(row.id)}
                />
              ))
            : null}
          {settingsView === 'music'
            ? MENU_TRACKS.map((row) => (
                <Button
                  key={row.id}
                  name={row.id === trackId ? `${row.label} · выбрано` : row.label}
                  size={380}
                  onClick={() => setMenuTrackId(row.id)}
                />
              ))
            : null}
        </div>
      </Modal>
      {user && isCatalogEditorAdmin(user.username) ? (
        <Modal
          isOpen={showOnlinePlayersModal}
          onClose={() => setShowOnlinePlayersModal(false)}
          title="Кто в сети"
          subtitle={
            onlineReal != null
              ? `Настоящих: ${onlineReal} · в боях: ${inBattleCount}`
              : `На сайте: ${onlineCount} · в боях: ${inBattleCount}`
          }
          size="lg"
          footer={<Button name="Закрыть" size={380} onClick={() => setShowOnlinePlayersModal(false)} />}
        >
          <ul className={styles.onlineModalList}>
            {!onlinePlayers || onlinePlayers.length === 0 ? (
              <li className={styles.onlineModalEmpty}>Сейчас никого нет</li>
            ) : (
              onlinePlayers.map((row) => (
                <li key={row.id} className={styles.onlineModalItem}>
                  <button
                    type="button"
                    className={`${styles.onlineModalName} ${styles[lobbyNickClass(row.roleKey, row.highlight)] || ''}`}
                    onClick={() => void openPlayerProfile(row.id)}
                  >
                    {decorateLobbyNick(row.username, row.roleKey, row.highlight)}
                  </button>
                  <span className={styles.onlineModalWhere}>{onlineWhereLabel(row)}</span>
                </li>
              ))
            )}
          </ul>
        </Modal>
      ) : null}
      {user && isCatalogEditorAdmin(user.username) ? (
        <Modal
          isOpen={showAllowlistModal}
          onClose={() => setShowAllowlistModal(false)}
          title="Белый список"
          subtitle="Технические работы и доступ игроков"
          size="xl"
          footer={<Button name="Закрыть" size={380} onClick={() => setShowAllowlistModal(false)} />}
        >
          <MaintenanceAdminPanel inModal onViewProfile={(userId) => void openPlayerProfile(userId)} />
        </Modal>
      ) : null}
      {(playerProfile || playerProfileLoading || playerProfileError) && (
        <MainPlayerCard
          profile={playerProfile}
          loading={playerProfileLoading}
          error={playerProfileError}
          onClose={closePlayerProfile}
          onProfileUpdate={setPlayerProfile}
          viewerRoleKey={isCatalogEditorAdmin(user?.username) ? 'admin' : myRoleKey}
        />
      )}
      {showNetwork && (
        <div className={styles.serverZone}>
          <div
            className={`${styles.serverAside} ${networkView === 'create' ? styles.serverAsideCreate : ''}`}
          >
            {networkView === 'list' ? (
              <ListServer
                servers={servers}
                onJoin={joinServer}
                onSpectate={spectateServer}
                listError={listError}
                loadingList={showNetwork && networkView === 'list' && !roomsFetchedOnce}
                joiningServerId={joiningServerId}
              />
            ) : (
              <CreateServerPanel onCancel={backToServerList} onCreate={confirmCreateServer} />
            )}
          </div>
        </div>
      )}
      <div className={styles.rightCol}>
        <div
          className={styles.onlineBadge}
          title={
            user && isCatalogEditorAdmin(user.username) && onlineReal != null
              ? `Настоящих: ${onlineReal}, подкрутка: +${onlineBoost}`
              : 'Сколько игроков сейчас на сайте и сколько из них в бою'
          }
        >
          <span>
            На сайте: {onlineCount} {ruPeopleWord(onlineCount)}
          </span>
          <span>
            В боях: {inBattleCount} {ruPeopleWord(inBattleCount)}
          </span>
          {user && isCatalogEditorAdmin(user.username) ? (
            <form className={styles.onlineBoostRow} onSubmit={applyOnlineBoost}>
              <label className={styles.onlineBoostLabel}>
                +
                <input
                  className={styles.onlineBoostInput}
                  type="number"
                  min={0}
                  max={9999}
                  step={1}
                  value={boostDraft}
                  disabled={boostBusy}
                  onFocus={() => {
                    boostFocusedRef.current = true
                  }}
                  onBlur={() => {
                    boostFocusedRef.current = false
                  }}
                  onChange={(e) => setBoostDraft(e.target.value)}
                  aria-label="Подкрутка онлайна"
                />
              </label>
              <button type="submit" className={styles.onlineBoostBtn} disabled={boostBusy}>
                Ок
              </button>
            </form>
          ) : null}
        </div>
        <MainChat
          messages={chatMessages}
          sending={chatSending}
          error={chatError}
          muted={chatMuted}
          lastSentAt={chatLastSentAt}
          onSend={sendChat}
          onViewProfile={(userId) => void openPlayerProfile(userId)}
        />
      </div>
    </div>
  )
}

export default MainBlock

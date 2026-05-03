import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../styleModules/mainBlock.module.css'
import Button from '../Button'
import ListServer from './ListServer'
import CreateServerPanel from './CreateServerPanel'
import type { GameRoom } from './Room'
import { useAuth } from '../../context/AuthContext'
import { isCatalogEditorAdmin } from '../../utils/catalogEditorAdmin'
import { fetchRoomsList, createRoom, joinRoom, spectateRoom } from '../../api/rooms'

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

  const toggleNetwork = useCallback(() => {
    setShowNetwork((v) => {
      if (v) {
        setNetworkView('list')
        setRoomsFetchedOnce(false)
      }
      return !v
    })
  }, [])

  const openCreateServer = useCallback(() => {
    setNetworkView('create')
  }, [])

  const backToServerList = useCallback(() => {
    setNetworkView('list')
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
    async ({ name, map, mapId }: { name: string; map: string; mapId: number }) => {
      try {
        const { room } = await createRoom({ name, maxPlayers: 2, map, mapId })
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
          <Button name="Редактор карт" size={380} onClick={() => navigate('/editor-map')} />
          {user && isCatalogEditorAdmin(user.username) && (
            <Button name="Редактор объектов" size={380} onClick={() => navigate('/editor-unit')} />
          )}
        </div>
      </div>
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
    </div>
  )
}

export default MainBlock

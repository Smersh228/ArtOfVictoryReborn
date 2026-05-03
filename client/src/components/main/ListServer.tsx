import React from 'react'
import styles from '../styleModules/listMain.module.css'
import Room, { type GameRoom } from './Room'

interface ListServerProps {
  servers: GameRoom[]
  onJoin: (serverId: number) => void
  onSpectate: (serverId: number) => void
  listError?: string | null
  loadingList?: boolean
  joiningServerId?: number | null
}

const ListServer: React.FC<ListServerProps> = ({ servers, onJoin, onSpectate, listError, loadingList, joiningServerId }) => {
  return (
    <div className={styles.listWrap}>
      <h2 className={styles.listHeading}>Доступные комнаты</h2>
      {loadingList && <p className={styles.listLoadingLobby}>Загрузка лобби…</p>}
      {listError && servers.length > 0 && <p className={styles.listHint}>{listError}</p>}
      <div className={styles.listBody}>
        {loadingList && servers.length === 0 ? (
          <p className={styles.listHintMuted}>Получаем список комнат с сервера</p>
        ) : !loadingList && servers.length === 0 ? (
          <p className={styles.listHint}>
            {listError ?? 'Пока нет комнат. Создайте сервер или дождитесь списка.'}
          </p>
        ) : (
          servers.map((server) => (
            <Room
              key={server.id}
              server={server}
              joining={joiningServerId === server.id}
              onJoin={() => onJoin(server.id)}
              onSpectate={() => onSpectate(server.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default ListServer

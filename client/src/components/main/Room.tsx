import React from 'react'
import styles from '../styleModules/listMain.module.css'
import Button from '../Button'
import type { RoomPublic } from '../../api/rooms'

export interface GameRoom extends RoomPublic {}

interface RoomProps {
  server: GameRoom
  onJoin: () => void
  onSpectate: () => void
  joining?: boolean
}

const Room: React.FC<RoomProps> = ({ server, onJoin, onSpectate, joining }) => {
  const full = server.players >= server.maxPlayers
  const inBattle = server.battleStartedAt != null
  const dimmed = full && !inBattle
  let meta = `Карта: ${server.map}  Игроки: ${server.players}/${server.maxPlayers}`
  if (inBattle) meta += ' Идёт бой'
  else if (full) meta += ' Комната заполнена'
  const cantJoin = full || inBattle || joining
  let title: string | undefined
  if (inBattle) title = 'В этой комнате уже идёт бой'
  else if (full) title = 'Комната заполнена'
  return (
    <div className={`${styles.roomMain} ${dimmed ? styles.roomMainDimmed : ''}`}>
      <div className={styles.roomInfo}>
        <div className={styles.roomName}>{server.name}</div>
        <div className={styles.roomMeta}>{meta}</div>
      </div>
      {inBattle ? (
        <Button name={joining ? 'Подключение…' : 'Наблюдать'} size={140} disabled={joining} onClick={onSpectate} />
      ) : (
        <Button
          name={joining ? 'Вход…' : 'Войти'}
          size={140}
          disabled={cantJoin}
          title={title}
          onClick={onJoin}
        />
      )}
    </div>
  )
}

export default Room

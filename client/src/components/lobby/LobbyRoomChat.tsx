import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import styles from '../../pages/styleModules/lobby.module.css'
import type { LobbyFaction, LobbyRoomChatChannel, LobbyRoomChatMessage } from '../../api/rooms'

export type LobbyChatView = 'all' | 'team' | 'rkka' | 'wehrmacht'

function formatChatTime(ts: number): string {
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function messageChannel(m: LobbyRoomChatMessage): LobbyRoomChatChannel {
  return m.channel === 'team' ? 'team' : 'all'
}

type LobbyRoomChatProps = {
  isOpen: boolean
  onClose: () => void
  messages: LobbyRoomChatMessage[]
  selfLabel: string
  selfUserId?: number
  selfFaction?: LobbyFaction
  sending: boolean
  error: string | null
  onSend: (text: string, channel: LobbyRoomChatChannel) => Promise<void>
  onViewChannel: (channel: LobbyChatView, lastId: number) => void
  unreadAll: number
  unreadTeam: number
  unreadRkka?: number
  unreadWehrmacht?: number
  readOnly?: boolean
  spectator?: boolean
}

const LobbyRoomChat: React.FC<LobbyRoomChatProps> = ({
  isOpen,
  onClose,
  messages,
  selfLabel,
  selfUserId,
  selfFaction,
  sending,
  error,
  onSend,
  onViewChannel,
  unreadAll,
  unreadTeam,
  unreadRkka = 0,
  unreadWehrmacht = 0,
  readOnly = false,
  spectator = false,
}) => {
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<LobbyChatView>('all')
  const listRef = useRef<HTMLDivElement | null>(null)
  const canUseTeam = selfFaction === 'rkka' || selfFaction === 'wehrmacht'
  const visible = useMemo(() => {
    if (view === 'all') return messages.filter((m) => messageChannel(m) === 'all')
    if (view === 'rkka') {
      return messages.filter((m) => messageChannel(m) === 'team' && m.teamKey === 'rkka')
    }
    if (view === 'wehrmacht') {
      return messages.filter((m) => messageChannel(m) === 'team' && m.teamKey === 'wehrmacht')
    }
    return messages.filter((m) => messageChannel(m) === 'team')
  }, [messages, view])
  const lastId = visible.length ? visible[visible.length - 1].id : 0
  const sendChannel: LobbyRoomChatChannel = view === 'all' ? 'all' : 'team'
  const canSend =
    !readOnly && !sending && draft.trim().length > 0 && (sendChannel === 'all' || canUseTeam)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lastId, isOpen, view])

  useEffect(() => {
    if (!isOpen) setDraft('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    onViewChannel(view, lastId)
  }, [isOpen, view, lastId, onViewChannel])

  const submit = async () => {
    const text = draft.trim()
    if (!text || !canSend) return
    setDraft('')
    await onSend(text, sendChannel)
  }

  const teamLabel = selfFaction === 'rkka' ? 'РККА' : selfFaction === 'wehrmacht' ? 'Вермахт' : ''
  const subtitle = readOnly
    ? 'Режим наблюдения: все чаты видны, писать нельзя'
    : view === 'team'
      ? canUseTeam
        ? `Командный чат · ${teamLabel}`
        : 'Командный чат доступен после выбора фракции'
      : view === 'rkka'
        ? 'Командный чат РККА'
        : view === 'wehrmacht'
          ? 'Командный чат Вермахта'
          : 'Общий чат видят все игроки комнаты'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Чат комнаты"
      subtitle={subtitle}
      footer={<Button name="Закрыть" size={160} onClick={onClose} />}
    >
      <div className={styles.lobbyChat}>
        <div className={styles.lobbyChatTabs} role="tablist" aria-label="Каналы чата">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'all'}
            className={`${styles.lobbyChatTab} ${view === 'all' ? styles.lobbyChatTabActive : ''}`}
            onClick={() => setView('all')}
          >
            Общий
            {unreadAll > 0 && view !== 'all' ? (
              <span className={styles.lobbyChatTabBadge}>{unreadAll > 99 ? '99+' : unreadAll}</span>
            ) : null}
          </button>
          {spectator ? (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'rkka'}
                className={`${styles.lobbyChatTab} ${view === 'rkka' ? styles.lobbyChatTabActive : ''}`}
                onClick={() => setView('rkka')}
              >
                РККА
                {unreadRkka > 0 && view !== 'rkka' ? (
                  <span className={styles.lobbyChatTabBadge}>{unreadRkka > 99 ? '99+' : unreadRkka}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'wehrmacht'}
                className={`${styles.lobbyChatTab} ${view === 'wehrmacht' ? styles.lobbyChatTabActive : ''}`}
                onClick={() => setView('wehrmacht')}
              >
                Вермахт
                {unreadWehrmacht > 0 && view !== 'wehrmacht' ? (
                  <span className={styles.lobbyChatTabBadge}>
                    {unreadWehrmacht > 99 ? '99+' : unreadWehrmacht}
                  </span>
                ) : null}
              </button>
            </>
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected={view === 'team'}
              className={`${styles.lobbyChatTab} ${view === 'team' ? styles.lobbyChatTabActive : ''}`}
              onClick={() => setView('team')}
            >
              Командный
              {unreadTeam > 0 && view !== 'team' ? (
                <span className={styles.lobbyChatTabBadge}>{unreadTeam > 99 ? '99+' : unreadTeam}</span>
              ) : null}
            </button>
          )}
        </div>
        <div ref={listRef} className={styles.lobbyChatList}>
          {!spectator && view === 'team' && !canUseTeam ? (
            <div className={styles.lobbyChatEmpty}>Сначала выберите фракцию</div>
          ) : visible.length === 0 ? (
            <div className={styles.lobbyChatEmpty}>Пока нет сообщений</div>
          ) : (
            visible.map((m) => {
              const mine =
                (selfUserId != null && selfUserId > 0 && Number(m.userId) === selfUserId) ||
                m.username === selfLabel
              return (
                <div
                  key={m.id}
                  className={`${styles.lobbyChatRow} ${mine ? styles.lobbyChatRowMine : ''}`}
                >
                  <div className={styles.lobbyChatMeta}>
                    <span className={styles.lobbyChatName}>{m.username}</span>
                    <span className={styles.lobbyChatTime}>{formatChatTime(m.ts)}</span>
                  </div>
                  <div className={styles.lobbyChatText}>{m.text}</div>
                </div>
              )
            })
          )}
        </div>
        {error ? <div className={styles.lobbyChatError}>{error}</div> : null}
        {readOnly ? (
          <div className={styles.lobbyChatEmpty}>Наблюдатель не может писать в чат</div>
        ) : (
          <form
            className={styles.lobbyChatForm}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <input
              className={styles.lobbyChatInput}
              type="text"
              maxLength={240}
              placeholder={
                sendChannel === 'team'
                  ? canUseTeam
                    ? 'Сообщение команде…'
                    : 'Выберите фракцию'
                  : 'Сообщение всем…'
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending || (sendChannel === 'team' && !canUseTeam)}
            />
            <button className={styles.lobbyChatSend} type="submit" disabled={!canSend}>
              Отправить
            </button>
          </form>
        )}
      </div>
    </Modal>
  )
}

export default LobbyRoomChat

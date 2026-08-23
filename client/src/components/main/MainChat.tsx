import React, { useEffect, useMemo, useRef, useState } from 'react'
import styles from '../styleModules/mainBlock.module.css'
import { decorateLobbyNick, lobbyNickClass, type LobbyChatMessage } from '../../api/lobbyHub'
import { useAuth } from '../../context/AuthContext'
import { isCatalogEditorAdmin } from '../../utils/catalogEditorAdmin'

const CHAT_COOLDOWN_MS = 5_000

function formatChatTime(ts: number): string {
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

type NickMenu = { messageId: number; userId: number; username: string }

type MainChatProps = {
  messages: LobbyChatMessage[]
  sending: boolean
  error: string | null
  muted: boolean
  lastSentAt: number
  onSend: (text: string) => Promise<void>
  onViewProfile: (userId: number) => void
}

const MainChat: React.FC<MainChatProps> = ({
  messages,
  sending,
  error,
  muted,
  lastSentAt,
  onSend,
  onViewProfile,
}) => {
  const { user } = useAuth()
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now())
  const [nickMenu, setNickMenu] = useState<NickMenu | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastId = messages.length ? messages[messages.length - 1].id : 0

  const rows = useMemo(() => messages, [messages])
  const skipCooldown = isCatalogEditorAdmin(user?.username)
  const cdLeft = muted || skipCooldown ? 0 : Math.max(0, CHAT_COOLDOWN_MS - (now - lastSentAt))
  const cdSec = Math.ceil(cdLeft / 1000)
  const canSend = !muted && !sending && draft.trim() && cdLeft <= 0

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lastId])

  useEffect(() => {
    if (cdLeft <= 0) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [cdLeft])

  useEffect(() => {
    if (!nickMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest(`.${styles.chatNickWrap}`)) return
      setNickMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNickMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [nickMenu])

  const submit = async () => {
    const text = draft.trim()
    if (!text || !canSend) return
    setDraft('')
    await onSend(text)
  }

  return (
    <aside className={styles.chatPanel} aria-label="Общий чат">
      <div className={styles.chatTitle}>Чат</div>
      <div ref={listRef} className={styles.chatList}>
        {rows.length === 0 ? (
          <div className={styles.chatEmpty}>Пока нет сообщений</div>
        ) : (
          rows.map((m) => {
            const mine = user != null && Number(m.userId) === Number(user.id)
            const clickable = !m.system && Number(m.userId) > 0
            const open = nickMenu != null && nickMenu.messageId === m.id
            return (
              <div
                key={m.id}
                className={`${styles.chatRow} ${mine ? styles.chatRowMine : ''} ${m.system ? styles.chatRowSystem : ''}`}
              >
                <div className={styles.chatMeta}>
                  {clickable ? (
                    <span className={styles.chatNickWrap}>
                      <button
                        type="button"
                        className={`${styles.chatNameBtn} ${styles[lobbyNickClass(m.roleKey, m.highlight)] || ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setNickMenu({
                            messageId: m.id,
                            userId: Number(m.userId),
                            username: m.username,
                          })
                        }}
                      >
                        {decorateLobbyNick(m.username, m.roleKey, m.highlight)}
                      </button>
                      {open ? (
                        <div className={styles.chatNickMenu} role="menu">
                          <button
                            type="button"
                            className={styles.chatNickMenuItem}
                            onClick={() => {
                              setNickMenu(null)
                              onViewProfile(Number(m.userId))
                            }}
                          >
                            Посмотреть профиль
                          </button>
                        </div>
                      ) : null}
                    </span>
                  ) : (
                    <span className={`${styles.chatName} ${m.system ? styles.chatNameSystem : ''}`}>
                      {m.username}
                    </span>
                  )}
                  <span className={styles.chatTime}>{formatChatTime(m.ts)}</span>
                </div>
                <div className={styles.chatText}>{m.text}</div>
              </div>
            )
          })
        )}
      </div>
      {muted ? <div className={styles.chatMuted}>Вы получили системный мут</div> : null}
      {error && !muted ? <div className={styles.chatError}>{error}</div> : null}
      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          className={styles.chatInput}
          type="text"
          maxLength={240}
          placeholder={muted ? 'Чат недоступен' : 'Сообщение…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending || muted}
        />
        <button className={styles.chatSend} type="submit" disabled={!canSend}>
          {cdLeft > 0 && !muted ? `${cdSec} с` : 'Отправить'}
        </button>
      </form>
    </aside>
  )
}

export default MainChat

import { useCallback, useEffect, useState } from 'react'
import {
  fetchLobbyState,
  sendLobbyChat,
  LobbyHubError,
  type LobbyChatMessage,
} from '../../api/lobbyHub'

export function useSiteChat(pollMs = 2000) {
  const [messages, setMessages] = useState<LobbyChatMessage[]>([])
  const [muted, setMuted] = useState(false)

  const apply = useCallback((next: { messages: LobbyChatMessage[]; muted: boolean }) => {
    setMessages(next.messages)
    setMuted(next.muted)
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const state = await fetchLobbyState()
        if (cancelled) return
        apply(state)
      } catch {
        /* сеть / нет сессии */
      }
    }
    void tick()
    const id = window.setInterval(tick, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [apply, pollMs])

  const send = useCallback(async (text: string) => {
    try {
      const state = await sendLobbyChat(text)
      apply(state)
    } catch (e) {
      if (e instanceof LobbyHubError && e.state) apply(e.state)
      throw e instanceof Error ? e : new Error('Не удалось отправить')
    }
  }, [apply])

  return { messages, muted, send }
}

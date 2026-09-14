import React, { useEffect, useState } from 'react'
import styles from '../styleModules/listMain.module.css'
import Button from '../Button'
import {
  fetchSavedMaps,
  moderateSavedMap,
  type SavedMapListItem,
} from '../../api/maps'

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'легко',
  normal: 'нормально',
  hard: 'сложно',
}

interface SoloPlayPanelProps {
  onPlay: (map: SavedMapListItem) => void | Promise<void>
  playingMapId?: number | null
}

const SoloPlayPanel: React.FC<SoloPlayPanelProps> = ({ onPlay, playingMapId }) => {
  const [maps, setMaps] = useState<SavedMapListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const { maps: list } = await fetchSavedMaps({ solo: true })
      setMaps(list)
    } catch (e) {
      setMaps([])
      setError(e instanceof Error ? e.message : 'Не удалось загрузить карты')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const moderate = async (m: SavedMapListItem, action: 'approve' | 'reject') => {
    if (busyId != null) return
    setBusyId(m.id)
    try {
      await moderateSavedMap(m.id, action)
      await reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось изменить статус карты')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.listWrap}>
      <h2 className={styles.listHeading}>Одиночная игра</h2>
      <p className={styles.soloHint}>
        Карты на двоих: вы против бота. Появляются после проверки, как в редакторе карт.
      </p>
      {loading && <p className={styles.listLoadingLobby}>Загрузка карт…</p>}
      {error && maps.length > 0 && <p className={styles.listHint}>{error}</p>}
      <div className={styles.listBody}>
        {loading && maps.length === 0 ? (
          <p className={styles.listHintMuted}>Получаем список одиночных карт</p>
        ) : !loading && maps.length === 0 ? (
          <p className={styles.listHint}>
            {error ??
              'Пока нет одиночных карт. В редакторе задайте 2 игрока, один слот «Бот», сохраните карту и дождитесь проверки.'}
          </p>
        ) : (
          maps.map((m) => {
            const owner = String(m.ownerUsername || '').trim()
            const ownerKey = owner.toLowerCase()
            const canModerateDecision = Boolean(m.canModerate) && ownerKey !== 'mstislaw'
            const pendingPlayerMap = m.moderationStatus === 'pending' && ownerKey !== 'mstislaw'
            const difficulty = DIFFICULTY_LABEL[m.botDifficulty || ''] || DIFFICULTY_LABEL.normal
            const playing = playingMapId === m.id
            const busy = busyId != null || playingMapId != null
            const canPlay =
              Boolean(m.canModerate) || m.moderationStatus === 'approved' || !m.moderationStatus
            return (
              <div key={m.id} className={styles.roomMain}>
                <div className={styles.soloNameWrap}>
                  <div className={styles.soloTitleRow}>
                    <span className={styles.roomName}>{m.name.trim() || `Карта #${m.id}`}</span>
                    {pendingPlayerMap ? (
                      <span className={styles.soloStatusPending}>На проверке</span>
                    ) : m.moderationStatus === 'rejected' ? (
                      <span className={styles.soloStatusRejected}>Отклонена</span>
                    ) : null}
                  </div>
                  <div className={styles.soloAuthor}>
                    Автор: {owner || 'неизвестен'} · бот ({difficulty})
                  </div>
                </div>
                <div className={styles.soloRowActions}>
                  {canModerateDecision ? (
                    <>
                      <Button
                        name="Принять"
                        size={110}
                        disabled={busy || m.moderationStatus === 'approved'}
                        onClick={() => void moderate(m, 'approve')}
                      />
                      <Button
                        name="Отклонить"
                        size={110}
                        disabled={busy || m.moderationStatus === 'rejected'}
                        onClick={() => void moderate(m, 'reject')}
                      />
                    </>
                  ) : null}
                  <Button
                    name={playing ? 'Запуск…' : 'Играть'}
                    size={140}
                    disabled={busy || !canPlay}
                    onClick={() => void onPlay(m)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SoloPlayPanel

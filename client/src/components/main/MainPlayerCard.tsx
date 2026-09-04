import React, { useRef, useState } from 'react'
import styles from '../styleModules/mainBlock.module.css'
import Button from '../Button'
import Modal from '../Modal'
import {
  ASSIGNABLE_ROLES,
  BAN_DURATION_OPTIONS,
  MUTE_DURATION_OPTIONS,
  UNIT_KILL_LABELS,
  canBanPlayers,
  canMutePlayers,
  decorateLobbyNick,
  lobbyNickClass,
  moderateLobbyPlayer,
  resolveLobbyAssetUrl,
  setLobbyPlayerRole,
  uploadLobbyAvatar,
  type LobbyModerationAction,
  type LobbyPlayerProfile,
  type LobbyRoleKey,
} from '../../api/lobbyHub'
import { useAuth } from '../../context/AuthContext'
import { isCatalogEditorAdmin } from '../../utils/catalogEditorAdmin'

const AVATAR_MIN_PX = 96
const AVATAR_MAX_PX = 512
const AVATAR_HINT = `Разрешение ${AVATAR_MIN_PX}×${AVATAR_MIN_PX}–${AVATAR_MAX_PX}×${AVATAR_MAX_PX} px, лучше квадрат. JPEG, PNG или WebP, до 2 МБ.`

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать изображение'))
    }
    img.src = url
  })
}

function formatLastSeen(online: boolean, iso: string | null): string {
  if (online) return 'сейчас'
  if (!iso) return 'нет данных'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'нет данных'
  return d.toLocaleString('ru-RU')
}

function formatProfileDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
}

function formatUntil(active: boolean, until: number | null): string | null {
  if (!active) return null
  if (until == null || !Number.isFinite(until)) return 'навсегда'
  return new Date(until).toLocaleString('ru-RU')
}

type MainPlayerCardProps = {
  profile: LobbyPlayerProfile | null
  loading: boolean
  error: string | null
  onClose: () => void
  onProfileUpdate: (profile: LobbyPlayerProfile) => void
  viewerRoleKey: LobbyRoleKey
}

const MainPlayerCard: React.FC<MainPlayerCardProps> = ({
  profile,
  loading,
  error,
  onClose,
  onProfileUpdate,
  viewerRoleKey,
}) => {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [roleBusy, setRoleBusy] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const own = profile != null && user != null && Number(profile.id) === Number(user.id)
  const canEditRole = isCatalogEditorAdmin(user?.username) && profile != null && !profile.highlight
  const viewerIsAdmin = viewerRoleKey === 'admin'
  const canMute = canMutePlayers(viewerRoleKey, viewerIsAdmin)
  const canBan = canBanPlayers(viewerRoleKey, viewerIsAdmin)
  const canAct =
    profile != null &&
    !own &&
    !profile.highlight &&
    profile.roleKey !== 'admin' &&
    (canBan || (canMute && (profile.roleKey === 'player' || profile.roleKey === 'veteran')))
  const avatarUrl = profile ? resolveLobbyAssetUrl(profile.avatarPath) : undefined
  const nickClass = profile ? styles[lobbyNickClass(profile.roleKey, profile.highlight)] : undefined

  const onPickAvatar = async (file: File | undefined) => {
    if (!file || !own) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      const { width, height } = await readImageSize(file)
      if (
        width < AVATAR_MIN_PX ||
        height < AVATAR_MIN_PX ||
        width > AVATAR_MAX_PX ||
        height > AVATAR_MAX_PX
      ) {
        throw new Error(`Разрешение ${width}×${height} не подходит. Нужно ${AVATAR_MIN_PX}×${AVATAR_MIN_PX}–${AVATAR_MAX_PX}×${AVATAR_MAX_PX} px.`)
      }
      const next = await uploadLobbyAvatar(file)
      onProfileUpdate(next)
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Не удалось загрузить аватар')
    } finally {
      setAvatarBusy(false)
    }
  }

  const onModerate = async (raw: string) => {
    if (!profile || !raw) return
    const [action, duration] = raw.split(':') as [LobbyModerationAction, string | undefined]
    if (action !== 'mute' && action !== 'unmute' && action !== 'ban' && action !== 'unban') return
    setActionBusy(true)
    setActionError(null)
    try {
      const next = await moderateLobbyPlayer(profile.id, action, duration)
      onProfileUpdate(next)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось выполнить действие')
    } finally {
      setActionBusy(false)
    }
  }

  const muteUntil = profile ? formatUntil(profile.muted, profile.mutedUntil) : null
  const banUntil = profile ? formatUntil(profile.banned, profile.bannedUntil) : null

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      elevated
      title={
        profile ? (
          <span className={nickClass}>{decorateLobbyNick(profile.username, profile.roleKey, profile.highlight)}</span>
        ) : (
          'Профиль игрока'
        )
      }
      subtitle={profile?.role}
      footer={<Button name="Закрыть" size={380} onClick={onClose} />}
    >
      {loading ? (
        <p className={styles.profileHint}>Загрузка…</p>
      ) : error ? (
        <p className={styles.chatError}>{error}</p>
      ) : profile ? (
        <div className={styles.profileModal}>
          <div className={styles.profileCard}>
            {own ? (
              <button
                type="button"
                className={`${styles.profileAvatar} ${profile.highlight ? styles.profileAvatarAdmin : ''} ${styles.profileAvatarUpload}`}
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                title={AVATAR_HINT}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={styles.profileAvatarImg} />
                ) : (
                  profile.username.slice(0, 1).toUpperCase()
                )}
              </button>
            ) : (
              <div className={`${styles.profileAvatar} ${profile.highlight ? styles.profileAvatarAdmin : ''}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={styles.profileAvatarImg} />
                ) : (
                  profile.username.slice(0, 1).toUpperCase()
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onPickAvatar(file)
              }}
            />
            <div className={styles.profileRows}>
              <div className={styles.profileRow}>
                <span>Ник</span>
                <strong className={nickClass}>
                  {decorateLobbyNick(profile.username, profile.roleKey, profile.highlight)}
                </strong>
              </div>
              <div className={styles.profileRow}>
                <span>Статус</span>
                <strong>{profile.online ? 'В сети' : 'Не в сети'}</strong>
              </div>
              <div className={styles.profileRow}>
                <span>Был в сети</span>
                <strong>{formatLastSeen(profile.online, profile.lastSeenAt)}</strong>
              </div>
              <div className={styles.profileRow}>
                <span>Роль</span>
                {canEditRole ? (
                  <select
                    className={styles.profileRoleSelect}
                    value={profile.roleKey === 'admin' ? 'player' : profile.roleKey}
                    disabled={roleBusy}
                    onChange={(e) => {
                      const next = e.target.value
                      if (
                        next !== 'player' &&
                        next !== 'moderator' &&
                        next !== 'veteran' &&
                        next !== 'veteran_moderator'
                      ) {
                        return
                      }
                      setRoleBusy(true)
                      setRoleError(null)
                      void setLobbyPlayerRole(profile.id, next)
                        .then(onProfileUpdate)
                        .catch((err) => {
                          setRoleError(err instanceof Error ? err.message : 'Не удалось изменить роль')
                        })
                        .finally(() => setRoleBusy(false))
                    }}
                  >
                    {ASSIGNABLE_ROLES.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong>{profile.role}</strong>
                )}
              </div>
              {canAct ? (
                <div className={styles.profileRow}>
                  <span>Действия</span>
                  <select
                    className={styles.profileRoleSelect}
                    defaultValue=""
                    disabled={actionBusy}
                    onChange={(e) => {
                      const value = e.target.value
                      e.target.value = ''
                      void onModerate(value)
                    }}
                  >
                    <option value="">{actionBusy ? 'Выполняется…' : 'Выберите действие'}</option>
                    {canMute ? (
                      <>
                        {MUTE_DURATION_OPTIONS.filter((row) => !row.adminOnly || viewerIsAdmin).map((row) => (
                          <option key={`mute:${row.value}`} value={`mute:${row.value}`}>
                            {row.label}
                          </option>
                        ))}
                        <option value="unmute">Размутить</option>
                      </>
                    ) : null}
                    {canBan ? (
                      <>
                        {BAN_DURATION_OPTIONS.map((row) => (
                          <option key={`ban:${row.value}`} value={`ban:${row.value}`}>
                            {row.label}
                          </option>
                        ))}
                        <option value="unban">Разбанить</option>
                      </>
                    ) : null}
                  </select>
                </div>
              ) : null}
              <div className={styles.profileRow}>
                <span>Регистрация</span>
                <strong>{formatProfileDate(profile.createdAt)}</strong>
              </div>
              <div className={styles.profileRow}>
                <span>Победы</span>
                <strong>{profile.wins}</strong>
              </div>
              <div className={styles.profileRow}>
                <span>Поражения</span>
                <strong>{profile.losses}</strong>
              </div>
            </div>
          </div>
          {muteUntil ? <p className={styles.profileHint}>Мут: {muteUntil}</p> : null}
          {banUntil ? <p className={styles.profileHint}>Бан: {banUntil}</p> : null}
          {own ? (
            <p className={styles.profileHint}>
              {avatarBusy
                ? 'Загрузка аватара…'
                : `Нажмите на аватар, чтобы загрузить изображение. ${AVATAR_HINT}`}
            </p>
          ) : null}
          {avatarError ? <p className={styles.chatError}>{avatarError}</p> : null}
          {roleError ? <p className={styles.chatError}>{roleError}</p> : null}
          {actionError ? <p className={styles.chatError}>{actionError}</p> : null}
          <div className={styles.profileKills}>
            <h3 className={styles.profileKillsTitle}>Уничтоженные юниты</h3>
            <div className={styles.profileKillGrid}>
              {UNIT_KILL_LABELS.map((row) => {
                const n = Number(profile.kills?.[row.key] ?? 0)
                return (
                  <div key={row.key} className={styles.profileKillRow}>
                    <span>{row.label}</span>
                    <strong>{Number.isFinite(n) ? n : 0}</strong>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

export default MainPlayerCard

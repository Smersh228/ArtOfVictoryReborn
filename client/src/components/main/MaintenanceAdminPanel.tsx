import React, { useCallback, useEffect, useMemo, useState } from 'react'
import styles from '../styleModules/mainBlock.module.css'
import {
  addMaintenanceAllowlistUser,
  fetchMaintenanceAdminState,
  fetchMaintenanceRegisteredUsers,
  removeMaintenanceAllowlistUser,
  setMaintenanceEnabled,
  type MaintenanceState,
  type RegisteredUserRow,
} from '../../api/maintenance'

export default function MaintenanceAdminPanel({ inModal = false }: { inModal?: boolean }) {
  const [state, setState] = useState<MaintenanceState | null>(null)
  const [registered, setRegistered] = useState<RegisteredUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState('')
  const [pickUserId, setPickUserId] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [next, users] = await Promise.all([
        fetchMaintenanceAdminState(),
        fetchMaintenanceRegisteredUsers(),
      ])
      setState(next)
      setRegistered(users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const allowlistSet = useMemo(() => {
    const s = new Set<string>()
    for (const row of state?.allowlist ?? []) {
      s.add(String(row.username).trim().toLowerCase())
    }
    return s
  }, [state?.allowlist])

  const addableUsers = useMemo(() => {
    return registered.filter((u) => {
      if (u.isAdmin) return false
      if (u.onAllowlist || allowlistSet.has(u.username.trim().toLowerCase())) return false
      const q = userFilter.trim().toLowerCase()
      if (!q) return true
      return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [registered, allowlistSet, userFilter])

  useEffect(() => {
    if (!pickUserId) return
    const still = addableUsers.some((u) => String(u.id) === pickUserId)
    if (!still) setPickUserId('')
  }, [addableUsers, pickUserId])

  const toggleMaintenance = async () => {
    if (!state || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await setMaintenanceEnabled(!state.enabled)
      setState(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить режим')
    } finally {
      setBusy(false)
    }
  }

  const addPickedUser = async (e: React.FormEvent) => {
    e.preventDefault()
    const picked = registered.find((u) => String(u.id) === pickUserId)
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await addMaintenanceAllowlistUser(picked.username)
      setState(next)
      setPickUserId('')
      const users = await fetchMaintenanceRegisteredUsers()
      setRegistered(users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить игрока')
    } finally {
      setBusy(false)
    }
  }

  const addUserByRow = async (username: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await addMaintenanceAllowlistUser(username)
      setState(next)
      const users = await fetchMaintenanceRegisteredUsers()
      setRegistered(users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить игрока')
    } finally {
      setBusy(false)
    }
  }

  const removeLogin = async (username: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await removeMaintenanceAllowlistUser(username)
      setState(next)
      const users = await fetchMaintenanceRegisteredUsers()
      setRegistered(users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить логин')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={`${styles.maintenancePanel} ${inModal ? styles.maintenancePanelInModal : ''}`}
      aria-label="Технические работы"
    >
      {!inModal ? <h2 className={styles.maintenanceTitle}>Технические работы</h2> : null}
      <p className={styles.maintenanceHint}>
        При включении в игру смогут зайти только вы и игроки из белого списка.
      </p>

      {loading ? (
        <p className={styles.maintenanceHint}>Загрузка…</p>
      ) : (
        <>
          <label className={styles.maintenanceToggle}>
            <input
              type="checkbox"
              checked={state?.enabled === true}
              disabled={busy}
              onChange={() => void toggleMaintenance()}
            />
            <span>{state?.enabled ? 'Включено — сайт закрыт для остальных' : 'Выключено — все могут играть'}</span>
          </label>

          <div className={styles.maintenanceSubTitle}>Добавить из зарегистрированных</div>
          <input
            className={styles.maintenanceInput}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Поиск по логину или email"
            disabled={busy}
          />

          <form className={styles.maintenanceAddRow} onSubmit={addPickedUser}>
            <select
              className={styles.maintenanceSelect}
              value={pickUserId}
              onChange={(e) => setPickUserId(e.target.value)}
              disabled={busy || addableUsers.length === 0}
            >
              <option value="">
                {addableUsers.length ? '— выберите игрока —' : 'Нет доступных игроков'}
              </option>
              {addableUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.username}
                  {u.email ? ` (${u.email})` : ''}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.maintenanceBtn} disabled={busy || !pickUserId}>
              Добавить
            </button>
          </form>

          <ul className={styles.maintenanceRegisteredList}>
            {registered.length === 0 ? (
              <li className={styles.maintenanceListEmpty}>Нет зарегистрированных пользователей</li>
            ) : (
              registered.map((u) => {
                const onList =
                  u.isAdmin || u.onAllowlist || allowlistSet.has(u.username.trim().toLowerCase())
                return (
                  <li key={u.id} className={styles.maintenanceRegisteredItem}>
                    <div className={styles.maintenanceRegisteredMeta}>
                      <span className={styles.maintenanceRegisteredName}>{u.username}</span>
                      {u.email ? <span className={styles.maintenanceRegisteredEmail}>{u.email}</span> : null}
                    </div>
                    {u.isAdmin ? (
                      <span className={styles.maintenanceBadgeAdmin}>админ</span>
                    ) : onList ? (
                      <span className={styles.maintenanceBadgeOk}>в списке</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.maintenanceAddSmallBtn}
                        disabled={busy}
                        onClick={() => void addUserByRow(u.username)}
                      >
                        Добавить
                      </button>
                    )}
                  </li>
                )
              })
            )}
          </ul>

          <div className={styles.maintenanceSubTitle}>Белый список</div>
          <ul className={styles.maintenanceList}>
            {!state?.allowlist.length ? (
              <li className={styles.maintenanceListEmpty}>Белый список пуст</li>
            ) : (
              state.allowlist.map((row) => (
                <li key={row.username} className={styles.maintenanceListItem}>
                  <span>{row.username}</span>
                  <button
                    type="button"
                    className={styles.maintenanceRemoveBtn}
                    disabled={busy}
                    onClick={() => void removeLogin(row.username)}
                  >
                    Удалить
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {error ? (
        <p className={styles.maintenanceError} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

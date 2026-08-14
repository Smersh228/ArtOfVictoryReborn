import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './styleModules/auth.module.css'
import buttonStyles from '../components/styleModules/button.module.css'
import { login, register } from '../api/auth'
import { fetchMaintenancePublicStatus } from '../api/maintenance'
import { useAuth } from '../context/AuthContext'

type Mode = 'login' | 'register'

const Auth: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const rawFrom = (location.state as { from?: string } | null)?.from || '/main'
  const maintenanceFromState = (location.state as { maintenance?: string } | null)?.maintenance
  const from =
    rawFrom === '/auth' || rawFrom.startsWith('/auth?') || rawFrom === '/' ? '/main' : rawFrom
  const { setUser, setMaintenanceNotice } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [maintenanceBanner, setMaintenanceBanner] = useState<string | null>(maintenanceFromState ?? null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const st = await fetchMaintenancePublicStatus()
      if (cancelled) return
      if (st.enabled) setMaintenanceBanner(st.message)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (maintenanceFromState) setMaintenanceBanner(maintenanceFromState)
  }, [maintenanceFromState])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      if (mode === 'register') {
        const uname = username.trim()
        if (uname.length > 13) {
          setError('Ник должен быть не длиннее 13 символов')
          return
        }
        const r = await register(uname, email.trim(), password)
        if (r.maintenance) {
          setMaintenanceBanner(r.message || 'Идут технические работы. Зайдите позже.')
          setError(r.message || 'Идут технические работы. Зайдите позже.')
          return
        }
        if (r.success && r.user) {
          setMaintenanceNotice(null)
          setUser(r.user)
          navigate(from, { replace: true })
          return
        }
        setError(r.message || 'Не удалось зарегистрироваться')
      } else {
        const r = await login(identifier.trim(), password)
        if (r.maintenance) {
          setMaintenanceBanner(r.message || 'Идут технические работы. Зайдите позже.')
          setError(r.message || 'Идут технические работы. Зайдите позже.')
          return
        }
        if (r.success && r.user) {
          setMaintenanceNotice(null)
          setUser(r.user)
          navigate(from, { replace: true })
          return
        }
        setError(r.message || 'Не удалось войти')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.card}>
        <h1 className={styles.title}>Вход и регистрация</h1>

        {maintenanceBanner ? (
          <p className={styles.maintenanceBanner} role="status">
            {maintenanceBanner}
          </p>
        ) : null}

        <div className={styles.tabs} role="tablist" aria-label="Режим">
          <div
            role="tab"
            aria-selected={mode === 'login'}
            className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            Вход
          </div>
          <div
            role="tab"
            aria-selected={mode === 'register'}
            className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            Регистрация
          </div>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="auth-username">
                Имя пользователя
              </label>
              <input
                id="auth-username"
                className={styles.input}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={13}
              />
            </div>
          )}

          {mode === 'register' ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="auth-identifier">
                Email или имя пользователя
              </label>
              <input
                id="auth-identifier"
                className={styles.input}
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-password">
              Пароль
            </label>
            <input
              id="auth-password"
              className={styles.input}
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 6 : undefined}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="submit"
              disabled={pending}
              className={buttonStyles.button}
              style={{ width: '100%', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}
            >
              {pending ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Auth

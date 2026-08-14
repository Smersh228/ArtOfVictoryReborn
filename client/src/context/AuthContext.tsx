import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '../api/auth'
import { logoutRequest, verifySession } from '../api/auth'

type AuthContextValue = {
  user: User | null
  loading: boolean
  maintenanceNotice: string | null
  refresh: () => Promise<void>
  setUser: (u: User | null) => void
  setMaintenanceNotice: (msg: string | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [maintenanceNotice, setMaintenanceNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await verifySession()
    if (r.success && r.user) {
      setUser(r.user)
      setMaintenanceNotice(null)
      return
    }
    setUser(null)
    if (r.maintenance) {
      setMaintenanceNotice(r.message || 'Идут технические работы. Зайдите позже.')
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
    setMaintenanceNotice(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      user,
      loading,
      maintenanceNotice,
      refresh,
      setUser,
      setMaintenanceNotice,
      logout,
    }),
    [user, loading, maintenanceNotice, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

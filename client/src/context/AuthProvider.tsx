import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '../api/auth'
import { logoutRequest, verifySession } from '../api/auth'
import { leaveLobbyPresence, sendLobbyHeartbeat } from '../api/lobbyHub'
import { leaveActiveLobbyRoom, leaveActiveLobbyRoomAwait } from '../api/rooms'
import { AuthContext } from './authContext'

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
    await leaveActiveLobbyRoomAwait()
    leaveLobbyPresence()
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

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const kickIfMaintenance = async () => {
      const r = await verifySession()
      if (cancelled) return
      if (r.maintenance) {
        setUser(null)
        setMaintenanceNotice(r.message || 'Идут технические работы. Зайдите позже.')
      }
    }
    const beat = () => {
      if (cancelled) return
      void sendLobbyHeartbeat()
        .then(() => undefined)
        .catch(() => {
          void kickIfMaintenance()
        })
    }
    beat()
    const heartId = window.setInterval(beat, 12_000)
    const watchId = window.setInterval(() => {
      void kickIfMaintenance()
    }, 4000)
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return
      leaveLobbyPresence()
      leaveActiveLobbyRoom()
    }
    const onShow = () => {
      beat()
      void kickIfMaintenance()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onShow()
    }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(heartId)
      window.clearInterval(watchId)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', onVisibility)
      leaveLobbyPresence()
    }
  }, [user])

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

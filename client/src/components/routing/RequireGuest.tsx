import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'


export const RequireGuest: React.FC = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-route-loading" role="status" aria-live="polite">
        Загрузка…
      </div>
    )
  }

  if (user) {
    return <Navigate to="/main" replace />
  }

  return <Outlet />
}

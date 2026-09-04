import { createContext, useContext, type Context } from 'react'
import type { User } from '../api/auth'

export type AuthContextValue = {
  user: User | null
  loading: boolean
  maintenanceNotice: string | null
  refresh: () => Promise<void>
  setUser: (u: User | null) => void
  setMaintenanceNotice: (msg: string | null) => void
  logout: () => Promise<void>
}

const authContextSlot = globalThis as typeof globalThis & {
  __aovAuthContext?: Context<AuthContextValue | null>
}

export const AuthContext =
  authContextSlot.__aovAuthContext ?? createContext<AuthContextValue | null>(null)
authContextSlot.__aovAuthContext = AuthContext

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

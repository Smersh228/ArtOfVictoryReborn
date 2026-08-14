import { apiBaseUrl } from './editorCatalog'

function authApiUrl(path: string): string {
  const base = apiBaseUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}/api/auth${p}` : `/api/auth${p}`
}

export interface User {
  id: number
  username: string
  email: string
}

export interface AuthResponse {
  success: boolean
  user?: User
  message?: string
  maintenance?: boolean
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export const register = async (username: string, email: string, password: string): Promise<AuthResponse> => {
  try {
    const res = await fetch(authApiUrl('/register'), {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ username, email, password }),
    })
    const data = (await res.json()) as AuthResponse
    if (res.status === 503 && data.maintenance) {
      return { success: false, maintenance: true, message: data.message || 'Идут технические работы. Зайдите позже.' }
    }
    return data
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}

export const login = async (usernameOrEmail: string, password: string): Promise<AuthResponse> => {
  try {
    const res = await fetch(authApiUrl('/login'), {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ usernameOrEmail, password }),
    })
    const data = (await res.json()) as AuthResponse
    if (res.status === 503 && data.maintenance) {
      return { success: false, maintenance: true, message: data.message || 'Идут технические работы. Зайдите позже.' }
    }
    return data
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}


export const verifySession = async (): Promise<AuthResponse> => {
  try {
    const res = await fetch(authApiUrl('/verify'), { credentials: 'include' })
    const data = (await res.json()) as AuthResponse
    if (res.status === 503 && data.maintenance) {
      return {
        success: false,
        maintenance: true,
        message: data.message || 'Идут технические работы. Зайдите позже.',
      }
    }
    return data
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}

export const logoutRequest = async (): Promise<void> => {
  try {
    await fetch(authApiUrl('/logout'), { method: 'POST', credentials: 'include' })
  } catch {
    
  }
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000'
const API_URL = `${API_ORIGIN}/api/auth`

export interface User {
  id: number
  username: string
  email: string
}

export interface AuthResponse {
  success: boolean
  user?: User
  message?: string
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export const register = async (username: string, email: string, password: string): Promise<AuthResponse> => {
  try {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ username, email, password }),
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}

export const login = async (usernameOrEmail: string, password: string): Promise<AuthResponse> => {
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: jsonHeaders,
      credentials: 'include',
      body: JSON.stringify({ usernameOrEmail, password }),
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}


export const verifySession = async (): Promise<AuthResponse> => {
  try {
    const res = await fetch(`${API_URL}/verify`, { credentials: 'include' })
    return await res.json()
  } catch {
    return { success: false, message: 'Ошибка соединения с сервером' }
  }
}

export const logoutRequest = async (): Promise<void> => {
  try {
    await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' })
  } catch {
    
  }
}

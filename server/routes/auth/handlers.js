const { register, login, verifyToken } = require('../../db')
const { setAuthCookie, clearAuthCookie, getTokenFromRequest } = require('../../cookieAuth')

async function registerHandler(req, res) {
  const { username, email, password } = req.body

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Заполните все поля' })
  }
  if (String(username).trim().length > 13) {
    return res.status(400).json({ success: false, message: 'Ник должен быть не длиннее 13 символов' })
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Пароль должен быть не менее 6 символов' })
  }

  const result = await register(username, email, password)

  if (result.success) {
    setAuthCookie(res, result.token)
    return res.json({ success: true, user: result.user })
  }
  return res.status(400).json({ success: false, message: result.message })
}

async function loginHandler(req, res) {
  try {
    const { usernameOrEmail, password } = req.body

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ success: false, message: 'Заполните все поля' })
    }

    const result = await login(usernameOrEmail, password)

    if (result.success) {
      setAuthCookie(res, result.token)
      return res.json({ success: true, user: result.user })
    }
    return res.status(401).json({ success: false, message: result.message })
  } catch (e) {
    console.error('POST /api/auth/login:', e)
    return res.status(500).json({ success: false, message: 'Ошибка сервера' })
  }
}

function logoutHandler(_req, res) {
  clearAuthCookie(res)
  res.json({ success: true })
}

async function verifyHandler(req, res) {
  try {
    const token = getTokenFromRequest(req)

    if (!token) {
      return res.status(401).json({ success: false, message: 'Нет токена' })
    }

    const user = await verifyToken(token)

    if (user) {
      return res.json({ success: true, user })
    }
    return res.status(401).json({ success: false, message: 'Неверный или просроченный токен' })
  } catch (e) {
    console.error('GET /api/auth/verify:', e)
    return res.status(500).json({ success: false, message: 'Ошибка сервера' })
  }
}

module.exports = {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyHandler,
}

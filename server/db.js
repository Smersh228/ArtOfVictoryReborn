const { Pool } = require('pg')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

pool.connect((err, client, release) => {
  if (err) {
    console.error('Ошибка подключения к PostgreSQL:', err.message)
  }
  if (client) release()
})

async function register(username, email, password) {
  let client
  try {
    client = await pool.connect()
    const check = await client.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    )
    
    if (check.rows.length > 0) {
      return { success: false, message: 'Пользователь уже существует' }
    }
    
    const hash = await bcrypt.hash(password, 10)
    
    const result = await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ($1, $2, $3) RETURNING id, username, email`,
      [username, email, hash]
    )
    
    const user = result.rows[0]
    
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    return {
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      token
    }
  } catch (err) {
    console.error('Ошибка регистрации:', err)
    return { success: false, message: 'Ошибка сервера' }
  } finally {
    if (client) client.release()
  }
}

async function login(usernameOrEmail, password) {
  let client
  try {
    client = await pool.connect()
    const result = await client.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1 OR email = $1',
      [usernameOrEmail]
    )
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Пользователь не найден' }
    }
    
    const user = result.rows[0]
    
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return { success: false, message: 'Неверный пароль' }
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    return {
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      token
    }
  } catch (err) {
    console.error('Ошибка логина:', err)
    return { success: false, message: 'Ошибка сервера' }
  } finally {
    if (client) client.release()
  }
}

async function verifyToken(token) {
  if (!token || !process.env.JWT_SECRET) return null
  let client
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    client = await pool.connect()
    const result = await client.query('SELECT id, username, email FROM users WHERE id = $1', [decoded.id])
    if (result.rows.length === 0) return null
    return result.rows[0]
  } catch (err) {
    return null
  } finally {
    if (client) client.release()
  }
}

module.exports = { register, login, verifyToken, pool }
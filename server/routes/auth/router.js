const express = require('express')
const {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyHandler,
} = require('./handlers')

const router = express.Router()

router.post('/register', registerHandler)
router.post('/login', loginHandler)
router.post('/logout', logoutHandler)
router.get('/verify', verifyHandler)

module.exports = router

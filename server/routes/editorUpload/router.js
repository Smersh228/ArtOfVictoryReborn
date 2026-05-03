const express = require('express')
const { uploadImageHandler } = require('./handlers')

const router = express.Router()

router.post('/upload', uploadImageHandler)

module.exports = router

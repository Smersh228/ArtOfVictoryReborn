const express = require('express')

const unitsRouter = require('./units')
const hexesRouter = require('./hexes')
const buildingsRouter = require('./buildings')
const rulesRouter = require('./rules')
const metaRouter = require('./meta')

const router = express.Router()

router.use(unitsRouter)
router.use(hexesRouter)
router.use(buildingsRouter)
router.use(rulesRouter)
router.use(metaRouter)

module.exports = router

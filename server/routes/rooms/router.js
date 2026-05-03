const express = require('express')
const { registerLobbyRoutes } = require('./lobbyRoutes')
const { registerBattleRoutes } = require('./battleRoutes')
const { validateSubmittedOrders } = require('./validation')

const router = express.Router()

registerLobbyRoutes(router)
registerBattleRoutes(router, { validateSubmittedOrders })

module.exports = router

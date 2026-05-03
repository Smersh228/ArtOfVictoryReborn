const express = require('express')
const {
  listMapsHandler,
  getMapHandler,
  saveMapHandler,
  moderateMapHandler,
  deleteMapHandler,
} = require('./handlers')

const router = express.Router()

router.get('/', listMapsHandler)
router.get('/:id', getMapHandler)
router.post('/', saveMapHandler)
router.post('/:id/moderate', moderateMapHandler)
router.delete('/:id', deleteMapHandler)

module.exports = router

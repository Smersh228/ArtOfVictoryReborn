const { validateBattleOrders } = require('../../game/lib/support/battleOrderValidation')
const {
  memberOwnsUnit,
  normalizeSubmittedOrderKey,
  SUBMITTABLE_ORDER_KEYS,
} = require('./shared')

function validateSubmittedOrders(room, mem, orders, cells) {
  return validateBattleOrders(cells, orders, {
    ownsUnit: (unit) => memberOwnsUnit(mem, unit),
    normalizeOrderKey: normalizeSubmittedOrderKey,
    submittableOrderKeys: SUBMITTABLE_ORDER_KEYS,
  })
}

module.exports = {
  validateSubmittedOrders,
}

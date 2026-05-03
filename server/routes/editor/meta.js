const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')
const {
  ensureDefaultUnitProperties,
  ensureDefaultBattleOrders,
  UNIT_SELECT,
  mapUnitClientRow,
  mapUnitCatalog,
  mapHexClient,
  mapHexCatalog,
  mapBuildingClient,
  mapBuildingCatalog,
  mapRuleClient,
} = require('./shared')

const router = express.Router()

router.get('/orders', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await ensureDefaultBattleOrders()
    await pool.query(
      `UPDATE orders
       SET order_key = NULLIF(TRIM(code), '')
       WHERE (order_key IS NULL OR TRIM(COALESCE(order_key, '')) = '')
         AND code IS NOT NULL AND TRIM(code) <> ''`,
    )
    const result = await pool.query(
      `SELECT id_orders,
              name,
              code,
              COALESCE(NULLIF(TRIM(order_key), ''), NULLIF(TRIM(code), '')) AS order_key
         FROM orders
         ORDER BY id_orders`,
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/properties', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await ensureDefaultUnitProperties()
    const result = await pool.query(
      'SELECT id_property, name, prop_key FROM property ORDER BY id_property',
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/catalog', requireCatalogEditorAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM catalog_obj ORDER BY id_cobj')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/client/catalog', async (req, res) => {
  const out = {
    units: [],
    hexes: [],
    buildings: [],
    rules: [],
    unitsEditor: [],
    hexesEditor: [],
    buildingsEditor: [],
    rulesEditor: [],
  }
  try {
    await ensureDefaultBattleOrders()
    await ensureDefaultUnitProperties()
    try {
      const r = await pool.query(UNIT_SELECT)
      out.unitsEditor = r.rows.map(mapUnitClientRow)
      out.units = r.rows.map(mapUnitCatalog)
    } catch (e) {
      console.error('editor catalog units:', e.message)
    }
    try {
      const r = await pool.query('SELECT * FROM hex ORDER BY id_hex')
      out.hexesEditor = r.rows.map(mapHexClient)
      out.hexes = r.rows.map(mapHexCatalog)
    } catch (e) {
      console.error('editor catalog hexes:', e.message)
    }
    try {
      const r = await pool.query('SELECT * FROM build ORDER BY id_build')
      out.buildingsEditor = r.rows.map(mapBuildingClient)
      out.buildings = r.rows.map(mapBuildingCatalog)
    } catch (e) {
      console.error('editor catalog buildings:', e.message)
    }
    try {
      const r = await pool.query('SELECT * FROM rule ORDER BY id_rule')
      out.rulesEditor = r.rows.map(mapRuleClient)
      out.rules = r.rows.map((row) => {
        const m = mapRuleClient(row)
        return {
          id: m.id,
          name: m.title,
          description: m.desc,
          imagePath: m.imagePath || undefined,
          stats: m.chapter ? [`Глава: ${m.chapter}`] : [],
        }
      })
    } catch (e) {
      console.error('editor catalog rules:', e.message)
    }
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

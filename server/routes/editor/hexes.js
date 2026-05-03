const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')
const { normalizeAllowedBuildingsBody } = require('./shared')

const router = express.Router()

router.get('/hexes', requireCatalogEditorAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hex ORDER BY id_hex')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/hexes', requireCatalogEditorAdmin, async (req, res) => {
  const { id, name, defendTech, defendHuman, costMove, costMoveInf, costMoveTech, isVisible, image_path, id_cobj } =
    req.body
  const allowed_buildings = normalizeAllowedBuildingsBody(req.body)
  const inf = Number(costMoveInf ?? costMove) || 1
  const tech = Number(costMoveTech ?? costMove) || 1
  const legacyCostMove = inf
  try {
    if (id) {
      await pool.query(
        `UPDATE hex SET name=$1, "defendTech"=$2, "defendHuman"=$3, "costMoveInf"=$4, "costMoveTech"=$5, "costMove"=$6, "isVisible"=$7, image_path=$8, id_cobj=$9, allowed_buildings=$10 WHERE id_hex=$11`,
        [name, defendTech, defendHuman, inf, tech, legacyCostMove, isVisible, image_path, id_cobj || null, allowed_buildings, id],
      )
      res.json({ success: true, id, ...req.body, allowed_buildings, costMoveInf: inf, costMoveTech: tech })
    } else {
      const ins = await pool.query(
        `INSERT INTO hex (name, "defendTech", "defendHuman", "costMoveInf", "costMoveTech", "costMove", "isVisible", image_path, id_cobj, allowed_buildings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_hex`,
        [name, defendTech, defendHuman, inf, tech, legacyCostMove, isVisible, image_path, id_cobj || null, allowed_buildings],
      )
      const newId = ins.rows[0].id_hex
      res.json({
        success: true,
        id: newId,
        ...req.body,
        id_hex: newId,
        allowed_buildings,
        costMoveInf: inf,
        costMoveTech: tech,
      })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/hexes/:id', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM hex WHERE id_hex = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')
const { ensureUnitCatalogColumns, normalizeMapEditorPublic } = require('./shared')

const router = express.Router()

router.get('/rules', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await ensureUnitCatalogColumns()
    const result = await pool.query('SELECT * FROM rule ORDER BY id_rule')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/rules', requireCatalogEditorAdmin, async (req, res) => {
  const { id, name, head, description, image_path, image_path_2, image_path_3, id_cobj, mapEditorPublic } = req.body
  const mapEditorPublicFlag = normalizeMapEditorPublic(mapEditorPublic)
  try {
    await ensureUnitCatalogColumns()
    if (id) {
      await pool.query(
        `UPDATE rule SET name=$1, head=$2, description=$3, image_path=$4, image_path_2=$5, image_path_3=$6, id_cobj=$7, map_editor_public=$8 WHERE id_rule=$9`,
        [name, head, description, image_path, image_path_2 || '', image_path_3 || '', id_cobj || null, mapEditorPublicFlag, id],
      )
      res.json({ success: true, id, ...req.body, mapEditorPublic: mapEditorPublicFlag })
    } else {
      const result = await pool.query(
        `INSERT INTO rule (name, head, description, image_path, image_path_2, image_path_3, id_cobj, map_editor_public) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_rule`,
        [name, head, description, image_path, image_path_2 || '', image_path_3 || '', id_cobj || null, mapEditorPublicFlag],
      )
      const newId = result.rows[0].id_rule
      res.json({ success: true, id: newId, ...req.body, id_rule: newId, mapEditorPublic: mapEditorPublicFlag })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/rules/:id', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM rule WHERE id_rule = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

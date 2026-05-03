const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')

const router = express.Router()

router.get('/rules', requireCatalogEditorAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rule ORDER BY id_rule')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/rules', requireCatalogEditorAdmin, async (req, res) => {
  const { id, name, head, description, image_path, image_path_2, image_path_3, id_cobj } = req.body
  try {
    if (id) {
      await pool.query(
        `UPDATE rule SET name=$1, head=$2, description=$3, image_path=$4, image_path_2=$5, image_path_3=$6, id_cobj=$7 WHERE id_rule=$8`,
        [name, head, description, image_path, image_path_2 || '', image_path_3 || '', id_cobj || null, id],
      )
      res.json({ success: true, id, ...req.body })
    } else {
      const result = await pool.query(
        `INSERT INTO rule (name, head, description, image_path, image_path_2, image_path_3, id_cobj) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_rule`,
        [name, head, description, image_path, image_path_2 || '', image_path_3 || '', id_cobj || null],
      )
      const newId = result.rows[0].id_rule
      res.json({ success: true, id: newId, ...req.body, id_rule: newId })
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

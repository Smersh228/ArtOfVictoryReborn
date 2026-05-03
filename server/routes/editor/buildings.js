const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')

const router = express.Router()

router.get('/buildings', requireCatalogEditorAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM build ORDER BY id_build')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/buildings', requireCatalogEditorAdmin, async (req, res) => {
  const { id, name, defend_human, defend_tech, block_human, block_tech, image_path, id_cobj } = req.body
  try {
    if (id) {
      await pool.query(`UPDATE build SET name=$1, defend_human=$2, defend_tech=$3, block_human=$4, block_tech=$5, image_path=$6, id_cobj=$7 WHERE id_build=$8`, [
        name,
        defend_human,
        defend_tech,
        block_human,
        block_tech,
        image_path,
        id_cobj || null,
        id,
      ])
      res.json({ success: true, id, ...req.body })
    } else {
      const result = await pool.query(
        `INSERT INTO build (name, defend_human, defend_tech, block_human, block_tech, image_path, id_cobj) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_build`,
        [name, defend_human, defend_tech, block_human, block_tech, image_path, id_cobj || null],
      )
      const newId = result.rows[0].id_build
      res.json({ success: true, id: newId, ...req.body, id_build: newId })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/buildings/:id', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM build WHERE id_build = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

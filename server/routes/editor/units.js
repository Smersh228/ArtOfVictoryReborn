const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')
const {
  ensureDefaultUnitProperties,
  ensureDefaultBattleOrders,
  replaceUnitOrders,
  replaceUnitProperties,
  UNIT_SELECT,
  splitNums,
  normalizeFire,
} = require('./shared')

const router = express.Router()

router.get('/units', requireCatalogEditorAdmin, async (req, res) => {
  try {
    const result = await pool.query(UNIT_SELECT)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/units', requireCatalogEditorAdmin, async (req, res) => {
  const {
    id,
    name,
    type,
    fraction,
    str,
    def,
    mov,
    mor,
    ammo,
    mines,
    vis,
    fire,
    standard_image,
    hover_image,
    id_cobj,
    orderIds,
    propertyIds,
  } = req.body
  const fr = fraction === 'germany' ? 'germany' : 'ussr'
  const f = normalizeFire(fire)
  const minesN = mines != null && mines !== '' ? Number(mines) : 0
  try {
    await ensureDefaultBattleOrders()
    await ensureDefaultUnitProperties()
    let unitId = id
    if (id) {
      await pool.query(
        `UPDATE unit SET name=$1, type=$2, fraction=$3, count=$4, defend=$5, op=$6, morale=$7, ammo=$8, mines=$9, visible=$10, standard_image=$11, hover_image=$12, id_cobj=$13, updated_at=NOW() WHERE id_unit=$14`,
        [
          name,
          type,
          fr,
          str,
          def,
          mov,
          mor,
          ammo,
          Number.isFinite(minesN) ? minesN : 0,
          vis,
          standard_image || '',
          hover_image || null,
          id_cobj || null,
          id,
        ],
      )
      await pool.query(
        `UPDATE unit_damage SET range=$1, humans=$2, artillery=$3, technics=$4, lt=$5, mt=$6, tt=$7, small_air=$8, big_air=$9, build=$10 WHERE id_unit=$11`,
        [
          splitNums(f.range),
          splitNums(f.inf),
          splitNums(f.art),
          splitNums(f.tech),
          splitNums(f.lt),
          splitNums(f.mt),
          splitNums(f.ht),
          splitNums(f.sa),
          splitNums(f.ba),
          splitNums(f.build),
          id,
        ],
      )
    } else {
      const result = await pool.query(
        `INSERT INTO unit (name, type, fraction, count, defend, op, morale, ammo, mines, visible, standard_image, hover_image, id_cobj) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id_unit`,
        [
          name,
          type,
          fr,
          str,
          def,
          mov,
          mor,
          ammo,
          Number.isFinite(minesN) ? minesN : 0,
          vis,
          standard_image || '',
          hover_image || null,
          id_cobj || null,
        ],
      )
      unitId = result.rows[0].id_unit
      await pool.query(
        `INSERT INTO unit_damage (id_unit, range, humans, artillery, technics, lt, mt, tt, small_air, big_air, build) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          unitId,
          splitNums(f.range),
          splitNums(f.inf),
          splitNums(f.art),
          splitNums(f.tech),
          splitNums(f.lt),
          splitNums(f.mt),
          splitNums(f.ht),
          splitNums(f.sa),
          splitNums(f.ba),
          splitNums(f.build),
        ],
      )
    }
    await replaceUnitOrders(unitId, orderIds)
    await replaceUnitProperties(unitId, propertyIds)
    res.json({ id: unitId, ...req.body, fraction: fr })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/units/:id', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM unit_damage WHERE id_unit = $1', [req.params.id])
    await pool.query('DELETE FROM unit WHERE id_unit = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

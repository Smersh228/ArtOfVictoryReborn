const express = require('express')
const { pool } = require('../../db')
const { requireCatalogEditorAdmin } = require('../../catalogEditorAdminMiddleware')
const {
  ensureDefaultUnitProperties,
  ensureDefaultBattleOrders,
  ensureUnitCatalogColumns,
  normalizeMapEditorPublic,
  replaceUnitOrders,
  replaceUnitProperties,
  UNIT_SELECT,
  splitNums,
  normalizeFire,
  normalizeFireRowOptions,
  normalizeEditorFireIntensityTab,
} = require('./shared')

const router = express.Router()

function orderRangeCsvToText(raw) {
  if (raw == null || raw === '') return '1,2,3'
  if (typeof raw === 'string') {
    const parts = raw
      .split(',')
      .map((x) => String(x).trim())
      .filter((x) => x !== '')
    return parts.length ? parts.join(',') : '1,2,3'
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => String(x).trim()).filter((x) => x !== '')
    return parts.length ? parts.join(',') : '1,2,3'
  }
  return String(raw)
}

function fireDamageToJsonbObject(fireObj) {
  const f = normalizeFire(fireObj)
  return {
    range: splitNums(f.range),
    inf: splitNums(f.inf),
    art: splitNums(f.art),
    tech: splitNums(f.tech),
    armor: splitNums(f.armor),
    lt: splitNums(f.lt),
    mt: splitNums(f.mt),
    ht: splitNums(f.ht),
    sa: splitNums(f.sa),
    ba: splitNums(f.ba),
    build: splitNums(f.build),
  }
}

router.get('/units', requireCatalogEditorAdmin, async (req, res) => {
  try {
    await ensureUnitCatalogColumns()
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
    explosives,
    smokeShells,
    vis,
    fire,
    standard_image,
    hover_image,
    id_cobj,
    orderIds,
    propertyIds,
    mapEditorPublic,
  } = req.body
  const fr = fraction === 'germany' ? 'germany' : 'ussr'
  const mapEditorPublicFlag = normalizeMapEditorPublic(mapEditorPublic)
  const f = normalizeFire(fire)
  const fireRowOpt = normalizeFireRowOptions(req.body.fireRowOptions)
  const fireReactiveJson = fireDamageToJsonbObject(req.body.fireReactive || {})
  const fireRowOptReactive = normalizeFireRowOptions(req.body.fireRowOptionsReactive)
  const minesN = mines != null && mines !== '' ? Number(mines) : 0
  const explosivesN = explosives != null && explosives !== '' ? Number(explosives) : 0
  const smokeShellsN = smokeShells != null && smokeShells !== '' ? Number(smokeShells) : 0
  const editorFireIntensityTab = normalizeEditorFireIntensityTab(req.body.editorFireIntensityTab)
  const intelligenceAirRangeText = orderRangeCsvToText(req.body.intelligenceAirRange)
  const razvedkaRangeText = orderRangeCsvToText(req.body.razvedkaRange)
  const svzyRangeText = orderRangeCsvToText(req.body.svzyRange)
  try {
    await ensureDefaultBattleOrders()
    await ensureDefaultUnitProperties()
    await ensureUnitCatalogColumns()
    let unitId = id
    if (id) {
      await pool.query(
        `UPDATE unit SET name=$1, type=$2, fraction=$3, count=$4, defend=$5, op=$6, morale=$7, ammo=$8, mines=$9, explosives=$10, smoke_shells=$11, visible=$12, standard_image=$13, hover_image=$14, id_cobj=$15, editor_fire_intensity_tab=$16, map_editor_public=$17, updated_at=NOW() WHERE id_unit=$18`,
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
          Number.isFinite(explosivesN) ? explosivesN : 0,
          Number.isFinite(smokeShellsN) ? smokeShellsN : 0,
          vis,
          standard_image || '',
          hover_image || null,
          id_cobj || null,
          editorFireIntensityTab,
          mapEditorPublicFlag,
          id,
        ],
      )
      await pool.query(
        `UPDATE unit_damage SET range=$1, humans=$2, artillery=$3, technics=$4, armor_tech=$5, lt=$6, mt=$7, tt=$8, small_air=$9, big_air=$10, build=$11, fire_row_options=$12, fire_reactive=$13::jsonb, fire_row_options_reactive=$14::jsonb, intelligence_air_range=$15, razvedka_range=$16, svzy_range=$17 WHERE id_unit=$18`,
        [
          splitNums(f.range),
          splitNums(f.inf),
          splitNums(f.art),
          splitNums(f.tech),
          splitNums(f.armor),
          splitNums(f.lt),
          splitNums(f.mt),
          splitNums(f.ht),
          splitNums(f.sa),
          splitNums(f.ba),
          splitNums(f.build),
          fireRowOpt,
          fireReactiveJson,
          fireRowOptReactive,
          intelligenceAirRangeText,
          razvedkaRangeText,
          svzyRangeText,
          id,
        ],
      )
    } else {
      const result = await pool.query(
        `INSERT INTO unit (name, type, fraction, count, defend, op, morale, ammo, mines, explosives, smoke_shells, visible, standard_image, hover_image, id_cobj, editor_fire_intensity_tab, map_editor_public) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id_unit`,
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
          Number.isFinite(explosivesN) ? explosivesN : 0,
          Number.isFinite(smokeShellsN) ? smokeShellsN : 0,
          vis,
          standard_image || '',
          hover_image || null,
          id_cobj || null,
          editorFireIntensityTab,
          mapEditorPublicFlag,
        ],
      )
      unitId = result.rows[0].id_unit
      await pool.query(
        `INSERT INTO unit_damage (id_unit, range, humans, artillery, technics, armor_tech, lt, mt, tt, small_air, big_air, build, fire_row_options, fire_reactive, fire_row_options_reactive, intelligence_air_range, razvedka_range, svzy_range) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18)`,
        [
          unitId,
          splitNums(f.range),
          splitNums(f.inf),
          splitNums(f.art),
          splitNums(f.tech),
          splitNums(f.armor),
          splitNums(f.lt),
          splitNums(f.mt),
          splitNums(f.ht),
          splitNums(f.sa),
          splitNums(f.ba),
          splitNums(f.build),
          fireRowOpt,
          fireReactiveJson,
          fireRowOptReactive,
          intelligenceAirRangeText,
          razvedkaRangeText,
          svzyRangeText,
        ],
      )
    }
    await replaceUnitOrders(unitId, orderIds)
    await replaceUnitProperties(unitId, propertyIds)
    res.json({ id: unitId, ...req.body, fraction: fr, mapEditorPublic: mapEditorPublicFlag })
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

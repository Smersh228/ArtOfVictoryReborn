'use strict'

const { normalizeFireObject } = require('../fire/battleFireNormalize')

function normalizeUnitPropertiesFromDbRow(raw) {
  if (raw == null) return null
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(arr)) return null
  return arr
    .map((row) => {
      if (row == null || typeof row !== 'object') return null
      const id = Number(row.id ?? row.id_property)
      if (!Number.isFinite(id)) return null
      const out = { id, name: row.name != null ? String(row.name) : '' }
      if (row.prop_key != null && String(row.prop_key).trim()) {
        out.prop_key = String(row.prop_key).trim()
      }
      return out
    })
    .filter(Boolean)
}

function joinCsv(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => String(x)).join(',')
  return String(v)
}

async function enrichBattleCells(pool, cells) {
  const ids = new Set()
  for (const c of cells) {
    for (const u of c.units || []) {
      const id = Number(u.id)
      if (Number.isFinite(id)) ids.add(id)
    }
  }
  if (ids.size === 0) return
  const arr = [...ids]
  let r
  try {
    r = await pool.query(
      `SELECT u.id_unit, u.op, u.ammo,
        jsonb_build_object(
          'range', ud.range,
          'inf', ud.humans,
          'art', ud.artillery,
          'tech', ud.technics,
          'armor', ud.armor_tech,
          'lt', ud.lt,
          'mt', ud.mt,
          'ht', ud.tt,
          'sa', ud.small_air,
          'ba', ud.big_air,
          'build', ud.build
        ) AS fire,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', pr.id_property,
                'name', pr.name,
                'prop_key', pr.prop_key
              )
              ORDER BY up.id_property
            ),
            '[]'::jsonb
          )
          FROM unit_property up
          JOIN property pr ON pr.id_property = up.id_property
          WHERE up.id_unit = u.id_unit
        ) AS unit_properties
      FROM unit u
      LEFT JOIN unit_damage ud ON u.id_unit = ud.id_unit
      WHERE u.id_unit = ANY($1::int[])`,
      [arr],
    )
  } catch (e) {
    console.error('enrichBattleCells:', e.message)
    return
  }
  const byId = new Map(r.rows.map((row) => [row.id_unit, row]))
  for (const c of cells) {
    for (const u of c.units || []) {
      const idu = Number(u.id)
      if (!Number.isFinite(idu)) continue
      const row = byId.get(idu)
      if (!row) continue
      if (u.mov == null && row.op != null) u.mov = Number(row.op) || u.mov
      const rawFire = row.fire && typeof row.fire === 'object' ? row.fire : {}
      const pack = {}
      for (const k of ['range', 'inf', 'art', 'tech', 'armor', 'lt', 'mt', 'ht', 'sa', 'ba', 'build']) {
        pack[k] = joinCsv(rawFire[k] != null ? rawFire[k] : '')
      }
      u._fireRaw = pack
      u.fireParsed = normalizeFireObject(pack)
      if (u.ammoCount == null) {
        if (typeof u.ammo === 'string' && u.ammo.trim()) {
          const n = Number(String(u.ammo).split(/[\/,]/)[0])
          if (Number.isFinite(n)) u.ammoCount = n
        }
        if (u.ammoCount == null && row.ammo != null && String(row.ammo).trim()) {
          const n = Number(String(row.ammo).split(/[\/,]/)[0])
          if (Number.isFinite(n)) u.ammoCount = n
        }
        if (u.ammunition != null && typeof u.ammunition === 'object' && typeof u.ammoCount === 'number') {
          u.ammunition.ammo = u.ammoCount
        }
      }
      const propsNorm = normalizeUnitPropertiesFromDbRow(row.unit_properties)
      if (propsNorm !== null && propsNorm.length > 0) u.properties = propsNorm
    }
  }
}

async function loadBattleCellsFromMapId(pool, mapId) {
  const id = Number(mapId)
  if (!Number.isFinite(id)) return null
  try {
    const r = await pool.query('SELECT payload FROM saved_map WHERE id_map = $1', [id])
    if (!r.rows.length) return null
    const payload = r.rows[0].payload
    const cells = payload && payload.cells
    if (!Array.isArray(cells) || cells.length === 0) return null
    return JSON.parse(JSON.stringify(cells))
  } catch (e) {
    console.error('loadBattleCellsFromMapId:', e.message)
    return null
  }
}

async function loadBattleMapConditionsFromMapId(pool, mapId) {
  const id = Number(mapId)
  if (!Number.isFinite(id)) return null
  try {
    const r = await pool.query('SELECT payload FROM saved_map WHERE id_map = $1', [id])
    if (!r.rows.length) return null
    const payload = r.rows[0].payload
    const cond = payload && payload.conditions
    if (!cond || typeof cond !== 'object') return null
    return JSON.parse(JSON.stringify(cond))
  } catch (e) {
    console.error('loadBattleMapConditionsFromMapId:', e.message)
    return null
  }
}

module.exports = { enrichBattleCells, loadBattleCellsFromMapId, loadBattleMapConditionsFromMapId }

'use strict'

const { normalizeFireObject } = require('../fire/battleFireNormalize')
const {
  applyMapEditorMetaToBattleUnits,
  finalizeDeployedArtillerySectors,
  collectDesantCatalogUnitIds,
  collectTruckCargoCatalogUnitIds,
  spawnMapEditorDesantParatroopers,
  spawnMapEditorTruckCargo,
} = require('../map/battleMapEditorMeta')

function normalizeUnitOrdersFromDbRow(raw) {
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
      const id = Number(row.id ?? row.id_orders)
      const name = row.name != null ? String(row.name) : ''
      if (!Number.isFinite(id)) return null
      const out = { id, name: name.trim() ? name : `Приказ ${id}` }
      if (row.order_key != null && String(row.order_key).trim()) {
        out.order_key = String(row.order_key).trim()
      }
      return out
    })
    .filter(Boolean)
}

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

function enrichUnitFromCatalogRow(u, row) {
  if (!u || !row) return
  if ((u.name == null || String(u.name).trim() === '') && row.name != null) {
    u.name = String(row.name)
  }
  if (u.type == null && row.type != null) u.type = String(row.type)
  if (u.imagePath == null && row.standard_image != null) {
    u.imagePath = String(row.standard_image).trim()
  }
  if (u.str == null && row.count != null) {
    const n = Number(row.count)
    if (Number.isFinite(n) && n > 0) u.str = n
  }
  if (u.strength == null && u.str != null) u.strength = u.str
  if (u.defend == null && row.defend != null) {
    const d = Number(row.defend)
    if (Number.isFinite(d)) u.defend = d
  }
  if (u.morale == null && row.morale != null) {
    const m = Number(row.morale)
    if (Number.isFinite(m)) u.morale = m
  }
  if (u.mov == null && row.op != null) u.mov = Number(row.op) || u.mov
  if (u.explosives == null && row.explosives != null) {
    const n = Number(row.explosives)
    if (Number.isFinite(n)) u.explosives = n
  }
  if (u.smokeShells == null && row.smoke_shells != null) {
    const n = Number(row.smoke_shells)
    if (Number.isFinite(n)) u.smokeShells = n
  }
  if (u.mines == null && row.mines != null) {
    const n = Number(row.mines)
    if (Number.isFinite(n) && n >= 0) {
      u.mines = Math.floor(n)
      if (!u.ammunition || typeof u.ammunition !== 'object') u.ammunition = {}
      if (u.ammunition.mine == null) u.ammunition.mine = u.mines
    }
  }
  const rawFire = row.fire && typeof row.fire === 'object' ? row.fire : {}
  const pack = {}
  for (const k of ['range', 'inf', 'art', 'tech', 'armor', 'lt', 'mt', 'ht', 'sa', 'ba', 'build']) {
    pack[k] = joinCsv(rawFire[k] != null ? rawFire[k] : '')
  }
  u._fireRaw = pack
  u.fireParsed = normalizeFireObject(pack)
  const rawReactive = row.fire_reactive && typeof row.fire_reactive === 'object' ? row.fire_reactive : null
  if (rawReactive) {
    const reactivePack = {}
    for (const k of ['range', 'inf', 'art', 'tech', 'armor', 'lt', 'mt', 'ht', 'sa', 'ba', 'build']) {
      reactivePack[k] = joinCsv(rawReactive[k] != null ? rawReactive[k] : '')
    }
    u.fireReactive = reactivePack
  }
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
  const ordersNorm = normalizeUnitOrdersFromDbRow(row.unit_orders)
  if (ordersNorm !== null && ordersNorm.length > 0) u.orders = ordersNorm
  const propsNorm = normalizeUnitPropertiesFromDbRow(row.unit_properties)
  if (propsNorm !== null && propsNorm.length > 0) u.properties = propsNorm
  if (row.fire_row_options != null && typeof row.fire_row_options === 'object') {
    u.fireRowOptions = row.fire_row_options
  }
  if (row.intelligence_air_range != null && String(row.intelligence_air_range).trim() !== '') {
    u.intelligenceAirRange = joinCsv(row.intelligence_air_range)
  }
  if (row.razvedka_range != null && String(row.razvedka_range).trim() !== '') {
    u.razvedkaRange = joinCsv(row.razvedka_range)
  }
  if (row.svzy_range != null && String(row.svzy_range).trim() !== '') {
    u.svzyRange = joinCsv(row.svzy_range)
  }
  if (row.visible != null && String(row.visible).trim() !== '') {
    const n = Number(String(row.visible).split(/[/,]/)[0])
    if (Number.isFinite(n) && n > 0) {
      u.vis = n
      u.visible = n
    }
  }
}

function appendDefaultDotOrdersForUnit(u) {
  if (!u) return
  const t = String(u.type || '').toLowerCase()
  if (t !== 'infantry' && t !== 'artillery') return
  const orders = Array.isArray(u.orders) ? u.orders.slice() : []
  const keys = new Set(
    orders.map((o) => (o && o.order_key != null ? String(o.order_key).trim() : '')).filter(Boolean),
  )
  const inDot = !!(u.tactical && u.tactical.inDot)
  const exiting = !!(u.tactical && Number(u.tactical.dotExitTurnsLeft) > 0)
  const entering = !!(u.tactical && Number(u.tactical.dotEnterTurnsLeft) > 0)
  if (!inDot && !entering && !keys.has('enterDot')) {
    orders.push({ id: -9001, name: 'Занять ДОТ', order_key: 'enterDot' })
  }
  if (inDot && !exiting && !keys.has('exitDot')) {
    orders.push({ id: -9002, name: 'Покинуть ДОТ', order_key: 'exitDot' })
  }
  u.orders = orders
}

function appendDefaultDotOrdersOnField(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      appendDefaultDotOrdersForUnit(u)
    }
  }
}

async function enrichBattleCells(pool, cells) {
  const ids = new Set()
  for (const c of cells) {
    for (const u of c.units || []) {
      const id = Number(u.id)
      if (Number.isFinite(id)) ids.add(id)
    }
  }
  for (const id of collectDesantCatalogUnitIds(cells)) ids.add(id)
  for (const id of collectTruckCargoCatalogUnitIds(cells)) ids.add(id)
  if (ids.size === 0) {
    applyMapEditorMetaToBattleUnits(cells)
    finalizeDeployedArtillerySectors(cells)
    appendDefaultDotOrdersOnField(cells)
    return
  }
  const arr = [...ids]
  let r
  try {
    r = await pool.query(
      `SELECT u.id_unit, u.name, u.type, u.count, u.defend, u.morale, u.op, u.ammo, u.visible, u.explosives, u.smoke_shells, u.mines,
        u.standard_image,
        ud.intelligence_air_range AS intelligence_air_range,
        ud.razvedka_range AS razvedka_range,
        ud.svzy_range AS svzy_range,
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
        ud.fire_reactive AS fire_reactive,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', o.id_orders,
                'name', o.name,
                'order_key', o.order_key
              )
              ORDER BY uo.id_orders
            ),
            '[]'::jsonb
          )
          FROM unit_order uo
          JOIN orders o ON o.id_orders = uo.id_orders
          WHERE uo.id_unit = u.id_unit
        ) AS unit_orders,
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
        ) AS unit_properties,
        ud.fire_row_options AS fire_row_options
      FROM unit u
      LEFT JOIN unit_damage ud ON u.id_unit = ud.id_unit
      WHERE u.id_unit = ANY($1::int[])`,
      [arr],
    )
  } catch (e) {
    console.error('enrichBattleCells:', e.message)
    applyMapEditorMetaToBattleUnits(cells)
    finalizeDeployedArtillerySectors(cells)
    appendDefaultDotOrdersOnField(cells)
    return
  }
  const byId = new Map(r.rows.map((row) => [row.id_unit, row]))
  for (const c of cells) {
    for (const u of c.units || []) {
      const idu = Number(u.id)
      if (!Number.isFinite(idu)) continue
      const row = byId.get(idu)
      if (!row) continue
      enrichUnitFromCatalogRow(u, row)
    }
  }
  spawnMapEditorDesantParatroopers(cells, byId, enrichUnitFromCatalogRow)
  spawnMapEditorTruckCargo(cells, byId, enrichUnitFromCatalogRow)
  applyMapEditorMetaToBattleUnits(cells)
  finalizeDeployedArtillerySectors(cells)
  appendDefaultDotOrdersOnField(cells)
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

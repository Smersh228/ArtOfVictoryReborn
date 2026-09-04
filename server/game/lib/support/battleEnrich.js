'use strict'

const { normalizeFireObject } = require('../fire/battleFireNormalize')
const { unitHasPropKey, unitUsesGunDeploy } = require('../../core/battleUnitType')
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
      } else {
        const nm = String(out.name).trim().toLowerCase()
        if (nm === 'водный юнит') out.prop_key = 'waterUnit'
        else if (nm === 'преодоление водной преграды') out.prop_key = 'crossingAWaterObstacle'
        else if (nm === 'преодоление болота') out.prop_key = 'movementThroughTheSwamp'
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
  const fireTab = String(row.editor_fire_intensity_tab || '').trim().toLowerCase()
  u.editorFireIntensityTab = fireTab === 'reactive' ? 'reactive' : 'all'
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
  if (!inDot && !entering && !keys.has('enterDot') && !unitHasPropKey(u, 'fireAirGun')) {
    orders.push({ id: -9001, name: 'Занять ДОТ', order_key: 'enterDot' })
  }
  if (inDot && !exiting && !keys.has('exitDot')) {
    orders.push({ id: -9002, name: 'Покинуть ДОТ', order_key: 'exitDot' })
  }
  u.orders = orders
}

function appendDefaultGunDeployOrdersForUnit(u) {
  if (!u) return
  if (!unitUsesGunDeploy(u)) return
  const orders = Array.isArray(u.orders) ? u.orders.slice() : []
  const keys = new Set(
    orders.map((o) => (o && o.order_key != null ? String(o.order_key).trim() : '')).filter(Boolean),
  )
  if (!keys.has('deploy')) orders.push({ id: -9101, name: 'Развёртывание', order_key: 'deploy' })
  if (!keys.has('clotting')) orders.push({ id: -9102, name: 'Свёртывание', order_key: 'clotting' })
  if (!keys.has('changeSector')) orders.push({ id: -9103, name: 'Смена сектора', order_key: 'changeSector' })
  u.orders = orders
}

function appendDefaultDotOrdersOnField(cells) {
  if (!Array.isArray(cells)) return
  for (const c of cells) {
    for (const u of c.units || []) {
      appendDefaultDotOrdersForUnit(u)
      appendDefaultGunDeployOrdersForUnit(u)
    }
  }
}

function parseHexCatalogId(type) {
  const m = String(type || '')
    .trim()
    .match(/^hex_(\d+)$/i)
  return m ? Number(m[1]) : null
}

function catalogHexIdOfCell(c) {
  const fromType = parseHexCatalogId(c && c.type)
  if (fromType != null) return fromType
  const ex = parseJsonObject(c && c.hexExtra)
  const n = Number(ex.catalogHexId ?? ex.id_hex)
  if (Number.isFinite(n) && n > 0) return n
  return null
}

function applyHexCatalogRowToCell(c, row) {
  if (!c || !row) return
  if (c.name == null || String(c.name).trim() === '') c.name = row.name
  if ((!c.img || String(c.img).trim() === '') && row.image_path) {
    c.img = String(row.image_path)
  }
  const catEx = parseJsonObject(row.hex_extra)
  delete catEx.isDestroyedBridge
  delete catEx.destroyedBridge
  delete catEx.isDestroyedRailway
  delete catEx.railwayDestroyed
  delete catEx.editorDestroyedBridge
  delete catEx.editorDestroyedRailway
  const cellEx = parseJsonObject(c.hexExtra)
  const merged = { ...catEx, ...cellEx }
  if (
    cellEx.editorDestroyedBridge !== true &&
    cellEx.isDestroyedBridge !== true &&
    cellEx.destroyedBridge !== true
  ) {
    delete merged.isDestroyedBridge
    delete merged.destroyedBridge
  }
  if (
    cellEx.editorDestroyedRailway !== true &&
    cellEx.isDestroyedRailway !== true &&
    cellEx.railwayDestroyed !== true
  ) {
    delete merged.isDestroyedRailway
    delete merged.railwayDestroyed
  }
  if (catEx.moveWithRiverProp === true) merged.moveWithRiverProp = true
  if (catEx.moveWithSwampProp === true) merged.moveWithSwampProp = true
  if (catEx.moveWithWaterUnitProp === true) merged.moveWithWaterUnitProp = true
  if (catEx.isFord === true) merged.isFord = true
  if (catEx.isRailwayBridge === true) merged.isRailwayBridge = true
  if (catEx.isBridge === true) merged.isBridge = true
  if (catEx.isRailway === true) merged.isRailway = true
  if (catEx.isSettlement === true) merged.isSettlement = true
  if (catEx.isCity === true) merged.isCity = true
  if (catEx.isVillage === true) merged.isVillage = true
  if (catEx.isRailStation === true) merged.isRailStation = true
  if (isRiverCategory(catEx.category) && !isRiverCategory(cellEx.category)) {
    merged.category = catEx.category
  }
  if (!merged.name && row.name) merged.name = row.name
  if (row.image_path && !merged.image_path && !merged.img) merged.image_path = String(row.image_path)
  if (Number.isFinite(Number(row.id_hex))) merged.catalogHexId = Number(row.id_hex)
  const catPlc = catEx.placementAllowed
  const cellPlc = merged.placementAllowed
  if (catPlc && typeof catPlc === 'object' && catPlc.pontonBridge === true) {
    merged.placementAllowed =
      cellPlc && typeof cellPlc === 'object' ? { ...catPlc, ...cellPlc, pontonBridge: true } : { ...catPlc }
  }
  c.hexExtra = merged
  if (merged.defBonusInf != null) c.defBonusInf = merged.defBonusInf
  if (merged.defBonusTech != null) c.defBonusTech = merged.defBonusTech
  if (merged.defBonusByType && typeof merged.defBonusByType === 'object') c.defBonusByType = merged.defBonusByType
}

async function enrichBattleHexExtras(pool, cells) {
  if (!Array.isArray(cells) || !pool) return
  const ids = []
  for (const c of cells) {
    const id = catalogHexIdOfCell(c)
    if (id != null) ids.push(id)
  }
  const uniq = [...new Set(ids)]
  const byId = new Map()
  try {
    if (uniq.length) {
      const r = await pool.query(
        'SELECT id_hex, name, hex_extra, image_path FROM hex WHERE id_hex = ANY($1::int[])',
        [uniq],
      )
      for (const row of r.rows) byId.set(Number(row.id_hex), row)
    }
    const unmatchedImgs = []
    for (const c of cells) {
      const id = catalogHexIdOfCell(c)
      if (id != null && byId.has(id)) {
        applyHexCatalogRowToCell(c, byId.get(id))
        continue
      }
      const img = String((c && (c.img || c.imagePath)) || '').trim()
      if (img) unmatchedImgs.push(img)
    }
    const imgUniq = [...new Set(unmatchedImgs)]
    if (imgUniq.length) {
      const r2 = await pool.query(
        'SELECT id_hex, name, hex_extra, image_path FROM hex WHERE image_path = ANY($1::text[])',
        [imgUniq],
      )
      const byImg = new Map()
      for (const row of r2.rows) {
        const key = String(row.image_path || '').trim()
        if (key && !byImg.has(key)) byImg.set(key, row)
      }
      for (const c of cells) {
        const id = catalogHexIdOfCell(c)
        if (id != null && byId.has(id)) continue
        const img = String((c && (c.img || c.imagePath)) || '').trim()
        const row = img ? byImg.get(img) : null
        if (row) applyHexCatalogRowToCell(c, row)
      }
    }
  } catch (e) {
    console.error('enrichBattleHexExtras:', e.message)
  }
}

function parseJsonObject(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object') return { ...raw }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return p && typeof p === 'object' ? { ...p } : {}
    } catch {
      return {}
    }
  }
  return {}
}

function isRiverCategory(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  return s === 'rivers' || s === 'river' || s === 'water' || s === 'waters'
}

async function enrichBattleCells(pool, cells) {
  await enrichBattleHexExtras(pool, cells)
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
    require('../map/battleStructureHp').ensureAllStructureHp(cells)
    return
  }
  const arr = [...ids]
  let r
  try {
    r = await pool.query(
      `SELECT u.id_unit, u.name, u.type, u.count, u.defend, u.morale, u.op, u.ammo, u.visible, u.explosives, u.smoke_shells, u.mines,
        u.standard_image,
        u.editor_fire_intensity_tab AS editor_fire_intensity_tab,
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
    require('../map/battleStructureHp').ensureAllStructureHp(cells)
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
  require('../map/battleStructureHp').ensureAllStructureHp(cells)
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
    const cloned = JSON.parse(JSON.stringify(cells))
    const { clearInheritedDestroyedHexFlags } = require('../map/battleSpecialTerrain')
    for (const c of cloned) {
      if (c && c.hexExtra && typeof c.hexExtra === 'object') {
        clearInheritedDestroyedHexFlags(c.hexExtra)
      }
    }
    return cloned
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

async function loadBattleMapDeploymentFromMapId(pool, mapId) {
  const id = Number(mapId)
  if (!Number.isFinite(id)) return null
  try {
    const r = await pool.query('SELECT payload FROM saved_map WHERE id_map = $1', [id])
    if (!r.rows.length) return null
    const payload = r.rows[0].payload
    const { loadDeploymentFromPayload } = require('../map/battleDeployPhase')
    return loadDeploymentFromPayload(payload)
  } catch (e) {
    console.error('loadBattleMapDeploymentFromMapId:', e.message)
    return null
  }
}

module.exports = {
  enrichBattleCells,
  enrichBattleHexExtras,
  enrichUnitFromCatalogRow,
  loadBattleCellsFromMapId,
  loadBattleMapConditionsFromMapId,
  loadBattleMapDeploymentFromMapId,
}

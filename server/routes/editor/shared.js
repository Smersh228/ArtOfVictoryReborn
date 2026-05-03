const { pool } = require('../../db')

const DEFAULT_BATTLE_ORDERS = [
  ['Огонь', 'fire'],
  ['Огонь на подавление', 'fireHard'],
  ['Походное положение', 'move'],
  ['Боевое положение', 'moveWar'],
  ['Атака', 'attack'],
  ['Оборона', 'defend'],
  ['Засада', 'ambush'],
  ['Погрузка', 'loading'],
  ['Буксир', 'tow'],
  ['Свёртывание', 'clotting'],
  ['Развёртывание', 'deploy'],
  ['Смена сектора', 'changeSector'],
  ['Выгрузка', 'unloading'],
  ['Получение припасов', 'getSup'],
]

const DEFAULT_UNIT_PROPERTIES = [
  ['Танкобоязнь', 'tankPhobia'],
  ['Сектор стрельбы', 'fireSector'],
  ['Стрельба по закрытым целям', 'concealedTargetFire'],
  ['Стрельба по площади', 'areaFire'],
]

async function ensureDefaultUnitProperties() {
  for (const [name, propKey] of DEFAULT_UNIT_PROPERTIES) {
    try {
      await pool.query(
        `INSERT INTO property (name, prop_key)
         SELECT $1::text, $2::text
         WHERE NOT EXISTS (
           SELECT 1 FROM property p
           WHERE TRIM(p.prop_key) = $2::text
         )`,
        [name, propKey],
      )
    } catch (e) {
      console.error('ensureDefaultUnitProperties', propKey, e.message)
    }
  }
}

async function ensureDefaultBattleOrders() {
  for (const [name, orderKey] of DEFAULT_BATTLE_ORDERS) {
    try {
      await pool.query(
        `INSERT INTO orders (name, order_key)
         SELECT $1::text, $2::text
         WHERE NOT EXISTS (
           SELECT 1 FROM orders o
           WHERE o.order_key IS NOT NULL AND TRIM(o.order_key) = $2::text
         )`,
        [name, orderKey],
      )
    } catch (e) {
      console.error('ensureDefaultBattleOrders', orderKey, e.message)
    }
  }
}

async function replaceUnitOrders(unitId, orderIds) {
  const uid = Number(unitId)
  if (!Number.isFinite(uid)) return
  await pool.query('DELETE FROM unit_order WHERE id_unit = $1', [uid])
  if (!Array.isArray(orderIds)) return
  for (const raw of orderIds) {
    const oid = Number(raw)
    if (!Number.isFinite(oid)) continue
    await pool.query(
      'INSERT INTO unit_order (id_unit, id_orders) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [uid, oid],
    )
  }
}

async function replaceUnitProperties(unitId, propertyIds) {
  const uid = Number(unitId)
  if (!Number.isFinite(uid)) return
  await pool.query('DELETE FROM unit_property WHERE id_unit = $1', [uid])
  if (!Array.isArray(propertyIds)) return
  for (const raw of propertyIds) {
    const pid = Number(raw)
    if (!Number.isFinite(pid)) continue
    await pool.query(
      'INSERT INTO unit_property (id_unit, id_property) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [uid, pid],
    )
  }
}

const UNIT_SELECT = `
  SELECT u.*,
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
         ) AS unit_properties
  FROM unit u
  LEFT JOIN unit_damage ud ON u.id_unit = ud.id_unit
  ORDER BY u.id_unit
`

function joinCsv(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => String(x)).join(',')
  return String(v)
}

function splitNums(s) {
  if (s == null || s === '') return []
  if (Array.isArray(s)) return s.map((x) => Number(x) || 0)
  return String(s)
    .split(',')
    .map((x) => {
      const n = Number(String(x).trim())
      return Number.isFinite(n) ? n : 0
    })
}

function normalizeFire(fire) {
  const f = fire && typeof fire === 'object' ? fire : {}
  const d = (k, fallback) => joinCsv(f[k] != null ? f[k] : fallback)
  return {
    range: d('range', '1,2,3'),
    inf: d('inf', '0'),
    art: d('art', '0'),
    tech: d('tech', '0'),
    armor: d('armor', '0'),
    lt: d('lt', '0'),
    mt: d('mt', '0'),
    ht: d('ht', '0'),
    sa: d('sa', '0'),
    ba: d('ba', '0'),
    build: d('build', '0'),
  }
}

function normalizeUnitOrdersFromDb(raw) {
  if (raw == null) return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
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

function normalizeUnitPropertiesFromDb(raw) {
  if (raw == null) return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => {
      if (row == null || typeof row !== 'object') return null
      const id = Number(row.id ?? row.id_property)
      const name = row.name != null ? String(row.name) : ''
      if (!Number.isFinite(id)) return null
      const out = { id, name: name.trim() ? name : `Свойство ${id}` }
      if (row.prop_key != null && String(row.prop_key).trim()) {
        out.prop_key = String(row.prop_key).trim()
      }
      return out
    })
    .filter(Boolean)
}

function mapUnitClientRow(u) {
  const fireJson = u.fire && typeof u.fire === 'object' ? u.fire : {}
  const fc = (k) => joinCsv(fireJson[k])
  const frac = u.fraction === 'germany' ? 'germany' : 'ussr'
  return {
    id: u.id_unit,
    name: u.name,
    type: u.type,
    faction: frac,
    str: u.count,
    def: u.defend,
    mov: u.op,
    mor: u.morale,
    ammo: u.ammo != null ? String(u.ammo) : '',
    mines: u.mines != null ? Number(u.mines) : 0,
    vis: joinCsv(u.visible),
    imagePath: u.standard_image || '',
    hover_image: u.hover_image || '',
    id_cobj: u.id_cobj,
    orders: normalizeUnitOrdersFromDb(u.unit_orders),
    properties: normalizeUnitPropertiesFromDb(u.unit_properties),
    fire: {
      range: fc('range') || '1,2,3',
      inf: fc('inf') || '0',
      art: fc('art') || '0',
      tech: fc('tech') || '0',
      armor: fc('armor') || '0',
      lt: fc('lt') || '0',
      mt: fc('mt') || '0',
      ht: fc('ht') || '0',
      sa: fc('sa') || '0',
      ba: fc('ba') || '0',
      build: fc('build') || '0',
    },
  }
}

function mapUnitCatalog(u) {
  const m = mapUnitClientRow(u)
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    faction: m.faction,
    imagePath: m.imagePath,
  }
}

function hexTerrainType(row) {
  if (row.terrain_type != null) return String(row.terrain_type)
  return `hex_${row.id_hex}`
}

function parseHexAllowedBuildings(row) {
  const raw = row.allowed_buildings ?? row.allowedBuildings
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string')
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

function mapHexClient(row) {
  const di = row.defendhuman ?? row.defendHuman ?? row.defend_human
  const dt = row.defendtech ?? row.defendTech ?? row.defend_tech
  const cm = row.costmove ?? row.costMove ?? row.cost_move
  const cmi = row.costmoveinf ?? row.costMoveInf ?? row.cost_move_inf
  const cmt = row.costmovetech ?? row.costMoveTech ?? row.cost_move_tech
  const vis = row.isvisible ?? row.isVisible ?? row.is_visible
  const moveCostInf = cmi != null ? cmi : cm != null ? cm : 1
  const moveCostTech = cmt != null ? cmt : cm != null ? cm : 1
  return {
    id: row.id_hex,
    name: row.name,
    imagePath: row.image_path || '',
    defBonusInf: di != null ? di : 0,
    defBonusTech: dt != null ? dt : 0,
    moveCost: cm != null ? cm : moveCostInf,
    moveCostInf,
    moveCostTech,
    visionBlock: Boolean(vis),
    id_cobj: row.id_cobj,
    terrainType: hexTerrainType(row),
    allowedBuildings: parseHexAllowedBuildings(row),
  }
}

function mapHexCatalog(row) {
  const m = mapHexClient(row)
  return {
    id: `hex_${m.id}`,
    type: m.terrainType,
    name: m.name,
    imagePath: m.imagePath,
    moveCost: m.moveCost,
    moveCostInf: m.moveCostInf,
    moveCostTech: m.moveCostTech,
    visionBlock: m.visionBlock,
    defBonusInf: m.defBonusInf,
    defBonusTech: m.defBonusTech,
  }
}

function mapBuildingClient(row) {
  return {
    id: row.id_build,
    name: row.name,
    imagePath: row.image_path || '',
    bonusInf: row.defend_human,
    bonusTech: row.defend_tech,
    blockInf: Boolean(row.block_human),
    blockTech: Boolean(row.block_tech),
    id_cobj: row.id_cobj,
  }
}

function mapBuildingCatalog(row) {
  const m = mapBuildingClient(row)
  return {
    id: `build_${m.id}`,
    dbId: m.id,
    name: m.name,
    imagePath: m.imagePath,
  }
}

function mapRuleClient(row) {
  return {
    id: row.id_rule,
    title: row.name,
    chapter: row.head || 'other',
    desc: row.description || '',
    imagePath: row.image_path || '',
    imagePath2: row.image_path_2 || '',
    imagePath3: row.image_path_3 || '',
    id_cobj: row.id_cobj,
  }
}

function normalizeAllowedBuildingsBody(body) {
  const raw = body.allowed_buildings ?? body.allowedBuildings
  if (Array.isArray(raw)) {
    const strings = raw.filter((x) => typeof x === 'string')
    return JSON.stringify(strings)
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) return JSON.stringify(p.filter((x) => typeof x === 'string'))
    } catch {
      /* fallthrough */
    }
  }
  return '[]'
}

module.exports = {
  ensureDefaultUnitProperties,
  ensureDefaultBattleOrders,
  replaceUnitOrders,
  replaceUnitProperties,
  UNIT_SELECT,
  splitNums,
  normalizeFire,
  mapUnitClientRow,
  mapUnitCatalog,
  mapHexClient,
  mapHexCatalog,
  mapBuildingClient,
  mapBuildingCatalog,
  mapRuleClient,
  normalizeAllowedBuildingsBody,
}

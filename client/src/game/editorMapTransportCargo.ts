export type EditorCatalogTransportUnit = {
  id?: number
  name?: string
  type?: string
  faction?: string
  heavyTech?: boolean
  heavyArtillery?: boolean
  properties?: Array<{ prop_key?: string; name?: string }>
  orders?: Array<{ order_key?: string; key?: string }>
}

export type TransportKind = 'truck' | 'train' | null

function asTransportLooks(u: unknown): EditorCatalogTransportUnit | null {
  if (!u || typeof u !== 'object') return null
  const rec = u as Record<string, unknown>
  const id = Number(rec.id)
  const props = rec.properties
  const orders = rec.orders
  return {
    ...(Number.isFinite(id) && id > 0 ? { id } : {}),
    ...(rec.name != null ? { name: String(rec.name) } : {}),
    ...(rec.type != null ? { type: String(rec.type) } : {}),
    ...(rec.faction != null ? { faction: String(rec.faction) } : {}),
    heavyTech: rec.heavyTech === true || rec.heavy_tech === true,
    heavyArtillery: rec.heavyArtillery === true || rec.heavy_artillery === true,
    ...(Array.isArray(props) ? { properties: props as EditorCatalogTransportUnit['properties'] } : {}),
    ...(Array.isArray(orders) ? { orders: orders as EditorCatalogTransportUnit['orders'] } : {}),
  }
}

function unitHasPropKey(u: EditorCatalogTransportUnit | null | undefined, key: string): boolean {
  const props = u?.properties
  if (!Array.isArray(props)) return false
  const want = String(key).trim()
  if (!want) return false
  return props.some((p) => p && String(p.prop_key ?? '').trim() === want)
}

function hasTruckLogisticsOrder(u: EditorCatalogTransportUnit): boolean {
  const orders = u.orders
  if (!Array.isArray(orders)) return false
  return orders.some((o) => {
    const k = String(o?.order_key ?? o?.key ?? '')
      .trim()
      .toLowerCase()
    return k === 'getsup' || k === 'loadingsup' || k === 'loading' || k === 'tow' || k === 'unloading'
  })
}

export function catalogUnitIsTrain(u: unknown): boolean {
  const unit = asTransportLooks(u)
  if (!unit) return false
  if (String(unit.type || '').toLowerCase() !== 'tech') return false
  return unitHasPropKey(unit, 'railwayDetachment')
}

export function catalogUnitIsTruck(u: unknown): boolean {
  const unit = asTransportLooks(u)
  if (!unit) return false
  if (catalogUnitIsTrain(unit)) return false
  const t = String(unit.type || '').toLowerCase()
  if (t !== 'tech' && t !== 'armor') return false
  if (/грузовик|truck|lkw/i.test(String(unit.name || ''))) return true
  return hasTruckLogisticsOrder(unit)
}

export function catalogTransportKind(u: unknown): TransportKind {
  if (catalogUnitIsTrain(u)) return 'train'
  if (catalogUnitIsTruck(u)) return 'truck'
  return null
}

export function catalogUnitIsInfantry(u: unknown): boolean {
  const unit = asTransportLooks(u)
  return String(unit?.type || '').toLowerCase() === 'infantry'
}

export function catalogUnitIsArtillery(u: unknown): boolean {
  const unit = asTransportLooks(u)
  return String(unit?.type || '').toLowerCase() === 'artillery'
}

export function catalogIsHeavyTech(u: unknown): boolean {
  return asTransportLooks(u)?.heavyTech === true
}

export function catalogIsHeavyArtillery(u: unknown): boolean {
  return asTransportLooks(u)?.heavyArtillery === true
}

/** Лёгкая техника в редакторе карт не берёт тяжёлую артиллерию. */
export function catalogCanTechTowArtillery(truck: unknown, artillery: unknown): boolean {
  if (!catalogUnitIsArtillery(artillery)) return false
  if (catalogIsHeavyTech(truck)) return true
  return !catalogIsHeavyArtillery(artillery)
}

function isRailOtherType(u: EditorCatalogTransportUnit): boolean {
  const t = String(u.type || '').toLowerCase()
  if (t === 'infantry') return false
  if (t === 'artillery' || t === 'armor' || t === 'lighttank' || t === 'mediumtank' || t === 'heavytank') return true
  if (t === 'tech' && !catalogUnitIsTrain(u)) return true
  return false
}

export function catalogUnitIsTrainOtherCargo(u: unknown): boolean {
  const unit = asTransportLooks(u)
  if (!unit) return false
  return isRailOtherType(unit)
}

export function padCargoSlots(raw: unknown, length: number): number[][] {
  const src = Array.isArray(raw) ? raw : []
  const out: number[][] = []
  for (let i = 0; i < length; i++) {
    out.push(asCargoIds(src[i]))
  }
  return out
}

export function asCargoIds(raw: unknown, max = 4): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Math.floor(Number(item))
    if (!Number.isFinite(n) || n <= 0) continue
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

export function normalizeTransportCargo(
  kind: TransportKind,
  cargoIds: readonly number[],
  catalogById: Map<number, EditorCatalogTransportUnit>,
  host?: unknown,
): number[] {
  if (!kind) return []
  const inf: number[] = []
  const art: number[] = []
  const other: number[] = []
  for (const id of cargoIds) {
    const u = catalogById.get(id)
    if (!u) continue
    if (kind === 'truck') {
      if (catalogUnitIsInfantry(u) && inf.length < 1) inf.push(id)
      else if (catalogUnitIsArtillery(u) && art.length < 1 && catalogCanTechTowArtillery(host, u)) art.push(id)
      continue
    }
    if (catalogUnitIsTrain(u)) continue
    if (catalogUnitIsInfantry(u)) {
      if (inf.length < 2) inf.push(id)
    } else if (isRailOtherType(u) && other.length < 2) {
      other.push(id)
    }
  }
  return kind === 'truck' ? [...inf, ...art] : [...inf, ...other]
}

export function truckCargoSlots(cargoIds: readonly number[], catalogById: Map<number, EditorCatalogTransportUnit>) {
  let infantryId = 0
  let artilleryId = 0
  for (const id of cargoIds) {
    const u = catalogById.get(id)
    if (!u) continue
    if (!infantryId && catalogUnitIsInfantry(u)) infantryId = id
    else if (!artilleryId && catalogUnitIsArtillery(u)) artilleryId = id
  }
  return { infantryId, artilleryId }
}

export function trainCargoSlots(cargoIds: readonly number[], catalogById: Map<number, EditorCatalogTransportUnit>) {
  const infantryIds: number[] = []
  const otherIds: number[] = []
  for (const id of cargoIds) {
    const u = catalogById.get(id)
    if (!u || catalogUnitIsTrain(u)) continue
    if (catalogUnitIsInfantry(u)) {
      if (infantryIds.length < 2) infantryIds.push(id)
    } else if (isRailOtherType(u) && otherIds.length < 2) {
      otherIds.push(id)
    }
  }
  while (infantryIds.length < 2) infantryIds.push(0)
  while (otherIds.length < 2) otherIds.push(0)
  return { infantryIds, otherIds }
}

export function cargoFromTruckSlots(infantryId: number, artilleryId: number): number[] {
  const out: number[] = []
  if (infantryId > 0) out.push(infantryId)
  if (artilleryId > 0) out.push(artilleryId)
  return out
}

export function cargoFromTrainSlots(infantryIds: number[], otherIds: number[]): number[] {
  return [...infantryIds, ...otherIds].filter((id) => id > 0)
}

export function cargoIdsToOrderEditorMeta(
  kind: TransportKind,
  cargoIds: readonly number[],
): Record<string, unknown> | undefined {
  const ids = asCargoIds(cargoIds)
  if (!kind || !ids.length) return undefined
  if (kind === 'train') return { railCargo: { catalogUnitIds: ids } }
  const inf = ids[0]
  const rest = ids.slice(1)
  const meta: Record<string, unknown> = { transportCargo: { catalogUnitIds: ids } }
  if (inf) meta.loading = { catalogUnitId: inf, cargoKind: 'infantry' }
  if (rest[0]) meta.tow = { catalogUnitId: rest[0], cargoKind: 'artillery' }
  return meta
}

export function cargoIdsFromOrderEditorMeta(meta: unknown): number[] {
  if (!meta || typeof meta !== 'object') return []
  const rec = meta as Record<string, unknown>
  const rail = rec.railCargo && typeof rec.railCargo === 'object' ? (rec.railCargo as { catalogUnitIds?: unknown }) : null
  if (Array.isArray(rail?.catalogUnitIds)) return asCargoIds(rail.catalogUnitIds)
  const pack =
    rec.transportCargo && typeof rec.transportCargo === 'object'
      ? (rec.transportCargo as { catalogUnitIds?: unknown })
      : null
  if (Array.isArray(pack?.catalogUnitIds)) return asCargoIds(pack.catalogUnitIds)
  const out: number[] = []
  for (const key of ['loading', 'tow'] as const) {
    const block = rec[key]
    const id = Number((block as { catalogUnitId?: unknown } | undefined)?.catalogUnitId)
    if (Number.isFinite(id) && id > 0) out.push(id)
  }
  return out
}

export function slotIndicesForUnitId(ids: readonly number[], unitId: number): number[] {
  const out: number[] = []
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === unitId) out.push(i)
  }
  return out
}

export function factionsMatch(a: string | undefined, b: string | undefined): boolean {
  const left = String(a || '').trim().toLowerCase()
  const right = String(b || '').trim().toLowerCase()
  if (!left || !right) return true
  if (left === right) return true
  const wehr = (f: string) => f === 'germany' || f === 'wehrmacht'
  const ussr = (f: string) => f === 'ussr' || f === 'rkka'
  return (wehr(left) && wehr(right)) || (ussr(left) && ussr(right))
}

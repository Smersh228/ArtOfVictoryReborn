/** Параметры приказов экземпляра юнита на карте (редактор). Сохраняются в payload карты. */

export type EditorMapCargoKind = 'infantry' | 'artillery'

export type EditorMapLogisticsOrderMeta = {
  cargoKind?: EditorMapCargoKind
  /** id записи каталога unit (CatalogUnit.id) */
  catalogUnitId?: number
}

export type EditorMapArtilleryDeployMeta = {
  deployed?: boolean
  /** Соседний гекс — направление орудия (defendFacingCellId в бою) */
  facingCellId?: number
}

export type EditorMapDesantMeta = {
  /** id записи каталога unit со свойством «Десант» */
  catalogUnitId?: number
}

export type EditorMapUnitOrderEditorMeta = {
  desant?: EditorMapDesantMeta
  loading?: EditorMapLogisticsOrderMeta
  unloading?: EditorMapLogisticsOrderMeta
  tow?: EditorMapLogisticsOrderMeta
  /** @deprecated используйте artilleryDeploy */
  artilleryDeployed?: boolean
  artilleryDeploy?: EditorMapArtilleryDeployMeta
}

export type EditorMapUnitOrderRef = {
  id?: number
  name?: string
  order_key?: string
}

const LOGISTICS_ORDER_KEYS = ['loading', 'unloading', 'tow'] as const
export type EditorMapLogisticsOrderKey = (typeof LOGISTICS_ORDER_KEYS)[number]

export function unitHasOrderKey(
  unit: { orders?: EditorMapUnitOrderRef[] | null },
  orderKey: string,
): boolean {
  const want = String(orderKey || '').trim()
  if (!want) return false
  for (const o of unit.orders ?? []) {
    if (o && String(o.order_key || '').trim() === want) return true
  }
  return false
}

export function readUnitOrderEditorMeta(unit: unknown): EditorMapUnitOrderEditorMeta {
  const raw = (unit as { orderEditorMeta?: unknown })?.orderEditorMeta
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as EditorMapUnitOrderEditorMeta) }
}

export function patchUnitOrderEditorMeta(
  unit: Record<string, unknown>,
  patch: (prev: EditorMapUnitOrderEditorMeta) => EditorMapUnitOrderEditorMeta,
): Record<string, unknown> {
  const prev = readUnitOrderEditorMeta(unit)
  const next = patch(prev)
  const cleaned = { ...next }
  for (const k of Object.keys(cleaned) as (keyof EditorMapUnitOrderEditorMeta)[]) {
    const v = cleaned[k]
    if (v == null || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) {
      delete cleaned[k]
    }
  }
  const out = { ...unit }
  if (Object.keys(cleaned).length === 0) {
    delete out.orderEditorMeta
  } else {
    out.orderEditorMeta = cleaned
  }
  return out
}

export function logisticsOrderKeysOnUnit(unit: {
  orders?: EditorMapUnitOrderRef[] | null
}): EditorMapLogisticsOrderKey[] {
  return LOGISTICS_ORDER_KEYS.filter((k) => unitHasOrderKey(unit, k))
}

export function isArtilleryTypeUnit(unit: { type?: unknown }): boolean {
  return String(unit.type ?? '').trim().toLowerCase() === 'artillery'
}

export function readArtilleryDeployMeta(meta: EditorMapUnitOrderEditorMeta): EditorMapArtilleryDeployMeta {
  if (meta.artilleryDeploy && typeof meta.artilleryDeploy === 'object') {
    return { ...meta.artilleryDeploy }
  }
  if (meta.artilleryDeployed === true) {
    return { deployed: true }
  }
  return {}
}

export const LOGISTICS_ORDER_LABELS: Record<EditorMapLogisticsOrderKey, string> = {
  loading: 'Погрузка',
  unloading: 'Выгрузка',
  tow: 'Буксир',
}

import React from 'react'
import {
  type EditorMapLogisticsOrderKey,
  type EditorMapUnitOrderEditorMeta,
  isArtilleryTypeUnit,
  logisticsOrderKeysOnUnit,
  readArtilleryDeployMeta,
  readUnitOrderEditorMeta,
  unitHasOrderKey,
} from '../../game/editorMapUnitOrderMeta'

export type EditorMapCatalogUnitPick = {
  id: number
  name: string
  type: string
  faction: string
  properties?: Array<{ prop_key?: string; name?: string }>
}

interface EditorMapUnitOrderMenuProps {
  unit: Record<string, unknown>
  catalogUnits: EditorMapCatalogUnitPick[]
  onPatchMeta: (patch: (prev: EditorMapUnitOrderEditorMeta) => EditorMapUnitOrderEditorMeta) => void
  artilleryFacingPickPending?: boolean
  onRequestArtilleryFacingPick?: () => void
  onCancelArtilleryFacingPick?: () => void
  onCloseMenu?: () => void
}

function cargoUnitsForOrder(
  catalogUnits: EditorMapCatalogUnitPick[],
  unitFaction: string,
  orderKey: EditorMapLogisticsOrderKey,
): EditorMapCatalogUnitPick[] {
  const fac = String(unitFaction || '').trim().toLowerCase()
  return catalogUnits.filter((u) => {
    if (fac && String(u.faction || '').trim().toLowerCase() !== fac) return false
    const ty = String(u.type || '').trim().toLowerCase()
    if (orderKey === 'loading') return ty === 'infantry'
    if (orderKey === 'tow') return ty === 'artillery'
    if (orderKey === 'unloading') return ty === 'infantry' || ty === 'artillery'
    return false
  })
}

const LOGISTICS_SECTION_TITLE: Partial<Record<EditorMapLogisticsOrderKey, string>> = {
  loading: 'Пехота',
  tow: 'Артиллерия',
}

function LogisticsOrderBlock({
  orderKey,
  meta,
  unitFaction,
  catalogUnits,
  onPatchMeta,
}: {
  orderKey: EditorMapLogisticsOrderKey
  meta: EditorMapUnitOrderEditorMeta
  unitFaction: string
  catalogUnits: EditorMapCatalogUnitPick[]
  onPatchMeta: EditorMapUnitOrderMenuProps['onPatchMeta']
}) {
  const block = meta[orderKey] ?? {}
  const list = cargoUnitsForOrder(catalogUnits, unitFaction, orderKey)
  const sectionTitle = LOGISTICS_SECTION_TITLE[orderKey]

  const setBlock = (next: EditorMapUnitOrderEditorMeta[EditorMapLogisticsOrderKey]) => {
    onPatchMeta((prev) => {
      const copy = { ...prev }
      if (!next || next.catalogUnitId == null) {
        delete copy[orderKey]
      } else {
        copy[orderKey] = next
      }
      return copy
    })
  }

  return (
    <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: '12px' }}>
      {sectionTitle ? (
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{sectionTitle}</div>
      ) : null}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <select
          value={block.catalogUnitId != null ? String(block.catalogUnitId) : ''}
          onChange={(e) => {
            const v = e.target.value
            if (!v) {
              setBlock(undefined)
              return
            }
            const picked = list.find((u) => u.id === Number(v))
            const ty = String(picked?.type ?? '').trim().toLowerCase()
            const cargoKind = ty === 'artillery' ? 'artillery' : ty === 'infantry' ? 'infantry' : undefined
            setBlock({
              catalogUnitId: Number(v),
              ...(cargoKind ? { cargoKind } : {}),
            })
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: '13px',
          }}
        >
          <option value="">— выберите —</option>
          {list.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function desantCatalogUnits(
  catalogUnits: EditorMapCatalogUnitPick[],
  unitFaction: string,
): EditorMapCatalogUnitPick[] {
  const fac = String(unitFaction || '').trim().toLowerCase()
  return catalogUnits.filter((u) => {
    if (fac && String(u.faction || '').trim().toLowerCase() !== fac) return false
    const props = u.properties
    if (!Array.isArray(props)) return false
    return props.some((p) => String(p?.prop_key || '').trim() === 'desant')
  })
}

function DesantOrderBlock({
  meta,
  unitFaction,
  catalogUnits,
  onPatchMeta,
}: {
  meta: EditorMapUnitOrderEditorMeta
  unitFaction: string
  catalogUnits: EditorMapCatalogUnitPick[]
  onPatchMeta: EditorMapUnitOrderMenuProps['onPatchMeta']
}) {
  const list = desantCatalogUnits(catalogUnits, unitFaction)
  const catalogUnitId = meta.desant?.catalogUnitId

  return (
    <div style={{ padding: '6px 12px', fontSize: '12px' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Десант</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: '#555' }}>Десантник на борту</span>
        <select
          value={catalogUnitId != null ? String(catalogUnitId) : ''}
          onChange={(e) => {
            const v = e.target.value
            onPatchMeta((prev) => {
              const copy = { ...prev }
              if (!v) {
                delete copy.desant
                return copy
              }
              copy.desant = { catalogUnitId: Number(v) }
              return copy
            })
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: '13px',
          }}
        >
          <option value="">— выберите —</option>
          {list.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      {!list.length ? (
        <div style={{ marginTop: 6, color: '#888', lineHeight: 1.35 }}>
          Нет юнитов вашей фракции со свойством «Десант» в каталоге.
        </div>
      ) : null}
    </div>
  )
}

const EditorMapUnitOrderMenu: React.FC<EditorMapUnitOrderMenuProps> = ({
  unit,
  catalogUnits,
  onPatchMeta,
  artilleryFacingPickPending = false,
  onRequestArtilleryFacingPick,
  onCancelArtilleryFacingPick,
  onCloseMenu,
}) => {
  const meta = readUnitOrderEditorMeta(unit)
  const artDeploy = readArtilleryDeployMeta(meta)
  const unitFaction = String(unit.faction ?? '')
  const logisticsKeys = logisticsOrderKeysOnUnit(unit as { orders?: { order_key?: string }[] }).filter(
    (k) => k !== 'unloading',
  )
  const showDesant = unitHasOrderKey(unit as { orders?: { order_key?: string }[] }, 'desant')
  const showArtilleryDeploy = isArtilleryTypeUnit(unit)

  if (!showDesant && !logisticsKeys.length && !showArtilleryDeploy) return null

  return (
    <div style={{ borderTop: '1px solid #eee' }}>
      {showDesant ? (
        <DesantOrderBlock
          meta={meta}
          unitFaction={unitFaction}
          catalogUnits={catalogUnits}
          onPatchMeta={onPatchMeta}
        />
      ) : null}

      {logisticsKeys.map((k) => (
        <LogisticsOrderBlock
          key={k}
          orderKey={k}
          meta={meta}
          unitFaction={unitFaction}
          catalogUnits={catalogUnits}
          onPatchMeta={onPatchMeta}
        />
      ))}

      {showArtilleryDeploy ? (
        <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Артиллерия</div>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={Boolean(artDeploy.deployed)}
              onChange={(e) => {
                if (e.target.checked) {
                  onPatchMeta((prev) => {
                    const copy = { ...prev }
                    delete copy.artilleryDeployed
                    copy.artilleryDeploy = { deployed: true }
                    return copy
                  })
                  onCloseMenu?.()
                  window.setTimeout(() => onRequestArtilleryFacingPick?.(), 0)
                } else {
                  onPatchMeta((prev) => {
                    const copy = { ...prev }
                    delete copy.artilleryDeployed
                    delete copy.artilleryDeploy
                    return copy
                  })
                  onCancelArtilleryFacingPick?.()
                }
              }}
            />
            Развёрнутое положение
          </label>
          {artDeploy.deployed && !artilleryFacingPickPending && artDeploy.facingCellId != null ? (
            <div style={{ marginTop: 8, color: '#555', lineHeight: 1.4 }}>
              <span>
                Направление: гекс <strong>{artDeploy.facingCellId}</strong>
                {onRequestArtilleryFacingPick ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMenu?.()
                        window.setTimeout(() => onRequestArtilleryFacingPick(), 0)
                      }}
                      style={{
                        marginLeft: 4,
                        padding: '2px 6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Изменить
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default EditorMapUnitOrderMenu

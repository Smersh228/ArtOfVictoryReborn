import React, { useState } from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import { effectiveElevationLevel } from '../../game/cellElevation'
import {
  readTileMirror,
  readTileRotationSteps,
  TILE_ROTATION_STEPS,
} from '../../game/cellTileTransform'
import EditorMapUnitOrderMenu, { type EditorMapCatalogUnitPick } from './EditorMapUnitOrderMenu'
import { hasDotOnCell } from '../../game/cellDot'
import {
  applyStorageSupplyDefaults,
  cellHasEditorStructure,
  clearCellEditorStructures,
  ensureCellBuilds,
  hasStorageOnCell,
  STORAGE_DEFAULT_AMMO,
  STORAGE_DEFAULT_EXPLOSIVES,
  STORAGE_DEFAULT_MINES,
  STORAGE_DEFAULT_SMOKE,
} from '../../game/editorMapFortifications'
import {
  type EditorMapUnitOrderEditorMeta,
  patchUnitOrderEditorMeta,
} from '../../game/editorMapUnitOrderMeta'
import { factionForTeam, teamFromUnit, teamSideLabel, teamsForFaction } from '../../game/editorMapTeam'

const ELEVATION_LEVELS = [-1, 0, 1, 2, 3] as const

const STORAGE_SUPPLY_FIELDS = [
  { key: 'storageAmmo', label: 'Боезапас', max: STORAGE_DEFAULT_AMMO },
  { key: 'storageSmoke', label: 'Дымовые снаряды', max: STORAGE_DEFAULT_SMOKE },
  { key: 'storageExplosives', label: 'Взрывчатка', max: STORAGE_DEFAULT_EXPLOSIVES },
  { key: 'storageMines', label: 'Мины', max: STORAGE_DEFAULT_MINES },
] as const

function parseStorageSupplyDraft(raw: string, max: number): { text: string; value: number | null } {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return { text: '', value: null }
  const n = Math.min(max, parseInt(digits, 10))
  if (!Number.isFinite(n) || n < 0) return { text: '', value: null }
  return { text: String(n), value: n }
}

function StorageSupplyInput(props: {
  value: number
  max: number
  onCommit: (next: number) => void
}) {
  const { value, max, onCommit } = props
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const parsed = parseStorageSupplyDraft(e.target.value, max)
        setDraft(parsed.text)
        if (parsed.value != null) onCommit(parsed.value)
      }}
      onBlur={() => {
        const parsed = parseStorageSupplyDraft(draft ?? String(value), max)
        onCommit(parsed.value ?? 0)
        setDraft(null)
      }}
      style={{
        width: 52,
        padding: '2px 4px',
        borderRadius: 4,
        border: '1px solid #ccc',
        fontSize: '11px',
        textAlign: 'right',
      }}
    />
  )
}

interface UnitMenuUnit {
  name?: string
  instanceId?: string | number
}

interface UnitMenuState {
  x: number
  y: number
  unit: UnitMenuUnit
  cell: Cell
}

interface CellMenuState {
  x: number
  y: number
  cell: Cell
}

interface CellContextMenusProps {
  mode: 'editor' | 'battle'
  lobbyPreview: boolean
  unitMenu: UnitMenuState | null
  cellMenu: CellMenuState | null
  onDeleteUnit: () => void
  /** Правка ячейки в редакторе карты (например hexExtra.heightLevel). */
  onEditorCellPatch?: (cellId: number, patch: (cell: Cell) => Cell) => void
  editorTeamLimit?: 2 | 4 | 6
  /** Каталог юнитов для выбора груза в меню экземпляра. */
  editorCatalogUnits?: EditorMapCatalogUnitPick[]
  /** Правка orderEditorMeta экземпляра юнита на карте. */
  onEditorUnitPatch?: (
    cellId: number,
    unitInstanceId: number,
    patch: (unit: Record<string, unknown>) => Record<string, unknown>,
  ) => void
  artilleryFacingPick?: { unitInstanceId: number; unitCellId: number } | null
  onStartArtilleryFacingPick?: (unitInstanceId: number, unitCellId: number) => void
  onCancelArtilleryFacingPick?: () => void
  onStartDotFacingPick?: (cellId: number) => void
  onCloseUnitMenu?: () => void
  onCloseCellMenu?: () => void
}

function cellHexExtraRecord(cell: Cell): Record<string, unknown> {
  const ex = (cell as unknown as { hexExtra?: unknown }).hexExtra
  return ex && typeof ex === 'object' && !Array.isArray(ex) ? { ...(ex as Record<string, unknown>) } : {}
}

function formatUnitMeta(unit: UnitMenuUnit & { team?: unknown }) {
  const team = Number(unit.team)
  const teamBit = Number.isFinite(team) && team > 0 ? ` · Команда ${team}` : ''
  return `ID юнит: ${unit.instanceId ?? '—'}${teamBit}`
}

const menuActionStyle: React.CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '13px',
}

function menuActionHandlers(bg: string): {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => void
} {
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.backgroundColor = bg
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.backgroundColor = 'transparent'
    },
  }
}

const CellContextMenus: React.FC<CellContextMenusProps> = ({
  mode,
  lobbyPreview,
  unitMenu,
  cellMenu,
  onDeleteUnit,
  onEditorCellPatch,
  editorCatalogUnits = [],
  editorTeamLimit = 2,
  onEditorUnitPatch,
  artilleryFacingPick = null,
  onStartArtilleryFacingPick,
  onCancelArtilleryFacingPick,
  onStartDotFacingPick,
  onCloseCellMenu,
  onCloseUnitMenu,
}) => {
  if (!(mode === 'editor' && !lobbyPreview)) {
    return null
  }

  let unitMenuView: React.ReactNode = null
  if (unitMenu) {
    const liveUnit =
      unitMenu.cell.units?.find(
        (u) => Number((u as unknown as { instanceId?: unknown }).instanceId) === Number(unitMenu.unit.instanceId),
      ) ?? unitMenu.unit
    const liveUnitRecord = liveUnit as unknown as Record<string, unknown>
    const unitInstanceId = Number(liveUnitRecord.instanceId)
    const cellId = unitMenu.cell.id

    unitMenuView = (
      <div
        style={{
          position: 'absolute',
          top: unitMenu.y,
          left: unitMenu.x,
          transform: 'translate(-50%, 0)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          padding: '4px 0',
          minWidth: '160px',
          zIndex: 1000,
          border: '1px solid #ddd',
          color: '#333',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #eee',
            fontWeight: 'bold',
            fontSize: '13px',
            backgroundColor: '#f8f8f8',
          }}
        >
          {unitMenu.unit.name || (liveUnit as UnitMenuUnit).name || 'Юнит'}
        </div>
        <div
          style={{
            padding: '4px 12px 6px',
            borderBottom: '1px solid #eee',
            fontSize: '12px',
            fontWeight: 600,
            color: '#1565c0',
            backgroundColor: '#f8f8f8',
          }}
        >
          {formatUnitMeta(liveUnit as UnitMenuUnit)}
        </div>
        {onEditorUnitPatch && Number.isFinite(unitInstanceId) ? (
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '8px 12px',
              borderBottom: '1px solid #eee',
              fontSize: '12px',
              fontWeight: 600,
              color: '#333',
            }}
          >
            Команда
            <select
              value={teamFromUnit(liveUnitRecord, editorTeamLimit)}
              onChange={(e) => {
                const team = teamFromUnit(
                  { team: Number(e.target.value), faction: liveUnitRecord.faction },
                  editorTeamLimit,
                )
                onEditorUnitPatch(cellId, unitInstanceId, (u) => ({
                  ...u,
                  team,
                  faction: factionForTeam(team),
                }))
              }}
              style={{
                width: '100%',
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: '12px',
              }}
            >
              {teamsForFaction(liveUnitRecord.faction, editorTeamLimit).map((team) => (
                <option key={team} value={team}>
                  {team} {teamSideLabel(team)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {onEditorUnitPatch && Number.isFinite(unitInstanceId) ? (
          <EditorMapUnitOrderMenu
            unit={liveUnitRecord}
            catalogUnits={editorCatalogUnits}
            artilleryFacingPickPending={
              artilleryFacingPick != null &&
              artilleryFacingPick.unitInstanceId === unitInstanceId &&
              artilleryFacingPick.unitCellId === cellId
            }
            onRequestArtilleryFacingPick={() => onStartArtilleryFacingPick?.(unitInstanceId, cellId)}
            onCancelArtilleryFacingPick={onCancelArtilleryFacingPick}
            onCloseMenu={onCloseUnitMenu}
            onPatchMeta={(metaPatch) => {
              onEditorUnitPatch(cellId, unitInstanceId, (u) =>
                patchUnitOrderEditorMeta(u, metaPatch as (prev: EditorMapUnitOrderEditorMeta) => EditorMapUnitOrderEditorMeta),
              )
            }}
          />
        ) : null}

        <div style={{ padding: '4px 0' }}>
          <div
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#d32f2f',
            }}
            onClick={onDeleteUnit}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fff3f5')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>Удалить юнит</span>
          </div>
        </div>
      </div>
    )
  }

  let cellMenuView: React.ReactNode = null
  if (cellMenu) {
    const effectiveLevel = effectiveElevationLevel(cellMenu.cell)
    /** Не 0 — заданный уровень −1…3; 0 — равнина (поле в JSON не храним). */
    const elevationOn = effectiveLevel !== 0
    const levelValue = elevationOn ? effectiveLevel : 1
    const cellImg = String((cellMenu.cell as unknown as { img?: unknown }).img ?? '').trim()
    const tileRotation = readTileRotationSteps(cellMenu.cell)
    const tileMirror = readTileMirror(cellMenu.cell)

    const patchHexExtra = (mutate: (draft: Record<string, unknown>) => Record<string, unknown>) => {
      if (!onEditorCellPatch) return
      const cellId = cellMenu.cell.id
      onEditorCellPatch(cellId, (prev) => {
        const next = { ...(prev as unknown as Record<string, unknown>) } as Record<string, unknown> & {
          hexExtra?: Record<string, unknown>
        }
        const base = cellHexExtraRecord(prev as Cell)
        const merged = mutate({ ...base })
        if (Object.keys(merged).length === 0) {
          delete next.hexExtra
        } else {
          next.hexExtra = merged
        }
        return next as unknown as Cell
      })
    }

    const setElevationEnabled = (enabled: boolean, level = 0) => {
      if (!enabled) {
        patchHexExtra((draft) => {
          const { heightLevel: _h, ...rest } = draft
          return rest
        })
        return
      }
      const lv = ELEVATION_LEVELS.includes(level as (typeof ELEVATION_LEVELS)[number])
        ? level
        : 0
      patchHexExtra((draft) => ({ ...draft, heightLevel: lv }))
    }

    const setElevationLevel = (level: number) => {
      if (level === 0) {
        setElevationEnabled(false)
        return
      }
      const lv = ELEVATION_LEVELS.includes(level as (typeof ELEVATION_LEVELS)[number])
        ? level
        : 1
      patchHexExtra((draft) => ({ ...draft, heightLevel: lv }))
    }

    const rotateTile = () => {
      const next = (readTileRotationSteps(cellMenu.cell) + 1) % TILE_ROTATION_STEPS
      patchHexExtra((draft) => ({ ...draft, tileRotation: next }))
    }

    const toggleTileMirror = () => {
      const next = !readTileMirror(cellMenu.cell)
      patchHexExtra((draft) => {
        if (next) return { ...draft, tileMirror: true }
        const { tileMirror: _m, ...rest } = draft
        return rest
      })
    }

    cellMenuView = (
      <div
        style={{
          position: 'absolute',
          top: cellMenu.y,
          left: cellMenu.x,
          transform: 'translate(-50%, 0)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          padding: '4px 0',
          minWidth: '200px',
          zIndex: 1000,
          border: '1px solid #ddd',
          color: '#333',
        }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #eee',
            fontWeight: 'bold',
            fontSize: '13px',
            backgroundColor: '#f8f8f8',
          }}
        >
          Клетка
        </div>
        <div
          style={{
            padding: '8px 12px',
            fontWeight: 'bold',
            fontSize: '15px',
            color: '#000000',
          }}
        >
          ID: {cellMenu.cell.id}
        </div>
        {onStartDotFacingPick && hasDotOnCell(cellMenu.cell.builds) ? (
          <div
            role="button"
            tabIndex={0}
            style={{ ...menuActionStyle, borderTop: '1px solid #eee' }}
            onClick={() => {
              onStartDotFacingPick(cellMenu.cell.id)
              onCloseCellMenu?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onStartDotFacingPick(cellMenu.cell.id)
                onCloseCellMenu?.()
              }
            }}
            {...menuActionHandlers('#f0f7ff')}
          >
            Сектор стрельбы
          </div>
        ) : null}
        {onEditorCellPatch && hasStorageOnCell(cellMenu.cell.builds) ? (
          <div
            style={{
              padding: '6px 12px 8px',
              borderTop: '1px solid #eee',
              fontSize: '11px',
            }}
            onMouseDown={(ev) => ev.stopPropagation()}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#555' }}>Склад — припасы</div>
            {STORAGE_SUPPLY_FIELDS.map((field) => {
              const builds = applyStorageSupplyDefaults(ensureCellBuilds(cellMenu.cell.builds))
              const value = Number(builds[field.key] ?? 0)
              return (
                <label
                  key={field.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: '#555' }}>{field.label}</span>
                  <StorageSupplyInput
                    key={`${cellMenu.cell.id}-${field.key}`}
                    value={Number.isFinite(value) ? value : 0}
                    max={field.max}
                    onCommit={(next) => {
                      onEditorCellPatch(cellMenu.cell.id, (prev) => {
                        const nextBuilds = applyStorageSupplyDefaults(ensureCellBuilds(prev.builds))
                        nextBuilds[field.key] = next
                        return { ...prev, builds: nextBuilds }
                      })
                    }}
                  />
                </label>
              )
            })}
          </div>
        ) : null}
        {onEditorCellPatch && cellHasEditorStructure(cellMenu.cell) ? (
          <div
            role="button"
            tabIndex={0}
            style={{ ...menuActionStyle, borderTop: '1px solid #eee', color: '#d32f2f' }}
            onClick={() => {
              onEditorCellPatch(cellMenu.cell.id, (prev) => clearCellEditorStructures(prev))
              onCloseCellMenu?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEditorCellPatch(cellMenu.cell.id, (prev) => clearCellEditorStructures(prev))
                onCloseCellMenu?.()
              }
            }}
            {...menuActionHandlers('#fff3f5')}
          >
            Удалить сооружение
          </div>
        ) : null}
        {onEditorCellPatch ? (
          <div
            style={{
              padding: '8px 12px 10px',
              borderTop: '1px solid #eee',
              fontSize: '12px',
            }}
            onMouseDown={(ev) => ev.stopPropagation()}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 600,
                marginBottom: elevationOn ? 8 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={elevationOn}
                onChange={(e) => {
                  if (e.target.checked) setElevationEnabled(true, 1)
                  else setElevationEnabled(false)
                }}
              />
              Возвышенность
            </label>
            {elevationOn ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: '#555' }}>Уровень (−1 … 3)</span>
                <select
                  value={String(levelValue)}
                  onChange={(e) => setElevationLevel(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    fontSize: '13px',
                  }}
                >
                  {ELEVATION_LEVELS.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {cellImg ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee' }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#555' }}>Текстура гекса</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ ...menuActionStyle, flex: 1, justifyContent: 'center', borderRadius: 6, border: '1px solid #ddd' }}
                    onClick={rotateTile}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        rotateTile()
                      }
                    }}
                    {...menuActionHandlers('#f0f7ff')}
                    title="Повернуть на 60°"
                  >
                    <span aria-hidden>↻</span>
                    <span>Повернуть</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    style={{
                      ...menuActionStyle,
                      flex: 1,
                      justifyContent: 'center',
                      borderRadius: 6,
                      border: '1px solid #ddd',
                      fontWeight: tileMirror ? 700 : 400,
                      color: tileMirror ? '#1565c0' : '#333',
                    }}
                    onClick={toggleTileMirror}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleTileMirror()
                      }
                    }}
                    {...menuActionHandlers('#f5f5f5')}
                    title="Отразить по горизонтали"
                  >
                    <span aria-hidden>⇋</span>
                    <span>Отразить</span>
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: '11px', color: '#888' }}>
                  Поворот: {tileRotation * 60}°{tileMirror ? ', отражено' : ''}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      {unitMenuView}
      {cellMenuView}
    </div>
  )
}

export default CellContextMenus

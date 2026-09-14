import React, { useMemo } from 'react'
import {
  cargoFromTrainSlots,
  cargoFromTruckSlots,
  catalogUnitIsArtillery,
  catalogUnitIsInfantry,
  catalogUnitIsTrainOtherCargo,
  catalogCanTechTowArtillery,
  factionsMatch,
  normalizeTransportCargo,
  trainCargoSlots,
  truckCargoSlots,
  type EditorCatalogTransportUnit,
  type TransportKind,
} from '../../game/editorMapTransportCargo'
import styles from '../../pages/styleModules/editorMap.module.css'

type CargoCatalogUnit = EditorCatalogTransportUnit & { name?: string }

function catalogByIdMap(units: readonly CargoCatalogUnit[]): Map<number, CargoCatalogUnit> {
  const map = new Map<number, CargoCatalogUnit>()
  for (const u of units) {
    const id = Number(u.id)
    if (Number.isFinite(id) && id > 0) map.set(id, u)
  }
  return map
}

function SelectRow({
  label,
  value,
  options,
  onChange,
  variant,
}: {
  label: string
  value: number
  options: CargoCatalogUnit[]
  onChange: (id: number) => void
  variant: 'panel' | 'menu'
}) {
  const select = (
    <select
      className={variant === 'panel' ? styles.cargoSelect : undefined}
      value={value > 0 ? String(value) : ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(v ? Number(v) : 0)
      }}
      style={
        variant === 'menu'
          ? {
              width: '100%',
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: '13px',
            }
          : undefined
      }
    >
      <option value="">— нет —</option>
      {options.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name || `Юнит ${u.id}`}
            </option>
          ))}
    </select>
  )
  if (variant === 'menu') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
        <span style={{ color: '#555' }}>{label}</span>
        {select}
      </label>
    )
  }
  return (
    <label className={styles.cargoSlot}>
      <span className={styles.cargoSlotLabel}>{label}</span>
      {select}
    </label>
  )
}

export const TransportCargoEditor: React.FC<{
  kind: TransportKind
  cargoIds: readonly number[]
  catalogUnits: CargoCatalogUnit[]
  faction?: string
  hostUnit?: CargoCatalogUnit | null
  onChange: (ids: number[]) => void
  variant?: 'panel' | 'menu'
  title?: string
}> = ({ kind, cargoIds, catalogUnits, faction, hostUnit, onChange, variant = 'panel', title }) => {
  const units = useMemo(() => {
    return catalogUnits.filter((u) => factionsMatch(faction, u.faction))
  }, [catalogUnits, faction])
  const byId = useMemo(() => catalogByIdMap(units), [units])
  const infantry = useMemo(() => units.filter((u) => catalogUnitIsInfantry(u)), [units])
  const artillery = useMemo(
    () => units.filter((u) => catalogUnitIsArtillery(u) && catalogCanTechTowArtillery(hostUnit ?? null, u)),
    [units, hostUnit],
  )
  const trainOther = useMemo(
    () => units.filter((u) => catalogUnitIsTrainOtherCargo(u)),
    [units],
  )

  if (!kind) return null

  const emit = (ids: number[]) => {
    onChange(normalizeTransportCargo(kind, ids, byId, hostUnit))
  }

  const heading =
    title ?? (kind === 'train' ? 'Груз поезда (2 пехоты + 2 любых)' : 'Груз грузовика (пехота или артиллерия)')

  if (kind === 'truck') {
    const slots = truckCargoSlots(cargoIds, byId)
    const artilleryId = artillery.some((u) => Number(u.id) === slots.artilleryId) ? slots.artilleryId : 0
    const body = (
      <>
        <SelectRow
          label="Пехота"
          value={slots.infantryId}
          options={infantry}
          variant={variant}
          onChange={(id) => emit(cargoFromTruckSlots(id, artilleryId))}
        />
        <SelectRow
          label="Артиллерия"
          value={artilleryId}
          options={artillery}
          variant={variant}
          onChange={(id) => emit(cargoFromTruckSlots(slots.infantryId, id))}
        />
      </>
    )
    if (variant === 'menu') {
      return (
        <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{heading}</div>
          {body}
        </div>
      )
    }
    return (
      <div className={styles.cargoEditor}>
        <div className={styles.cargoEditorTitle}>{heading}</div>
        {body}
      </div>
    )
  }

  const slots = trainCargoSlots(cargoIds, byId)
  const setInf = (index: number, id: number) => {
    const next = slots.infantryIds.slice()
    next[index] = id
    emit(cargoFromTrainSlots(next, slots.otherIds))
  }
  const setOther = (index: number, id: number) => {
    const next = slots.otherIds.slice()
    next[index] = id
    emit(cargoFromTrainSlots(slots.infantryIds, next))
  }
  const body = (
    <>
      <SelectRow
        label="Пехота 1"
        value={slots.infantryIds[0] ?? 0}
        options={infantry}
        variant={variant}
        onChange={(id) => setInf(0, id)}
      />
      <SelectRow
        label="Пехота 2"
        value={slots.infantryIds[1] ?? 0}
        options={infantry}
        variant={variant}
        onChange={(id) => setInf(1, id)}
      />
      <SelectRow
        label="Любой 1"
        value={slots.otherIds[0] ?? 0}
        options={trainOther}
        variant={variant}
        onChange={(id) => setOther(0, id)}
      />
      <SelectRow
        label="Любой 2"
        value={slots.otherIds[1] ?? 0}
        options={trainOther}
        variant={variant}
        onChange={(id) => setOther(1, id)}
      />
    </>
  )
  if (variant === 'menu') {
    return (
      <div style={{ padding: '6px 12px', borderTop: '1px solid #eee', fontSize: '12px' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{heading}</div>
        {body}
      </div>
    )
  }
  return (
    <div className={styles.cargoEditor}>
      <div className={styles.cargoEditorTitle}>{heading}</div>
      {body}
    </div>
  )
}

export default TransportCargoEditor

import React, { useState, useEffect } from 'react'
import styles from '../styleModules/listMain.module.css'
import Button from '../Button'
import { fetchSavedMaps, type SavedMapListItem } from '../../api/maps'

interface CreateServerPanelProps {
  onCancel: () => void
  onCreate: (data: { name: string; map: string; mapId: number }) => void
}

const CreateServerPanel: React.FC<CreateServerPanelProps> = ({ onCancel, onCreate }) => {
  const [name, setName] = useState('Новая комната')
  const [maps, setMaps] = useState<SavedMapListItem[]>([])
  const [mapId, setMapId] = useState<number | null>(null)
  const [mapsLoading, setMapsLoading] = useState(true)
  const [mapsError, setMapsError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMapsLoading(true)
      setMapsError(null)
      try {
        const { maps: list } = await fetchSavedMaps()
        if (cancelled) return
        setMaps(list)
        setMapId((prev) => {
          if (list.length === 0) return null
          if (prev != null && list.some((m) => m.id === prev)) return prev
          return list[0].id
        })
      } catch (e) {
        if (!cancelled) {
          setMaps([])
          setMapId(null)
          setMapsError(e instanceof Error ? e.message : 'Не удалось загрузить список карт')
        }
      } finally {
        if (!cancelled) setMapsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = !mapsLoading && maps.length > 0 && mapId != null && !mapsError

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !canSubmit || mapId == null) return
    const selected = maps.find((m) => m.id === mapId)
    const mapLabel = selected?.name.trim() ? selected.name : `Карта #${mapId}`
    setBusy(true)
    try {
      onCreate({ name: name.trim() || 'Комната', map: mapLabel, mapId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${styles.listWrap} ${styles.listWrapCreate}`}>
      <h2 className={styles.listHeading}>Создать сервер</h2>
      <form className={styles.createForm} onSubmit={submit}>
        <label className={styles.fieldLabel}>
          Название
          <input className={styles.fieldInput} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.fieldLabel}>
          Карта
          <select
            className={styles.fieldSelect}
            value={mapId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setMapId(v === '' ? null : Number(v))
            }}
            disabled={mapsLoading || maps.length === 0}
          >
            {mapsLoading ? (
              <option value="">Загрузка списка карт…</option>
            ) : maps.length === 0 ? (
              <option value="">Нет сохранённых карт</option>
            ) : (
              maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name.trim() || `Карта #${m.id}`}
                </option>
              ))
            )}
          </select>
        </label>
        {mapsError ? <p className={styles.listError}>{mapsError}</p> : null}
        {!mapsLoading && maps.length === 0 && !mapsError ? (
          <p className={styles.listHint}>Сохраните карту в редакторе карт («Сохранить карту»), затем обновите этот экран.</p>
        ) : null}
        <div className={styles.createActions}>
          <Button name="Отмена" size={180} onClick={onCancel} />
          <button type="submit" className={styles.submitLike} disabled={busy || !canSubmit}>
            {busy ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateServerPanel

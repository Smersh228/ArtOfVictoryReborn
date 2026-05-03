import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './styleModules/editorMap.module.css'
import Cells from '../components/map/Cells'
import EditorMapToolbar from '../components/editorMap/EditorMapToolbar'
import EditorMapToolPanel from '../components/editorMap/EditorMapToolPanel'
import EditorMapGridModal from '../components/editorMap/EditorMapGridModal'
import EditorMapGuideModal from '../components/editorMap/EditorMapGuideModal'
import EditorMapSaveConfirmModal from '../components/editorMap/EditorMapSaveConfirmModal'
import EditorMapExportModal from '../components/editorMap/EditorMapExportModal'
import EditorMapObjectPalette from '../components/editorMap/EditorMapObjectPalette'
import { ConditionsPanel, ScenarioPanel, UnitsFilters, type ScenarioPhotoSlot } from '../components/editorMap/EditorMapSidePanels'
import { Cell } from './../../../server/src/game/gameLogic/cells/cell'
import { generateEmptyGrid } from '../game/hexGrid'
import { fetchEditorCatalog, uploadEditorImage } from '../api/editorCatalog'
import {
  deleteSavedMap,
  fetchSavedMapById,
  fetchSavedMaps,
  moderateSavedMap,
  saveEditorMapToDb,
  type SavedMapListItem,
} from '../api/maps'

type EditorTabId = 'units' | 'hexes' | 'conditions' | 'scenario'

type FactionId = 'all' | 'germany' | 'ussr'

type UnitTypeId =
  | 'all'
  | 'infantry'
  | 'artillery'
  | 'tech'
  | 'armor'
  | 'lightTank'
  | 'mediumTank'
  | 'heavyTank'
  | 'lightAir'
  | 'heavyAir'

type CatalogUnit = {
  id: number
  name: string
  type: UnitTypeId
  faction: Exclude<FactionId, 'all'>
  imagePath: string
}

type CatalogHex = {
  id: string
  type: string
  name: string
  imagePath: string
  moveCost?: number
  moveCostInf?: number
  moveCostTech?: number
  defBonusInf?: number
  defBonusTech?: number
  visionBlock?: boolean
}

type PlacedUnit = CatalogUnit & {
  instanceId: number
  str?: number
  def?: number
  mor?: number
  mines?: number
  ammoSupply?: string
  health?: number
  ammo?: number
  orders?: BattleUnitOrderRef[]
}


type BattleUnitOrderRef = {
  id: number
  name: string
  order_key?: string
}

type UnitCombatStatsFromDb = {
  str: number
  def: number
  mor: number
  mines: number
  ammoSupply: string
  orders: BattleUnitOrderRef[]
}

function parseOrdersFromUnitsEditorRow(r: Record<string, unknown>): BattleUnitOrderRef[] {
  const raw = r.orders
  if (!Array.isArray(raw)) return []
  const out: BattleUnitOrderRef[] = []
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = Number(o.id)
    if (!Number.isFinite(id)) continue
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const row: BattleUnitOrderRef = { id, name: name || `Приказ ${id}` }
    if (typeof o.order_key === 'string' && o.order_key.trim()) row.order_key = o.order_key.trim()
    out.push(row)
  }
  return out
}

type AxisCaptureState = {
  enabled: boolean
  hexes: string
  turns: string
  requiredUnits: string
}

type AxisEliminationState = {
  enabled: boolean
  type: 'all' | 'specific'
  specificUnits: string
}


type StruggleFactionId = 'wehrmacht' | 'rkka'

const EDITOR_TABS: { id: EditorTabId; label: string }[] = [
  { id: 'units', label: 'Юниты' },
  { id: 'hexes', label: 'Гексы' },
  { id: 'conditions', label: 'Условия игры' },
  { id: 'scenario', label: 'Сценарий' },
]

const MAX_UNITS_PER_CELL = 3


const MAP_BASE_WIDTH = 1400
const MAP_BASE_HEIGHT = 835
const MAP_BASE_CELL = 42

function isCatalogUnit(item: CatalogUnit | CatalogHex | null): item is CatalogUnit {
  return item != null && 'faction' in item
}

function isCatalogHex(item: CatalogUnit | CatalogHex | null): item is CatalogHex {
  return item != null && !('faction' in item)
}

/** Гекс «равнина» из каталога для начальной заливки сетки (тип, картинка, стоимость хода). */
function pickDefaultPlainHex(hexes: CatalogHex[]): CatalogHex | null {
  if (!hexes.length) return null
  const byType = hexes.find((h) => h.type === 'plain')
  if (byType) return byType
  const byNameRu = hexes.find((h) => /равнин/i.test(h.name))
  if (byNameRu) return byNameRu
  const byPlainWord = hexes.find((h) => /plain/i.test(h.name) || /plain/i.test(h.type))
  if (byPlainWord) return byPlainWord
  return hexes[0]
}

function maxPlacedUnitInstanceId(cellArr: Cell[]): number {
  let max = 0
  for (const c of cellArr) {
    for (const u of c.units || []) {
      const id = (u as unknown as { instanceId?: unknown }).instanceId
      if (typeof id === 'number' && Number.isFinite(id) && id > max) max = id
    }
  }
  return max
}

function inferGridSizeFromCells(cellArr: Cell[]): { width: number; height: number } {
  if (!cellArr.length) return { width: 10, height: 10 }
  const qs = cellArr.map((c) => c.coor.x)
  const rs = cellArr.map((c) => c.coor.z)
  const w = Math.max(1, Math.max(...qs) - Math.min(...qs) + 1)
  const h = Math.max(1, Math.max(...rs) - Math.min(...rs) + 1)
  return { width: w, height: h }
}

const EditorMap: React.FC = () => {
  const navigate = useNavigate()
  const [cells, setCells] = useState<Cell[]>([])
  const [showGridModal, setShowGridModal] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportSavedMaps, setExportSavedMaps] = useState<SavedMapListItem[]>([])
  const [exportMapsLoading, setExportMapsLoading] = useState(false)
  const [exportMapsError, setExportMapsError] = useState<string | null>(null)
  const [exportingSavedMapId, setExportingSavedMapId] = useState<number | null>(null)
  const [showSaveMapConfirmModal, setShowSaveMapConfirmModal] = useState(false)
  const [saveMapBusy, setSaveMapBusy] = useState(false)
  const [widthSize, setWidthSize] = useState(10)
  const [heightSize, setHeightSize] = useState(10)
  const [activeTab, setActiveTab] = useState<EditorTabId>('units')
  const [selectedFaction, setSelectedFaction] = useState<FactionId>('all')
  const [selectedUnitType, setSelectedUnitType] = useState<UnitTypeId>('all')
  const [selectedItem, setSelectedItem] = useState<CatalogUnit | CatalogHex | null>(null)
  const [apiUnits, setApiUnits] = useState<CatalogUnit[]>([])
  const [apiHexes, setApiHexes] = useState<CatalogHex[]>([])
  const [unitCombatStatsByCatalogId, setUnitCombatStatsByCatalogId] = useState<
    Map<number, UnitCombatStatsFromDb>
  >(() => new Map())
  const nextInstanceIdRef = useRef(1)

  useEffect(() => {
    fetchEditorCatalog()
      .then((d) => {
        setApiUnits(
          (d.units || []).map((u) => ({
            ...u,
            type: u.type as UnitTypeId,
            faction: u.faction as Exclude<FactionId, 'all'>,
          })),
        )
        setApiHexes(d.hexes || [])

        const combatMap = new Map<number, UnitCombatStatsFromDb>()
        for (const row of d.unitsEditor || []) {
          const r = row as Record<string, unknown>
          const id = r.id
          if (typeof id !== 'number' || !Number.isFinite(id)) continue
          const toNum = (x: unknown): number => {
            if (typeof x === 'number' && Number.isFinite(x)) return x
            const n = Number(x)
            return Number.isFinite(n) ? n : 0
          }
          const ammoRaw = r.ammo
          const ammoSupply =
            ammoRaw != null && String(ammoRaw).trim() !== '' ? String(ammoRaw).trim() : ''
          combatMap.set(id, {
            str: toNum(r.str),
            def: toNum(r.def),
            mor: toNum(r.mor),
            mines: toNum(r.mines),
            ammoSupply,
            orders: parseOrdersFromUnitsEditorRow(r),
          })
        }
        setUnitCombatStatsByCatalogId(combatMap)
      })
      .catch(() => {})
  }, [])

  const catalogUnits = useMemo(() => apiUnits, [apiUnits])

  const catalogHexes = useMemo(() => apiHexes, [apiHexes])

  const [axisCapture, setAxisCapture] = useState<AxisCaptureState>({
    enabled: false,
    hexes: '',
    turns: '',
    requiredUnits: '1',
  })
  const [axisElimination, setAxisElimination] = useState<AxisEliminationState>({
    enabled: false,
    type: 'all',
    specificUnits: '',
  })
  const [struggleFaction, setStruggleFaction] = useState<StruggleFactionId>('wehrmacht')
  const [allyTasks, setAllyTasks] = useState('')
  const [axisTasks, setAxisTasks] = useState('')
  const [maxTurns, setMaxTurns] = useState('20')
  const [missionBrief, setMissionBrief] = useState('')
  const [historyText, setHistoryText] = useState('')
  const [scenarioPhotos, setScenarioPhotos] = useState<readonly [string, string]>(['', ''])

  const mapHostRef = useRef<HTMLDivElement>(null)
  const [mapLayout, setMapLayout] = useState({
    width: MAP_BASE_WIDTH,
    height: MAP_BASE_HEIGHT,
    cellSize: MAP_BASE_CELL,
  })

  useEffect(() => {
    if (!showExportModal) return
    setExportMapsLoading(true)
    setExportMapsError(null)
    fetchSavedMaps({ editorOnly: true })
      .then((r) => setExportSavedMaps(Array.isArray(r.maps) ? r.maps : []))
      .catch((e) =>
        setExportMapsError(e instanceof Error ? e.message : 'Не удалось загрузить список карт'),
      )
      .finally(() => setExportMapsLoading(false))
  }, [showExportModal])

  useEffect(() => {
    const el = mapHostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr || cr.width < 280) return
      const w = Math.floor(cr.width)
      const scale = w / MAP_BASE_WIDTH
      const h = Math.max(320, Math.floor(MAP_BASE_HEIGHT * scale))
      const cellSize = Math.max(20, Math.round(MAP_BASE_CELL * scale))
      setMapLayout((prev) => {
        if (prev.width === w && prev.height === h && prev.cellSize === cellSize) return prev
        return { width: w, height: h, cellSize }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function applyGrid() {
    const base = generateEmptyGrid(widthSize, heightSize)
    const plain = pickDefaultPlainHex(catalogHexes)
    if (plain) {
      const inf = plain.moveCostInf ?? plain.moveCost ?? 1
      const tech = plain.moveCostTech ?? plain.moveCost ?? 1
      const legacy = plain.moveCost ?? inf
      setCells(
        base.map(
          (c) =>
            ({
              ...c,
              type: plain.type,
              img: plain.imagePath,
              moveCost: legacy,
              moveCostInf: inf,
              moveCostTech: tech,
              visionBlock: Boolean(plain.visionBlock),
            }) as Cell,
        ),
      )
    } else {
      setCells(base)
    }
    setShowGridModal(false)
  }

  function handleCellClick(cell: Cell) {
    if (!selectedItem) return

    if (activeTab === 'hexes' && isCatalogHex(selectedItem)) {
      const hexType = selectedItem.type
      const inf = selectedItem.moveCostInf ?? selectedItem.moveCost ?? 1
      const tech = selectedItem.moveCostTech ?? selectedItem.moveCost ?? 1
      const legacy = selectedItem.moveCost ?? inf
      setCells((prev) =>
        prev.map((c) =>
          c.id === cell.id
            ? ({
                ...c,
                type: hexType,
                img: selectedItem.imagePath,
                moveCost: legacy,
                moveCostInf: inf,
                moveCostTech: tech,
                visionBlock: Boolean(selectedItem.visionBlock),
                defBonusInf: Math.max(0, Number(selectedItem.defBonusInf) || 0),
                defBonusTech: Math.max(0, Number(selectedItem.defBonusTech) || 0),
              } as Cell)
            : c,
        ),
      )
      return
    }

    if (activeTab === 'units' && isCatalogUnit(selectedItem)) {
      setCells((prev) =>
        prev.map((c) => {
          if (c.id !== cell.id) return c
          const currentUnits = c.units || []
          if (currentUnits.length >= MAX_UNITS_PER_CELL) {
            window.alert(`Нельзя поставить больше ${MAX_UNITS_PER_CELL} юнитов на один гекс!`)
            return c
          }
          const instanceId = nextInstanceIdRef.current++
          const st = unitCombatStatsByCatalogId.get(selectedItem.id)
          const newUnit: PlacedUnit = {
            ...selectedItem,
            instanceId,
            ...(st
              ? {
                  str: st.str,
                  def: st.def,
                  mor: st.mor,
                  mines: st.mines,
                  ...(st.ammoSupply ? { ammoSupply: st.ammoSupply } : {}),
                  ...(st.orders.length ? { orders: st.orders } : {}),
                }
              : {}),
          }
          return { ...c, units: [...currentUnits, newUnit as unknown as (typeof c.units)[number]] }
        }),
      )
      return
    }

  }

  function handleUnitDelete(unitInstanceId: number, cell: Cell) {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id === cell.id && c.units) {
          return {
            ...c,
            units: c.units.filter((u) => (u as unknown as PlacedUnit).instanceId !== unitInstanceId),
          }
        }
        return c
      }),
    )
  }

  async function handleScenarioPhotoUpload(slot: ScenarioPhotoSlot, file: File | null) {
    if (!file) return
    try {
      const { path } = await uploadEditorImage(file)
      setScenarioPhotos((prev) => {
        const next: [string, string] = [prev[0], prev[1]]
        next[slot] = path
        return next
      })
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Ошибка загрузки')
    }
  }

  function handleScenarioPhotoClear(slot: ScenarioPhotoSlot) {
    setScenarioPhotos((prev) => {
      const next: [string, string] = [prev[0], prev[1]]
      next[slot] = ''
      return next
    })
  }

  function buildMapPayload() {
    const attached = scenarioPhotos.filter((p) => p.trim() !== '')
    return {
      cells: JSON.parse(JSON.stringify(cells)) as unknown[],
      conditions: { axisCapture, axisElimination, struggleFaction, allyTasks, axisTasks, maxTurns },
      scenario: { missionBrief, historyText, photos: attached },
    }
  }

  /** Восстановить состояние редактора из payload, сохранённого на сервере. */
  function applyPayloadFromServer(payload: unknown, savedMapName: string): boolean {
    if (payload == null || typeof payload !== 'object') {
      window.alert('Некорректные данные карты')
      return false
    }
    const p = payload as Record<string, unknown>
    const rawCells = p.cells
    if (!Array.isArray(rawCells) || rawCells.length === 0) {
      window.alert('В карте нет ячеек')
      return false
    }
    const loadedCells = JSON.parse(JSON.stringify(rawCells)) as Cell[]

    const cond =
      p.conditions != null && typeof p.conditions === 'object'
        ? (p.conditions as Record<string, unknown>)
        : {}

    if (cond.axisCapture != null && typeof cond.axisCapture === 'object') {
      const ac = cond.axisCapture as Record<string, unknown>
      const strField = (v: unknown, fallback: string) => {
        if (typeof v === 'string') return v
        if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
        return fallback
      }
      setAxisCapture({
        enabled: Boolean(ac.enabled),
        hexes: strField(ac.hexes, ''),
        turns: strField(ac.turns, ''),
        requiredUnits: strField(ac.requiredUnits, '1') || '1',
      })
    }
    if (cond.axisElimination != null && typeof cond.axisElimination === 'object') {
      const ae = cond.axisElimination as Record<string, unknown>
      const t = ae.type
      setAxisElimination({
        enabled: Boolean(ae.enabled),
        type: t === 'specific' || t === 'all' ? t : 'all',
        specificUnits: typeof ae.specificUnits === 'string' ? ae.specificUnits : '',
      })
    }
    const sf = cond.struggleFaction
    if (sf === 'rkka' || sf === 'wehrmacht') setStruggleFaction(sf)
    if (typeof cond.allyTasks === 'string') setAllyTasks(cond.allyTasks)
    if (typeof cond.axisTasks === 'string') setAxisTasks(cond.axisTasks)
    if (typeof cond.maxTurns === 'string') setMaxTurns(cond.maxTurns)
    else if (typeof cond.maxTurns === 'number' && Number.isFinite(cond.maxTurns)) setMaxTurns(String(Math.trunc(cond.maxTurns)))

    const scen =
      p.scenario != null && typeof p.scenario === 'object'
        ? (p.scenario as Record<string, unknown>)
        : {}
    const brief =
      typeof scen.missionBrief === 'string' && scen.missionBrief.trim()
        ? scen.missionBrief
        : savedMapName.trim()
    setMissionBrief(brief)
    setHistoryText(typeof scen.historyText === 'string' ? scen.historyText : '')
    const photosRaw = scen.photos
    let p0 = ''
    let p1 = ''
    if (Array.isArray(photosRaw)) {
      if (typeof photosRaw[0] === 'string') p0 = photosRaw[0]
      if (typeof photosRaw[1] === 'string') p1 = photosRaw[1]
    }
    setScenarioPhotos([p0, p1])

    setCells(loadedCells)
    const { width, height } = inferGridSizeFromCells(loadedCells)
    setWidthSize(width)
    setHeightSize(height)
    nextInstanceIdRef.current = Math.max(maxPlacedUnitInstanceId(loadedCells) + 1, 1)
    return true
  }

  async function openSavedMapInEditor(mapItem: SavedMapListItem) {
    const label = mapItem.name || `Карта #${mapItem.id}`
    if (
      !window.confirm(
        `Загрузить «${label}» в редактор? Текущее содержимое поля и форм будет заменено (без сохранения на сервере).`,
      )
    ) {
      return
    }
    setExportingSavedMapId(mapItem.id)
    try {
      const { map } = await fetchSavedMapById(mapItem.id)
      if (applyPayloadFromServer(map.payload, map.name || label)) {
        setShowExportModal(false)
        setSelectedItem(null)
        setActiveTab('scenario')
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось загрузить карту')
    } finally {
      setExportingSavedMapId(null)
    }
  }

  async function refreshExportMapsList() {
    const r = await fetchSavedMaps({ editorOnly: true })
    setExportSavedMaps(Array.isArray(r.maps) ? r.maps : [])
  }

  async function handleDeleteSavedMap(mapItem: SavedMapListItem) {
    const label = mapItem.name || `Карта #${mapItem.id}`
    if (!window.confirm(`Удалить карту «${label}»? Действие необратимо.`)) return
    setExportingSavedMapId(mapItem.id)
    try {
      await deleteSavedMap(mapItem.id)
      await refreshExportMapsList()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить карту')
    } finally {
      setExportingSavedMapId(null)
    }
  }

  async function handleModerateSavedMap(mapItem: SavedMapListItem, action: 'approve' | 'reject') {
    const label = mapItem.name || `Карта #${mapItem.id}`
    const msg =
      action === 'approve'
        ? `Принять карту «${label}»? Она станет доступна в общем списке.`
        : `Отклонить карту «${label}»?`
    if (!window.confirm(msg)) return
    setExportingSavedMapId(mapItem.id)
    try {
      await moderateSavedMap(mapItem.id, action)
      await refreshExportMapsList()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось выполнить модерацию')
    } finally {
      setExportingSavedMapId(null)
    }
  }

  function openSaveMapFlow() {
    setShowSaveMapConfirmModal(true)
  }

  async function confirmSaveMapToServer() {
    const title = missionBrief.trim()
    if (!title) {
      window.alert('Укажите «Название миссии» во вкладке «Сценарий» справа — оно будет именем карты в списке при создании сервера.')
      return
    }
    setSaveMapBusy(true)
    try {
      const { map } = await saveEditorMapToDb({ name: title, payload: buildMapPayload() })
      window.alert(`Карта сохранена на сервере: «${map.name}» (id ${map.id}). После проверки она появится в общем списке.`)
      setShowSaveMapConfirmModal(false)
      try {
        await refreshExportMapsList()
      } catch {
        /* список выгрузки обновится при следующем открытии окна */
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось сохранить карту')
    } finally {
      setSaveMapBusy(false)
    }
  }

  function switchTab(tab: EditorTabId) {
    setActiveTab(tab)
    setSelectedItem(null)
  }

  const showObjectPalette = activeTab === 'units' || activeTab === 'hexes'

  return (
    <div className={styles.editorMap}>
      <EditorMapToolbar
        onGoMain={() => navigate('/main')}
        onSaveMap={openSaveMapFlow}
        onGenerateGrid={() => setShowGridModal(true)}
        onLoadMap={() => setShowExportModal(true)}
        onShowGuide={() => setShowGuideModal(true)}
      />

      {selectedItem && (
        <div className={styles.selectionToast} role="status">
          <span>Выбран: {selectedItem.name}</span>
        </div>
      )}

      <div className={styles.layoutRow}>
        <div className={styles.editorMainMap} ref={mapHostRef}>
          <Cells
            mode="editor"
            cells={cells}
            width={mapLayout.width}
            height={mapLayout.height}
            cellSize={mapLayout.cellSize}
            onCellClick={handleCellClick}
            onUnitDelete={handleUnitDelete}
            hideEditorCellHexMenu={selectedItem != null}
          />
        </div>

        <EditorMapToolPanel
          activeTab={activeTab}
          tabs={EDITOR_TABS}
          showObjectPalette={showObjectPalette}
          onSwitchTab={(id) => switchTab(id as EditorTabId)}
          controls={
            <>
              {activeTab === 'units' && (
                <UnitsFilters
                  selectedFaction={selectedFaction}
                  selectedUnitType={selectedUnitType}
                  onFaction={(id) => setSelectedFaction(id as FactionId)}
                  onUnitType={(id) => setSelectedUnitType(id as UnitTypeId)}
                />
              )}
              {activeTab === 'conditions' && (
                <ConditionsPanel
                  axisCapture={axisCapture}
                  setAxisCapture={setAxisCapture}
                  axisElimination={axisElimination}
                  setAxisElimination={setAxisElimination}
                  struggleFaction={struggleFaction}
                  setStruggleFaction={(v) => setStruggleFaction(v as StruggleFactionId)}
                  allyTasks={allyTasks}
                  setAllyTasks={setAllyTasks}
                  axisTasks={axisTasks}
                  setAxisTasks={setAxisTasks}
                  maxTurns={maxTurns}
                  setMaxTurns={setMaxTurns}
                />
              )}
              {activeTab === 'scenario' && (
                <ScenarioPanel
                  missionBrief={missionBrief}
                  setMissionBrief={setMissionBrief}
                  historyText={historyText}
                  setHistoryText={setHistoryText}
                  scenarioPhotos={scenarioPhotos}
                  onScenarioPhotoUpload={handleScenarioPhotoUpload}
                  onScenarioPhotoClear={handleScenarioPhotoClear}
                />
              )}
            </>
          }
          palette={
            <EditorMapObjectPalette
              activeTab={activeTab}
              selectedFaction={selectedFaction}
              selectedUnitType={selectedUnitType}
              selectedItem={selectedItem}
              catalogUnits={catalogUnits}
              catalogHexes={catalogHexes}
              onSelect={(item) => setSelectedItem(item as CatalogUnit | CatalogHex | null)}
            />
          }
        />
      </div>

      <EditorMapGridModal
        isOpen={showGridModal}
        widthSize={widthSize}
        heightSize={heightSize}
        setWidthSize={setWidthSize}
        setHeightSize={setHeightSize}
        onClose={() => setShowGridModal(false)}
        onApply={applyGrid}
      />

      <EditorMapGuideModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

      <EditorMapSaveConfirmModal
        isOpen={showSaveMapConfirmModal}
        saveMapBusy={saveMapBusy}
        onClose={() => !saveMapBusy && setShowSaveMapConfirmModal(false)}
        onConfirm={() => void confirmSaveMapToServer()}
      />

      <EditorMapExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportMapsLoading={exportMapsLoading}
        exportMapsError={exportMapsError}
        exportSavedMaps={exportSavedMaps}
        exportingSavedMapId={exportingSavedMapId}
        onOpenSavedMap={(m) => void openSavedMapInEditor(m)}
        onDeleteSavedMap={(m) => void handleDeleteSavedMap(m)}
        onModerateSavedMap={(m, action) => void handleModerateSavedMap(m, action)}
      />
    </div>
  )
}

export default EditorMap

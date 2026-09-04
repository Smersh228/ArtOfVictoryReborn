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
import EditorMapDeploymentBar from '../components/editorMap/EditorMapDeploymentBar'
import EditorMapDeploymentModal from '../components/editorMap/EditorMapDeploymentModal'
import { ConditionsPanel, ScenarioPanel, UnitsFilters, type ScenarioPhotoSlot, DEFAULT_MAP_ENVIRONMENT, type MapEnvironmentFlags, parseEnvironmentFromPayload, environmentToPayload } from '../components/editorMap/EditorMapSidePanels'
import { Cell } from './../../../server/src/game/gameLogic/cells/cell'
import { generateEmptyGrid, computeEdgeCellIds } from '../game/hexGrid'
import { computeBattleCellSize, computeHexMapCanvasSize } from '../game/battleMapFit'
import { getCellCenter } from '../components/map/cellsInteraction'
import {
  edgeIndexFromPoint,
  toggleWireEdgeOnBuilds,
} from '../game/cellWireEdges'
import { toggleTrenchEdgeOnBuilds, isTrenchForbiddenOnCell } from '../game/cellTrenchEdges'
import { toggleAntiTankEdgeOnBuilds } from '../game/cellAntiTankEdges'
import { computeBombardmentDirectionPickCellIds } from '../game/battleAirSupport'
import { patchUnitOrderEditorMeta, readArtilleryDeployMeta, readUnitOrderEditorMeta } from '../game/editorMapUnitOrderMeta'
import {
  applyMineDefaults,
  applyStorageSupplyDefaults,
  clearStorageSupplyFields,
  ensureCellBuilds,
  isCatalogFortification,
  type CatalogFortification,
} from '../game/editorMapFortifications'
import { factionForTeam, normalizeUnitTeam, teamFromUnit } from '../game/editorMapTeam'
import { clearInheritedDestroyedHexFlags } from '../game/battleSpecialTerrain'
import {
  EMPTY_EDITOR_DEPLOYMENT,
  addPoolStructure,
  addPoolUnit,
  clearDeployZoneForTeam,
  collectDeployZoneMarks,
  ensureDeployZoneCell,
  parseEditorDeployment,
  poolCopyCount,
  MAX_POOL_COPIES,
  removePoolStructure,
  removePoolUnit,
  teamDeployPool,
  toggleDeployZoneCell,
} from '../game/editorMapDeployment'
import {
  computeEditorDotFireSectorCellIds,
  findDotFacingDirFromNeighbor,
  hasDotFacing,
  hasDotOnCell,
} from '../game/cellDot'
import { fetchEditorCatalog, uploadEditorImage } from '../api/editorCatalog'
import {
  deleteSavedMap,
  fetchSavedMapById,
  fetchSavedMaps,
  moderateSavedMap,
  saveEditorMapToDb,
  type SavedMapListItem,
} from '../api/maps'

type EditorTabId = 'units' | 'hexes' | 'buildings' | 'conditions' | 'scenario' | 'deployment'

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
  properties?: Array<{ prop_key?: string; name?: string }>
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
  hexExtra?: Record<string, unknown>
  /** Оверлей с поля боя (то же, что в ячейке mapBuilding): связка hex.id_cobj → build в каталоге */
  mapBuilding?: { name: string; imagePath: string }
}

/** Запись из каталога сооружений (`/api/editor/client/catalog` → buildings). */
type CatalogBuilding = {
  id: string
  dbId: number
  name: string
  imagePath: string
}

type PlacedUnit = CatalogUnit & {
  instanceId: number
  team?: number
  str?: number
  def?: number
  mor?: number
  mines?: number
  explosives?: number
  smokeShells?: number
  ammoSupply?: string
  health?: number
  ammo?: number
  orders?: BattleUnitOrderRef[]
  orderEditorMeta?: import('../game/editorMapUnitOrderMeta').EditorMapUnitOrderEditorMeta
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
  explosives: number
  smokeShells: number
  ammoSupply: string
  orders: BattleUnitOrderRef[]
  properties: Array<{ prop_key?: string; name?: string }>
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
  { id: 'buildings', label: 'Сооружения' },
  { id: 'deployment', label: 'Расстановка' },
  { id: 'conditions', label: 'Условия игры' },
  { id: 'scenario', label: 'Сценарий' },
]

const MAX_UNITS_PER_CELL = 3


const MAP_BASE_WIDTH = 1400
const MAP_BASE_HEIGHT = 835
const MAP_BASE_CELL = 42
const EDITOR_MIN_CELL = 22
const EDITOR_CELL_EXTRA = 2
const EDITOR_MAP_PAD = 16
const EDITOR_GRID_MIN = 5
const EDITOR_GRID_MAX_WIDTH = 25
const EDITOR_GRID_MAX_HEIGHT = 15

type PaletteItem = CatalogUnit | CatalogHex | CatalogBuilding | CatalogFortification

function isCatalogBuilding(item: PaletteItem | null): item is CatalogBuilding {
  return (
    item != null &&
    typeof item === 'object' &&
    'dbId' in item &&
    typeof (item as CatalogBuilding).dbId === 'number'
  )
}

function isCatalogUnit(item: PaletteItem | null): item is CatalogUnit {
  return item != null && 'faction' in item
}

function isCatalogHex(item: PaletteItem | null): item is CatalogHex {
  return item != null && !isCatalogUnit(item) && !isCatalogBuilding(item) && !isCatalogFortification(item)
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
  const [selectedFaction, setSelectedFaction] = useState<FactionId>('ussr')
  const [selectedTeam, setSelectedTeam] = useState(1)
  const [selectedUnitType, setSelectedUnitType] = useState<UnitTypeId>('all')
  const [selectedItem, setSelectedItem] = useState<PaletteItem | null>(null)
  const [apiUnits, setApiUnits] = useState<CatalogUnit[]>([])
  const [apiHexes, setApiHexes] = useState<CatalogHex[]>([])
  const [apiBuildings, setApiBuildings] = useState<CatalogBuilding[]>([])
  const [unitCombatStatsByCatalogId, setUnitCombatStatsByCatalogId] = useState<
    Map<number, UnitCombatStatsFromDb>
  >(() => new Map())
  const nextInstanceIdRef = useRef(1)
  const [artilleryFacingPick, setArtilleryFacingPick] = useState<{
    unitInstanceId: number
    unitCellId: number
  } | null>(null)
  const [dotFacingPick, setDotFacingPick] = useState<{
    cellId: number
    previousFacing?: number
    newlyPlaced?: boolean
  } | null>(null)
  const [editorHoverCellId, setEditorHoverCellId] = useState<number | null>(null)

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
        setApiBuildings(d.buildings || [])

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
          const rawProps = r.properties
          const properties: Array<{ prop_key?: string; name?: string }> = []
          if (Array.isArray(rawProps)) {
            for (const item of rawProps) {
              if (item == null || typeof item !== 'object') continue
              const p = item as { prop_key?: unknown; name?: unknown }
              properties.push({
                ...(typeof p.prop_key === 'string' ? { prop_key: p.prop_key } : {}),
                ...(typeof p.name === 'string' ? { name: p.name } : {}),
              })
            }
          }
          combatMap.set(id, {
            str: toNum(r.str),
            def: toNum(r.def),
            mor: toNum(r.mor),
            mines: toNum(r.mines),
            explosives: toNum(r.explosives),
            smokeShells: toNum(r.smokeShells),
            ammoSupply,
            orders: parseOrdersFromUnitsEditorRow(r),
            properties,
          })
        }
        setUnitCombatStatsByCatalogId(combatMap)
      })
      .catch(() => {})
  }, [])

  const catalogUnits = useMemo(() => {
    return apiUnits.map((u) => {
      const st = unitCombatStatsByCatalogId.get(u.id)
      if (!st?.properties.length) return u
      if (Array.isArray(u.properties) && u.properties.length) return u
      return { ...u, properties: st.properties }
    })
  }, [apiUnits, unitCombatStatsByCatalogId])

  const catalogHexes = useMemo(() => apiHexes, [apiHexes])

  const catalogBuildings = useMemo(() => apiBuildings, [apiBuildings])

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
  const [environment, setEnvironment] = useState<MapEnvironmentFlags>(DEFAULT_MAP_ENVIRONMENT)
  const [missionBrief, setMissionBrief] = useState('')
  const [historyText, setHistoryText] = useState('')
  const [teamLimit, setTeamLimit] = useState<2 | 4 | 6>(2)
  const [deployBrushTeam, setDeployBrushTeam] = useState(1)
  const [deployment, setDeployment] = useState(EMPTY_EDITOR_DEPLOYMENT)
  const [showDeployPoolModal, setShowDeployPoolModal] = useState(false)
  const [scenarioPhotos, setScenarioPhotos] = useState<readonly [string, string]>(['', ''])

  useEffect(() => {
    const next = normalizeUnitTeam(selectedTeam, teamLimit)
    if (next === selectedTeam) return
    setSelectedTeam(next)
    setSelectedFaction(factionForTeam(next))
  }, [teamLimit, selectedTeam])
  useEffect(() => {
    const next = normalizeUnitTeam(deployBrushTeam, teamLimit)
    if (next !== deployBrushTeam) setDeployBrushTeam(next)
  }, [teamLimit, deployBrushTeam])
  const placementMode = activeTab === 'deployment'

  const mapHostRef = useRef<HTMLDivElement>(null)
  const [mapHostSize, setMapHostSize] = useState({ w: MAP_BASE_WIDTH, h: MAP_BASE_HEIGHT })
  const mapLayout = useMemo(() => {
    const hostW = Math.max(160, mapHostSize.w)
    const hostH = Math.max(160, mapHostSize.h)
    if (!cells.length) {
      return { width: hostW, height: hostH, cellSize: MAP_BASE_CELL + EDITOR_CELL_EXTRA }
    }
    const fit = computeBattleCellSize(cells, hostW, hostH, EDITOR_MAP_PAD)
    const cellSize = Math.max(EDITOR_MIN_CELL, Math.min(MAP_BASE_CELL, fit)) + EDITOR_CELL_EXTRA
    const needed = computeHexMapCanvasSize(cells, cellSize, EDITOR_MAP_PAD)
    return {
      width: Math.max(hostW, needed.width),
      height: needed.height,
      cellSize,
    }
  }, [cells, mapHostSize])

  const editorMapEdgeCellIds = useMemo(() => computeEdgeCellIds(cells), [cells])
  const editorDeployZones = useMemo(
    () => (placementMode ? collectDeployZoneMarks(deployment, teamLimit) : null),
    [placementMode, deployment, teamLimit],
  )

  const editorFacingPickCellIds = useMemo(() => {
    const centerId = artilleryFacingPick?.unitCellId ?? dotFacingPick?.cellId
    if (centerId == null) return null
    const center = cells.find((c) => c.id === centerId)
    if (!center) return null
    return computeBombardmentDirectionPickCellIds(center, cells)
  }, [artilleryFacingPick, dotFacingPick, cells])

  const editorDotSectorCellIds = useMemo(() => {
    if (dotFacingPick) {
      const center = cells.find((c) => c.id === dotFacingPick.cellId)
      if (!center) return null
      const hover =
        editorHoverCellId != null ? cells.find((h) => h.id === editorHoverCellId) : null
      if (!hover || !editorFacingPickCellIds?.includes(hover.id)) return null
      const dir = findDotFacingDirFromNeighbor(center, hover)
      if (dir == null) return null
      const preview = computeEditorDotFireSectorCellIds(center, cells, dir)
      return preview.length ? preview : null
    }
    if (editorHoverCellId == null) return null
    const hover = cells.find((c) => c.id === editorHoverCellId)
    if (!hover || !hasDotOnCell(hover.builds) || !hasDotFacing(hover.builds)) return null
    const ids = computeEditorDotFireSectorCellIds(hover, cells)
    return ids.length ? ids : null
  }, [dotFacingPick, cells, editorHoverCellId, editorFacingPickCellIds])

  useEffect(() => {
    if (!artilleryFacingPick && !dotFacingPick) return
    const artPick = artilleryFacingPick
    const dotPick = dotFacingPick
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (artPick) {
        setArtilleryFacingPick(null)
        const hostCell = cells.find((c) => c.id === artPick.unitCellId)
        const hostUnit = hostCell?.units?.find(
          (u) => (u as unknown as PlacedUnit).instanceId === artPick.unitInstanceId,
        )
        if (!hostUnit) return
        const dep = readArtilleryDeployMeta(readUnitOrderEditorMeta(hostUnit))
        if (dep.deployed && dep.facingCellId == null) {
          handleEditorUnitPatch(artPick.unitCellId, artPick.unitInstanceId, (u) =>
            patchUnitOrderEditorMeta(u, (prev) => {
              const copy = { ...prev }
              delete copy.artilleryDeploy
              delete copy.artilleryDeployed
              return copy
            }),
          )
        }
        return
      }
      if (dotPick) {
        setDotFacingPick(null)
        if (dotPick.newlyPlaced) return
        if (dotPick.previousFacing != null) {
          setCells((prev) =>
            prev.map((c) => {
              if (c.id !== dotPick.cellId) return c
              return { ...c, builds: { ...ensureCellBuilds(c.builds), dotFacing: dotPick.previousFacing } }
            }),
          )
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [artilleryFacingPick, dotFacingPick, cells])

  const editorAviationPlacementActive =
    (activeTab === 'units' || placementMode) &&
    selectedItem != null &&
    isCatalogUnit(selectedItem) &&
    (selectedItem.type === 'lightAir' || selectedItem.type === 'heavyAir')

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
      if (!cr || cr.width < 80 || cr.height < 80) return
      const w = Math.floor(cr.width)
      const h = Math.floor(cr.height)
      setMapHostSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function applyGrid() {
    const w = Math.min(EDITOR_GRID_MAX_WIDTH, Math.max(EDITOR_GRID_MIN, Math.round(widthSize)))
    const h = Math.min(EDITOR_GRID_MAX_HEIGHT, Math.max(EDITOR_GRID_MIN, Math.round(heightSize)))
    setWidthSize(w)
    setHeightSize(h)
    const base = generateEmptyGrid(w, h)
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
              builds: ensureCellBuilds(c.builds),
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
    setDeployment((prev) => ({ ...prev, zones: {} }))
    setShowGridModal(false)
  }

  function handleCellClick(
    cell: Cell,
    _unitId?: number,
    click?: { canvasX: number; canvasY: number },
  ) {
    if (placementMode && !selectedItem) {
      setDeployment((prev) => toggleDeployZoneCell(prev, deployBrushTeam, cell.id))
      return
    }
    if (
      placementMode &&
      selectedItem &&
      (isCatalogUnit(selectedItem) ||
        isCatalogFortification(selectedItem) ||
        isCatalogBuilding(selectedItem))
    ) {
      const team = normalizeUnitTeam(deployBrushTeam, teamLimit)
      setDeployment((prev) => ensureDeployZoneCell(prev, team, cell.id))
    }
    if (artilleryFacingPick || dotFacingPick) return
    if (!selectedItem) return

    if ((placementMode || activeTab === 'buildings') && isCatalogFortification(selectedItem)) {
      if (selectedItem.buildKey === 'trench' && isTrenchForbiddenOnCell(cell)) {
        return
      }
      if (
        selectedItem.buildKey === 'wire' ||
        selectedItem.buildKey === 'trench' ||
        selectedItem.buildKey === 'antiTankBuild'
      ) {
        const center = getCellCenter(
          cell.coor.x,
          cell.coor.z,
          mapLayout.cellSize,
          mapLayout.width,
          mapLayout.height,
        )
        const edgeDir = click
          ? edgeIndexFromPoint(center.x, center.y, click.canvasX, click.canvasY)
          : 0
        setCells((prev) =>
          prev.map((c) => {
            if (c.id !== cell.id) return c
            let nextBuilds
            if (selectedItem.buildKey === 'wire') {
              nextBuilds = toggleWireEdgeOnBuilds(c.builds, edgeDir)
            } else if (selectedItem.buildKey === 'trench') {
              nextBuilds = toggleTrenchEdgeOnBuilds(c.builds, edgeDir)
            } else {
              nextBuilds = toggleAntiTankEdgeOnBuilds(c.builds, edgeDir)
            }
            return { ...c, builds: nextBuilds } as Cell
          }),
        )
        return
      }
      if (selectedItem.buildKey === 'dot') {
        const wasOn = hasDotOnCell(cell.builds)
        setCells((prev) =>
          prev.map((c) => {
            if (c.id !== cell.id) return c
            const builds = ensureCellBuilds(c.builds)
            if (builds.dot > 0) {
              const nextBuilds = { ...builds, dot: 0 }
              delete nextBuilds.dotFacing
              delete nextBuilds.dotFacingCellId
              delete nextBuilds.dotDef
              delete nextBuilds.dotAmmo
              delete nextBuilds.dotOccupantId
              return { ...c, builds: nextBuilds }
            }
            return {
              ...c,
              builds: { ...builds, dot: 1, dotDef: 4, dotAmmo: 15 },
            }
          }),
        )
        if (!wasOn) {
          setArtilleryFacingPick(null)
          setDotFacingPick({ cellId: cell.id, newlyPlaced: true })
        }
        return
      }
      if (selectedItem.buildKey === 'storage') {
        setCells((prev) =>
          prev.map((c) => {
            if (c.id !== cell.id) return c
            const builds = ensureCellBuilds(c.builds)
            if (builds.storage > 0) {
              return { ...c, builds: clearStorageSupplyFields(builds) }
            }
            return { ...c, builds: applyStorageSupplyDefaults(builds) }
          }),
        )
        return
      }
      if (selectedItem.buildKey === 'mine') {
        setCells((prev) =>
          prev.map((c) => {
            if (c.id !== cell.id) return c
            const builds = ensureCellBuilds(c.builds)
            if (Number(builds.mine) > 0) return c
            return { ...c, builds: applyMineDefaults(builds, 'infantry', selectedTeam) }
          }),
        )
        return
      }
      setCells((prev) =>
        prev.map((c) => {
          if (c.id !== cell.id) return c
          const builds = ensureCellBuilds(c.builds)
          const key = selectedItem.buildKey
          const nextBuilds = { ...builds, [key]: builds[key] > 0 ? 0 : 1 }
          return { ...c, builds: nextBuilds }
        }),
      )
      return
    }

    if ((placementMode || activeTab === 'buildings') && isCatalogBuilding(selectedItem)) {
      setCells((prev) =>
        prev.map((c) => {
          if (c.id !== cell.id) return c
          const next = { ...c } as unknown as Cell & { mapBuilding?: { name: string; imagePath: string } }
          next.mapBuilding = {
            name: selectedItem.name || '',
            imagePath: selectedItem.imagePath || '',
          }
          return next as Cell
        }),
      )
      return
    }

    if ((placementMode || activeTab === 'hexes') && isCatalogHex(selectedItem)) {
      const hexType = selectedItem.type
      const inf = selectedItem.moveCostInf ?? selectedItem.moveCost ?? 1
      const tech = selectedItem.moveCostTech ?? selectedItem.moveCost ?? 1
      const legacy = selectedItem.moveCost ?? inf
      setCells((prev) =>
        prev.map((c) => {
          if (c.id !== cell.id) return c
          const prevEx =
            (c as unknown as { hexExtra?: Record<string, unknown> }).hexExtra &&
            typeof (c as unknown as { hexExtra?: unknown }).hexExtra === 'object'
              ? {
                  ...((c as unknown as { hexExtra: Record<string, unknown> }).hexExtra as Record<
                    string,
                    unknown
                  >),
                }
              : {}
          const catEx =
            selectedItem.hexExtra && typeof selectedItem.hexExtra === 'object'
              ? { ...(selectedItem.hexExtra as Record<string, unknown>) }
              : {}
          const catalogHexId = Number(String(selectedItem.id || '').replace(/^hex_/i, ''))
          if (Number.isFinite(catalogHexId) && catalogHexId > 0) catEx.catalogHexId = catalogHexId
          const mergedHex = { ...prevEx, ...catEx }
          delete mergedHex.isDestroyedBridge
          delete mergedHex.destroyedBridge
          delete mergedHex.isDestroyedRailway
          delete mergedHex.railwayDestroyed
          delete mergedHex.editorDestroyedBridge
          delete mergedHex.editorDestroyedRailway
          const hexExtraPayload =
            Object.keys(mergedHex).length > 0 ? { hexExtra: mergedHex } : ({} as Record<string, never>)
          const next = {
            ...c,
            type: hexType,
            name: selectedItem.name || (c as { name?: string }).name,
            img: selectedItem.imagePath,
            moveCost: legacy,
            moveCostInf: inf,
            moveCostTech: tech,
            visionBlock: Boolean(selectedItem.visionBlock),
            defBonusInf: Math.max(0, Number(selectedItem.defBonusInf) || 0),
            defBonusTech: Math.max(0, Number(selectedItem.defBonusTech) || 0),
            ...hexExtraPayload,
          } as unknown as Cell & { mapBuilding?: { name: string; imagePath: string } }
          if (selectedItem.mapBuilding && (selectedItem.mapBuilding.imagePath || selectedItem.mapBuilding.name)) {
            next.mapBuilding = {
              name: selectedItem.mapBuilding.name || '',
              imagePath: selectedItem.mapBuilding.imagePath || '',
            }
          } else {
            delete next.mapBuilding
          }
          return next as Cell
        }),
      )
      return
    }

    if ((placementMode || activeTab === 'units') && isCatalogUnit(selectedItem)) {
      const placeTeam = normalizeUnitTeam(placementMode ? deployBrushTeam : selectedTeam, teamLimit)
      if (selectedItem.faction !== factionForTeam(placeTeam)) {
        window.alert(
          placeTeam % 2 === 1
            ? 'Для этой команды ставьте юниты СССР'
            : 'Для этой команды ставьте юниты вермахта',
        )
        return
      }
      if (
        (selectedItem.type === 'lightAir' || selectedItem.type === 'heavyAir') &&
        !editorMapEdgeCellIds.has(cell.id)
      ) {
        window.alert('Авиацию можно ставить только на край карты (подсвеченные красным гексы).')
        return
      }
      if ((cell.units || []).length >= MAX_UNITS_PER_CELL) {
        window.alert(`Нельзя поставить больше ${MAX_UNITS_PER_CELL} юнитов на один гекс!`)
        return
      }
      if (placementMode) {
        const pool = teamDeployPool(deployment, placeTeam)
        if (poolCopyCount(pool.unitIds, selectedItem.id) >= MAX_POOL_COPIES) {
          window.alert(`Не больше ${MAX_POOL_COPIES} копий одного юнита в пуле`)
          return
        }
        setDeployment((prev) => addPoolUnit(prev, placeTeam, selectedItem.id))
      }
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
          const team = normalizeUnitTeam(placementMode ? deployBrushTeam : selectedTeam, teamLimit)
          const newUnit: PlacedUnit = {
            ...selectedItem,
            instanceId,
            team,
            faction: factionForTeam(team),
            ...(st
              ? {
                  str: st.str,
                  def: st.def,
                  mor: st.mor,
                  mines: st.mines,
                  explosives: st.explosives,
                  smokeShells: st.smokeShells,
                  ...(st.ammoSupply ? { ammoSupply: st.ammoSupply } : {}),
                  ...(st.orders.length ? { orders: st.orders } : {}),
                  ...(st.properties.length ? { properties: st.properties } : {}),
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

  function handleEditorUnitPatch(
    cellId: number,
    unitInstanceId: number,
    patch: (unit: Record<string, unknown>) => Record<string, unknown>,
  ) {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId || !c.units?.length) return c
        let changed = false
        const units = c.units.map((u) => {
          const pu = u as unknown as PlacedUnit
          if (pu.instanceId !== unitInstanceId) return u
          changed = true
          return patch(u as unknown as Record<string, unknown>) as typeof u
        })
        return changed ? { ...c, units } : c
      }),
    )
  }

  function handleEditorFacingCellPick(cell: Cell) {
    if (!editorFacingPickCellIds?.includes(cell.id)) return
    if (artilleryFacingPick) {
      handleEditorUnitPatch(artilleryFacingPick.unitCellId, artilleryFacingPick.unitInstanceId, (u) =>
        patchUnitOrderEditorMeta(u, (prev) => ({
          ...prev,
          artilleryDeploy: { deployed: true, facingCellId: cell.id },
        })),
      )
      setArtilleryFacingPick(null)
      return
    }
    if (dotFacingPick) {
      const center = cells.find((c) => c.id === dotFacingPick.cellId)
      if (!center) return
      const dir = findDotFacingDirFromNeighbor(center, cell)
      if (dir == null) return
      setCells((prev) =>
        prev.map((c) => {
          if (c.id !== dotFacingPick.cellId) return c
          return {
            ...c,
            builds: { ...ensureCellBuilds(c.builds), dotFacing: dir, dotFacingCellId: cell.id },
          }
        }),
      )
      setDotFacingPick(null)
    }
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
      conditions: { axisCapture, axisElimination, struggleFaction, allyTasks, axisTasks, maxTurns, environment: environmentToPayload(environment) },
      scenario: { missionBrief, historyText, photos: attached, teamLimit },
      deployment,
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
    const loadedTeamLimit = (() => {
      const scen =
        p.scenario != null && typeof p.scenario === 'object'
          ? (p.scenario as Record<string, unknown>)
          : {}
      const n = Number(scen.teamLimit)
      return n === 4 || n === 6 ? n : 2
    })()
    for (let i = 0; i < loadedCells.length; i++) {
      const c = loadedCells[i]
      const units = Array.isArray(c.units)
        ? c.units.map((u) => {
            const rec = u as unknown as PlacedUnit
            return { ...rec, team: teamFromUnit(rec, loadedTeamLimit) } as unknown as (typeof c.units)[number]
          })
        : c.units
      const nextCell = { ...c, units, builds: ensureCellBuilds(c.builds) }
      const hx = (nextCell as Cell & { hexExtra?: Record<string, unknown> }).hexExtra
      if (hx && typeof hx === 'object') clearInheritedDestroyedHexFlags(hx)
      loadedCells[i] = nextCell
    }

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
    setEnvironment(parseEnvironmentFromPayload(cond.environment))

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
    {
      const n = Number(scen.teamLimit)
      setTeamLimit(n === 4 || n === 6 ? n : 2)
    }
    const photosRaw = scen.photos
    let p0 = ''
    let p1 = ''
    if (Array.isArray(photosRaw)) {
      if (typeof photosRaw[0] === 'string') p0 = photosRaw[0]
      if (typeof photosRaw[1] === 'string') p1 = photosRaw[1]
    }
    setScenarioPhotos([p0, p1])
    setDeployment(parseEditorDeployment(p.deployment))

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
    if (tab === 'deployment') {
      setArtilleryFacingPick(null)
      setDotFacingPick(null)
      setSelectedTeam(normalizeUnitTeam(deployBrushTeam, teamLimit))
      setSelectedFaction(factionForTeam(deployBrushTeam))
    }
  }

  const showObjectPalette =
    activeTab === 'units' || activeTab === 'hexes' || activeTab === 'buildings'

  return (
    <div className={styles.editorMap}>
      <EditorMapToolbar
        onGoMain={() => navigate('/main')}
        onSaveMap={openSaveMapFlow}
        onGenerateGrid={() => setShowGridModal(true)}
        onLoadMap={() => setShowExportModal(true)}
        onShowGuide={() => setShowGuideModal(true)}
      />

      {dotFacingPick ? (
        <div className={styles.selectionToast} role="status">
          <span>Выберите соседний гекс — направление сектора стрельбы ДОТ (Esc — отмена)</span>
        </div>
      ) : artilleryFacingPick ? (
        <div className={styles.selectionToast} role="status">
          <span>Выберите соседний гекс — направление орудия (Esc — отмена)</span>
        </div>
      ) : placementMode && !selectedItem ? (
        <div className={styles.selectionToast} role="status">
          <span>Клик по гексу — зона команды. Юниты и сооружения добавляйте через «Список пула».</span>
        </div>
      ) : selectedItem && !artilleryFacingPick && !dotFacingPick ? (
        <div className={styles.selectionToast} role="status">
          <span>
            Выбран: {selectedItem.name}
            {placementMode
              ? isCatalogUnit(selectedItem)
                ? ' — клик ставит на гекс и добавляет в пул расстановки'
                : ' — клик ставит на гекс (гекс входит в зону команды)'
              : isCatalogFortification(selectedItem) &&
                  (selectedItem.buildKey === 'wire' ||
                    selectedItem.buildKey === 'trench' ||
                    selectedItem.buildKey === 'antiTankBuild')
                ? ' — клик по стороне гекса'
                : isCatalogFortification(selectedItem) && selectedItem.buildKey === 'dot'
                  ? ' — клик по гексу, затем направление сектора'
                  : isCatalogFortification(selectedItem) && selectedItem.buildKey === 'storage'
                    ? ' — клик по гексу'
                    : ''}
          </span>
        </div>
      ) : null}

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
            hideEditorCellHexMenu={
              placementMode ||
              (selectedItem != null &&
                !(isCatalogFortification(selectedItem) && selectedItem.buildKey === 'mine'))
            }
            ignoreUnitClicks={placementMode}
            editorAviationEdgeHighlight={editorAviationPlacementActive}
            editorAviationEdgeCellIds={editorMapEdgeCellIds}
            editorDeployZones={editorDeployZones}
            editorDeployBrushTeam={placementMode ? deployBrushTeam : null}
            editorCatalogUnits={catalogUnits}
            onEditorUnitPatch={handleEditorUnitPatch}
            editorFacingPickCellIds={editorFacingPickCellIds}
            onEditorFacingCellPick={handleEditorFacingCellPick}
            artilleryFacingPick={artilleryFacingPick}
            onStartArtilleryFacingPick={(unitInstanceId, unitCellId) => {
              setDotFacingPick(null)
              setArtilleryFacingPick({ unitInstanceId, unitCellId })
            }}
            onCancelArtilleryFacingPick={() => setArtilleryFacingPick(null)}
            dotFacingPick={dotFacingPick}
            onStartDotFacingPick={(cellId) => {
              setArtilleryFacingPick(null)
              const host = cells.find((c) => c.id === cellId)
              const prev = host && hasDotFacing(host.builds) ? Number(host.builds.dotFacing) : undefined
              setDotFacingPick({
                cellId,
                previousFacing: prev,
                newlyPlaced: false,
              })
            }}
            battleDotSectorCellIds={editorDotSectorCellIds}
            onCellHover={(cell) => setEditorHoverCellId(cell?.id ?? null)}
            onCellLeave={() => setEditorHoverCellId(null)}
            onEditorCellPatch={(cellId, patch) =>
              setCells((prev) => prev.map((c) => (c.id === cellId ? patch(c) : c)))
            }
            editorTeamLimit={teamLimit}
          />
        </div>

        <EditorMapToolPanel
          activeTab={activeTab}
          tabs={EDITOR_TABS}
          showObjectPalette={showObjectPalette}
          onSwitchTab={(id) => switchTab(id as EditorTabId)}
          controls={
            <>
              {activeTab === 'deployment' && (
                <EditorMapDeploymentBar
                  teamLimit={teamLimit}
                  brushTeam={deployBrushTeam}
                  onBrushTeam={(team) => {
                    setDeployBrushTeam(team)
                    setSelectedTeam(team)
                    setSelectedFaction(factionForTeam(team))
                    setSelectedItem(null)
                  }}
                  deployment={deployment}
                  onOpenPoolModal={() => setShowDeployPoolModal(true)}
                  onClearZone={() =>
                    setDeployment((prev) => clearDeployZoneForTeam(prev, deployBrushTeam))
                  }
                />
              )}
              {activeTab === 'units' && (
                <UnitsFilters
                  selectedFaction={selectedFaction}
                  selectedUnitType={selectedUnitType}
                  selectedTeam={selectedTeam}
                  teamLimit={teamLimit}
                  onFaction={(id) => {
                    setSelectedFaction(id as FactionId)
                    if (id === 'ussr' && selectedTeam % 2 === 0) setSelectedTeam(1)
                    if (id === 'germany' && selectedTeam % 2 === 1) {
                      setSelectedTeam(Math.min(2, teamLimit) as 1 | 2)
                    }
                  }}
                  onUnitType={(id) => setSelectedUnitType(id as UnitTypeId)}
                  onTeam={(team) => {
                    setSelectedTeam(team)
                    setSelectedFaction(factionForTeam(team))
                    setSelectedItem(null)
                  }}
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
                  environment={environment}
                  setEnvironment={setEnvironment}
                />
              )}
              {activeTab === 'scenario' && (
                <ScenarioPanel
                  missionBrief={missionBrief}
                  setMissionBrief={setMissionBrief}
                  historyText={historyText}
                  setHistoryText={setHistoryText}
                  teamLimit={teamLimit}
                  setTeamLimit={setTeamLimit}
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
              selectedFaction={placementMode ? factionForTeam(deployBrushTeam) : selectedFaction}
              selectedUnitType={placementMode ? 'all' : selectedUnitType}
              selectedItem={selectedItem}
              catalogUnits={catalogUnits}
              catalogHexes={catalogHexes}
              catalogBuildings={catalogBuildings}
              onSelect={(item) =>
                setSelectedItem(item as CatalogUnit | CatalogHex | CatalogBuilding | null)
              }
            />
          }
        />
      </div>

      <EditorMapGridModal
        isOpen={showGridModal}
        widthSize={widthSize}
        heightSize={heightSize}
        minSize={EDITOR_GRID_MIN}
        maxWidth={EDITOR_GRID_MAX_WIDTH}
        maxHeight={EDITOR_GRID_MAX_HEIGHT}
        setWidthSize={setWidthSize}
        setHeightSize={setHeightSize}
        onClose={() => setShowGridModal(false)}
        onApply={applyGrid}
      />

      <EditorMapDeploymentModal
        isOpen={showDeployPoolModal}
        onClose={() => setShowDeployPoolModal(false)}
        teamLimit={teamLimit}
        team={deployBrushTeam}
        onTeam={setDeployBrushTeam}
        deployment={deployment}
        catalogUnits={catalogUnits}
        catalogBuildings={catalogBuildings}
        onAddUnit={(unitId) => setDeployment((prev) => addPoolUnit(prev, deployBrushTeam, unitId))}
        onRemoveUnit={(unitId) => setDeployment((prev) => removePoolUnit(prev, deployBrushTeam, unitId))}
        onAddStructure={(structureId) =>
          setDeployment((prev) => addPoolStructure(prev, deployBrushTeam, structureId))
        }
        onRemoveStructure={(structureId) =>
          setDeployment((prev) => removePoolStructure(prev, deployBrushTeam, structureId))
        }
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

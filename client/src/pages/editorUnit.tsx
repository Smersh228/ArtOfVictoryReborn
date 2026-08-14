import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './styleModules/editorUnit.module.css'
import EditorUnitSidebar from '../components/editorUnit/EditorUnitSidebar'
import EditorUnitToolbar from '../components/editorUnit/EditorUnitToolbar'
import EditorUnitWorkspace from '../components/editorUnit/EditorUnitWorkspace'
import {
  deleteEditorHex,
  deleteEditorRule,
  deleteEditorUnit,
  fetchEditorCatalog,
  fetchEditorOrders,
  fetchEditorProperties,
  resolveEditorImageUrl,
  saveEditorHex,
  saveEditorRule,
  saveEditorUnit,
  uploadEditorImage,
  type EditorCatalogResponse,
  type EditorOrderRow,
  type EditorPropertyRow,
} from '../api/editorCatalog'
import { EDITOR_BATTLE_ORDER_DEFS } from '../game/battleOrderIcons'
import { EDITOR_UNIT_PROPERTY_DEFS } from '../game/editorUnitPropertyIcons'
import {
  HEX_MOVE_DEF_TYPE_IDS,
  HEX_PLACEMENT_OPTS,
  HEX_SAVE_UNIT_TYPE_IDS,
  HEX_SIDEBAR_CATEGORIES,
} from '../components/editorUnit/editorHexTypes'
import { parseHexAccuracyRulesJson } from '../components/editorUnit/HexAccuracyBonusEditor'


const RULE_HEAD_REF_RE = /^(units|hexes):(\d+)$/

function parseRuleHeadForEditor(
  head: string | undefined | null,
  validChapterIds: string[],
): { chapter: string; refId: string } {
  const h = String(head ?? '').trim()
  const m = h.match(RULE_HEAD_REF_RE)
  if (m) return { chapter: m[1], refId: m[2] }
  if (h === 'home') return { chapter: 'units', refId: '' }
  if (validChapterIds.includes(h)) return { chapter: h, refId: '' }
  if (h) return { chapter: h, refId: '' }
  return { chapter: 'units', refId: '' }
}

function isLegacyRuleHead(head: string, validChapterIds: string[]): boolean {
  const h = head.trim()
  if (!h || h === 'home') return false
  if (RULE_HEAD_REF_RE.test(h)) return false
  return !validChapterIds.includes(h)
}

const RULE_CHAPTER_DEFS = [
  { id: 'units', name: 'Юниты' },
  { id: 'hexes', name: 'Гексы' },
  { id: 'game_turn', name: 'Ход игры' },
  { id: 'general_mechanics', name: 'Общие игровые механики' },
  { id: 'orders', name: 'Приказы' },
  { id: 'properties', name: 'Свойства' },
] as const

const ruleEditorChapterIds: string[] = RULE_CHAPTER_DEFS.map((c) => c.id)

function readCheckbox(root: HTMLElement | null, name: string): boolean {
  if (!root) return false
  const el = root.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)
  return Boolean(el?.checked)
}

function readNumInput(root: HTMLElement | null, name: string, fallback = 0): number {
  if (!root) return fallback
  const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`)
  const n = Number(el?.value)
  return Number.isFinite(n) ? n : fallback
}

function collectFireRowOptions(
  root: HTMLElement | null,
  variant: 'standard' | 'reactive' = 'standard',
): Record<string, { melee?: boolean }> {
  const keys = ['inf', 'art', 'tech', 'armor', 'lt', 'mt', 'ht', 'sa', 'ba', 'build'] as const
  const out: Record<string, { melee?: boolean }> = {}
  const prefix = variant === 'reactive' ? 'fire_r_melee_' : 'fire_melee_'
  for (const k of keys) {
    if (readCheckbox(root, `${prefix}${k}`)) out[k] = { melee: true }
  }
  return out
}

function collectHexEditorPayload(
  root: HTMLElement | null,
  opts?: { existingHexExtra?: Record<string, unknown> | null },
) {
  const ambushAllowed: Record<string, boolean> = {}
  for (const id of HEX_SAVE_UNIT_TYPE_IDS) {
    if (!readCheckbox(root, `hex_ambush_${id}`)) ambushAllowed[id] = false
  }
  const placementAllowed: Record<string, boolean> = {}
  for (const p of HEX_PLACEMENT_OPTS) {
    placementAllowed[p.key] = readCheckbox(root, p.name)
  }
  const moveCostByType: Record<string, number> = {}
  for (const id of HEX_MOVE_DEF_TYPE_IDS) {
    moveCostByType[id] = readNumInput(root, `hex_mc_${id}`, 1)
  }
  const defBonusByType: Record<string, number> = {}
  for (const id of HEX_MOVE_DEF_TYPE_IDS) {
    defBonusByType[id] = readNumInput(root, `hex_def_${id}`, 0)
  }
  const { accuracyBonusRules, accuracyBonusByType, accuracyBonusMeleeByType } = parseHexAccuracyRulesJson(
    root?.querySelector<HTMLInputElement>('[name="hex_accuracy_rules_json"]')?.value ?? '',
  )
  const rawHl = opts?.existingHexExtra?.heightLevel
  const heightLevelPreserved =
    rawHl != null && Number.isFinite(Number(rawHl))
      ? Math.min(3, Math.max(-1, Number(rawHl)))
      : 0
  const hexExtra: Record<string, unknown> = {
    category: root?.querySelector<HTMLSelectElement>('[name="hex_category"]')?.value ?? 'nature',
    heightLevel: heightLevelPreserved,
    ambushAllowed,
    placementAllowed,
    moveWithSwampProp: readCheckbox(root, 'hex_move_swamp_prop'),
    moveWithRiverProp: readCheckbox(root, 'hex_move_river_prop'),
    moveWithWaterUnitProp: readCheckbox(root, 'hex_move_water_unit_prop'),
    moveCostByType,
    defBonusByType,
    accuracyBonusRules,
    accuracyBonusByType,
    accuracyBonusMeleeByType,
    isSettlement: readCheckbox(root, 'hex_flag_settlement'),
    isRailStation: readCheckbox(root, 'hex_flag_rail'),
    isBridge: readCheckbox(root, 'hex_flag_bridge'),
  }
  const defendHuman = defBonusByType.infantry ?? 0
  const defendTech =
    defBonusByType.tech ??
    defBonusByType.mediumTank ??
    defBonusByType.heavyTank ??
    defBonusByType.artillery ??
    0
  const costMoveInf = moveCostByType.infantry || 1
  const costMoveTech =
    moveCostByType.tech ||
    moveCostByType.mediumTank ||
    moveCostByType.artillery ||
    moveCostByType.armor ||
    1
  return { hexExtra, defendHuman, defendTech, costMoveInf, costMoveTech }
}

type EditorImageFieldProps = {
  label: string
  value: string
  thumbClass: string
  labelClass: string
  onUpload: (file: File | null) => void
  onClear: () => void
 
  variant?: 'row' | 'rulesColumn'
}

function EditorImageField({
  label,
  value,
  thumbClass,
  labelClass,
  onUpload,
  onClear,
  variant = 'row',
}: EditorImageFieldProps) {
  const resolved = resolveEditorImageUrl(value)
  const thumb = (
    <div className={`${thumbClass} ${styles.editorImageRowThumb}`}>
      {resolved ? <img src={resolved} alt="" className={styles.editorThumbImg} /> : null}
    </div>
  )
  const actions = (
    <div className={`${styles.imageActions} ${styles.editorImageRowActions}`}>
      {value ? (
        <button type="button" className={styles.imageRemoveBtn} onClick={onClear}>
          Удалить
        </button>
      ) : (
        <label className={styles.fileUploadLabel}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            className={styles.fileUploadInput}
            onChange={(e) => {
              onUpload(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          Загрузить
        </label>
      )}
    </div>
  )

  if (variant === 'rulesColumn') {
    return (
      <div className={styles.editorImageColumn}>
        <span className={`${labelClass} ${styles.editorImageColLabel}`}>{label}</span>
        <div className={styles.editorImageColRow}>
          {thumb}
          {actions}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.editorImageRow}>
      <span className={`${labelClass} ${styles.editorImageRowLabel}`}>{label}</span>
      {thumb}
      {actions}
    </div>
  )
}

function listThumb(src: string | undefined, emoji: string) {
  const u = resolveEditorImageUrl(src)
  if (u) return <img src={u} alt="" className={`${styles.unitImage} ${styles.unitImagePhoto}`} />
  return <div className={styles.unitImage}>{emoji}</div>
}


function defaultVisAsNumber(vis: unknown): number {
  if (vis == null || vis === '') return 6
  if (typeof vis === 'number' && Number.isFinite(vis)) return vis
  const s = String(vis).trim()
  if (!s) return 6
  const first = s.split(/[,\s;]+/)[0]
  const n = Number(first)
  return Number.isFinite(n) ? n : 6
}

const EditorUnit = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<string>("units")
  const [selectedFaction, setSelectedFaction] = useState<string>("all")
  const [selectedUnitType, setSelectedUnitType] = useState<string>("all")
  const [selectedHexCategory, setSelectedHexCategory] = useState<string>('all')
  const [selectedRuleChapterFilter, setSelectedRuleChapterFilter] = useState<string>('all')
  const [showEditor, setShowEditor] = useState<boolean>(false)
  const [selectedUnit, setSelectedUnit] = useState<any>(null)
  const [selectedOrders, setSelectedOrders] = useState<number[]>([])
  const [selectedProperties, setSelectedProperties] = useState<number[]>([])
  const [mapEditorPublic, setMapEditorPublic] = useState(true)
  const [orderIdByKey, setOrderIdByKey] = useState<Map<string, number>>(() => new Map())
  const [propertyIdByKey, setPropertyIdByKey] = useState<Map<string, number>>(() => new Map())

  const tabs = [
    { id: 'units', label: 'Юниты' },
    { id: 'hexes', label: 'Гексы' },
    { id: 'rules', label: 'Руководство' },
  ]

  const factions = [
    { id: 'all', label: 'Все' },
    { id: 'germany', label: 'Вермахт' },
    { id: 'ussr', label: 'СССР' }
  ]

  const unitTypes = [
    { id: 'all', label: 'Все' },
    { id: 'infantry', label: 'Пехота' },
    { id: 'artillery', label: 'Артиллерия' },
    { id: 'tech', label: 'Техника' },
    { id: 'armor', label: 'Бронетехника' },
    { id: 'lightTank', label: 'Легкие танки' },
    { id: 'mediumTank', label: 'Средние танки' },
    { id: 'heavyTank', label: 'Тяжелые танки' },
    { id: 'lightAir', label: 'Малая авиация' },
    { id: 'heavyAir', label: 'Большая авиация' }
  ]

  const battleOrdersForEditor = useMemo(() => {
    return EDITOR_BATTLE_ORDER_DEFS.map((def) => {
      const key = def.order_key.trim().toLowerCase()
      const id = orderIdByKey.get(key) ?? orderIdByKey.get(def.order_key)
      return {
        ...def,
        id,
      }
    })
  }, [orderIdByKey])

  const editorUnitPropertiesForEditor = useMemo(() => {
    return EDITOR_UNIT_PROPERTY_DEFS.map((def) => {
      const key = def.prop_key.trim().toLowerCase()
      const id = propertyIdByKey.get(key) ?? propertyIdByKey.get(def.prop_key)
      return {
        ...def,
        id,
      }
    })
  }, [propertyIdByKey])

  const ruleChapters = RULE_CHAPTER_DEFS

  const ruleChapterFilters = useMemo(
    () => [{ id: 'all', label: 'Все' }, ...RULE_CHAPTER_DEFS.map((c) => ({ id: c.id, label: c.name }))],
    [],
  )

  const [units, setUnits] = useState<any[]>([])
  const [hexes, setHexes] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const editorFormRef = useRef<HTMLDivElement>(null)
  /** Пути картинок только через загрузку / удалить (без текстового поля) */
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({})
  const [ruleChapterState, setRuleChapterState] = useState('units')
  const [ruleRefUnitState, setRuleRefUnitState] = useState('')
  const [ruleRefHexState, setRuleRefHexState] = useState('')

  const handleImageUpload = async (key: string, file: File | null) => {
    if (!file) return
    try {
      const { path } = await uploadEditorImage(file)
      setImagePaths((prev) => ({ ...prev, [key]: path }))
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Ошибка загрузки')
    }
  }

  const handleImageClear = (key: string) => {
    setImagePaths((prev) => ({ ...prev, [key]: '' }))
  }

  useEffect(() => {
    if (!showEditor) return
    const p: Record<string, string> = {}
    if (activeTab === 'units') {
      p.unit_image = selectedUnit?.imagePath || ''
    } else if (activeTab === 'hexes') {
      p.hex_image = selectedUnit?.imagePath || ''
    } else if (activeTab === 'rules') {
      p.rule_image = selectedUnit?.imagePath || ''
      p.rule_image_2 = selectedUnit?.imagePath2 || ''
      p.rule_image_3 = selectedUnit?.imagePath3 || ''
    }
    setImagePaths(p)
  }, [showEditor, activeTab, selectedUnit])

  useEffect(() => {
    if (!showEditor || activeTab !== 'rules') return
    const raw = String(selectedUnit?.chapter ?? selectedUnit?.head ?? '').trim()
    const { chapter, refId } = parseRuleHeadForEditor(raw, ruleEditorChapterIds)
    setRuleChapterState(chapter)
    if (chapter === 'units') {
      setRuleRefUnitState(refId)
      setRuleRefHexState('')
    } else if (chapter === 'hexes') {
      setRuleRefHexState(refId)
      setRuleRefUnitState('')
    } else {
      setRuleRefUnitState('')
      setRuleRefHexState('')
    }
  }, [showEditor, activeTab, selectedUnit?.id, selectedUnit?.chapter, selectedUnit?.head])

  const reloadCatalog = (): Promise<EditorCatalogResponse> => {
    return fetchEditorCatalog()
      .then(async (data) => {
        setUnits(data.unitsEditor || [])
        setHexes(data.hexesEditor || [])
        setRules(data.rulesEditor || [])
        
        let orderRows: EditorOrderRow[] = []
        let propertyRows: EditorPropertyRow[] = []
        try {
          orderRows = await fetchEditorOrders()
        } catch (e) {
          console.error('editor orders', e)
        }
        try {
          propertyRows = await fetchEditorProperties()
        } catch (e) {
          console.error('editor properties', e)
        }
        const m = new Map<string, number>()
        for (const r of orderRows) {
          const k = String(r.order_key ?? r.code ?? '')
            .trim()
            .toLowerCase()
          const id = Number(r.id_orders ?? (r as { id?: unknown }).id)
          if (k && Number.isFinite(id)) m.set(k, id)
        }
        setOrderIdByKey(m)
        const pm = new Map<string, number>()
        for (const r of propertyRows) {
          const k = String(r.prop_key ?? '')
            .trim()
            .toLowerCase()
          const id = Number(r.id_property ?? (r as { id?: unknown }).id)
          if (k && Number.isFinite(id)) pm.set(k, id)
        }
        setPropertyIdByKey(pm)
        return data
      })
      .catch((e) => {
        console.error('editor catalog', e)
        return {
          units: [],
          hexes: [],
          buildings: [],
          rules: [],
          unitsEditor: [],
          hexesEditor: [],
          buildingsEditor: [],
          rulesEditor: [],
        }
      })
  }

  useEffect(() => {
    reloadCatalog()
  }, [])

  const handleAddClick = () => {
    setSelectedUnit(null)
    setSelectedOrders([])
    setSelectedProperties([])
    setShowEditor(true)
  }

  const handleUnitClick = (unit: any) => {
    setSelectedUnit(unit)
    setShowEditor(true)
  }

  useEffect(() => {
    if (!showEditor || activeTab !== 'units') return
    const su = selectedUnit
    if (!su?.id) {
      setSelectedOrders([])
      setSelectedProperties([])
      return
    }
    const ord = su.orders
    if (Array.isArray(ord) && ord.length) {
      setSelectedOrders(
        ord.map((o: { id?: unknown }) => Number(o.id)).filter((n: number) => Number.isFinite(n)),
      )
    } else {
      setSelectedOrders([])
    }
    const props = su.properties
    if (Array.isArray(props) && props.length) {
      setSelectedProperties(
        props.map((p: { id?: unknown }) => Number(p.id)).filter((n: number) => Number.isFinite(n)),
      )
    } else {
      setSelectedProperties([])
    }
  }, [selectedUnit, showEditor, activeTab])

  useEffect(() => {
    if (!showEditor) return
    if (!selectedUnit?.id) {
      setMapEditorPublic(false)
      return
    }
    setMapEditorPublic((selectedUnit as { mapEditorPublic?: unknown }).mapEditorPublic !== false)
  }, [selectedUnit, showEditor, activeTab])

  const handleClose = () => {
    setShowEditor(false)
  }

  const getNamed = (name: string) => {
    const scope = editorFormRef.current?.parentElement ?? editorFormRef.current
    const el = scope?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)
    return el?.value ?? ''
  }

  const hasNamedField = (name: string) => {
    const scope = editorFormRef.current?.parentElement ?? editorFormRef.current
    return Boolean(scope?.querySelector<HTMLInputElement>(`[name="${name}"]`))
  }

  const handleSave = async () => {
    const root = editorFormRef.current
    if (!root) return

    try {
      if (activeTab === 'units') {
        const prevFire = (selectedUnit?.fire || {}) as Record<string, string | undefined>
        const prevReactive = (selectedUnit?.fireReactive || {}) as Record<string, string | undefined>
        const fire = {
          range: getNamed('fire_range'),
          inf: getNamed('fire_inf'),
          art: getNamed('fire_art'),
          tech: getNamed('fire_tech'),
          armor: getNamed('fire_armor'),
          lt: getNamed('fire_lt'),
          mt: getNamed('fire_mt'),
          ht: getNamed('fire_ht'),
          sa: getNamed('fire_sa'),
          ba: getNamed('fire_ba'),
          build: getNamed('fire_build') || prevFire.build || '1,3,0,2',
        }
        const reactiveIntensityInDom = Boolean(root.querySelector<HTMLInputElement>('[name="fire_r_inf"]'))
        const fireReactive = reactiveIntensityInDom
          ? {
              range: getNamed('fire_range_r'),
              inf: getNamed('fire_r_inf'),
              art: getNamed('fire_r_art'),
              tech: getNamed('fire_r_tech'),
              armor: getNamed('fire_r_armor'),
              lt: getNamed('fire_r_lt'),
              mt: getNamed('fire_r_mt'),
              ht: getNamed('fire_r_ht'),
              sa: getNamed('fire_r_sa'),
              ba: getNamed('fire_r_ba'),
              build: getNamed('fire_r_build') || prevReactive.build || '1,3,0,2',
            }
          : {
              range: getNamed('fire_range_r'),
              inf: prevReactive.inf ?? '0',
              art: prevReactive.art ?? '0',
              tech: prevReactive.tech ?? '0',
              armor: prevReactive.armor ?? '0',
              lt: prevReactive.lt ?? '0',
              mt: prevReactive.mt ?? '0',
              ht: prevReactive.ht ?? '0',
              sa: prevReactive.sa ?? '0',
              ba: prevReactive.ba ?? '0',
              build: prevReactive.build ?? '1,3,0,2',
            }
        const preservedReactiveRowOpts =
          selectedUnit?.fireRowOptionsReactive != null && typeof selectedUnit.fireRowOptionsReactive === 'object'
            ? selectedUnit.fireRowOptionsReactive
            : {}
        const intelligenceAirRangeInDom = hasNamedField('intelligence_air_range')
        const intelligenceAirRange = intelligenceAirRangeInDom
          ? getNamed('intelligence_air_range')
          : String((selectedUnit as { intelligenceAirRange?: unknown })?.intelligenceAirRange ?? '1,2,3')
        const razvedkaRangeInDom = hasNamedField('razvedka_range')
        const razvedkaRange = razvedkaRangeInDom
          ? getNamed('razvedka_range')
          : String((selectedUnit as { razvedkaRange?: unknown })?.razvedkaRange ?? '1,2,3')
        const svzyRangeInDom = hasNamedField('svzy_range')
        const svzyRange = svzyRangeInDom
          ? getNamed('svzy_range')
          : String((selectedUnit as { svzyRange?: unknown })?.svzyRange ?? '1,2,3')
        const body = {
          id: selectedUnit?.id,
          name: getNamed('unit_name'),
          type: getNamed('unit_type'),
          fraction: getNamed('unit_faction'),
          str: Number(getNamed('unit_str')) || 0,
          def: Number(getNamed('unit_def')) || 0,
          mov: Number(getNamed('unit_mov')) || 0,
          mor: Number(getNamed('unit_mor')) || 0,
          ammo: getNamed('unit_ammo'),
          mines: Number(getNamed('unit_mines')) || 0,
          explosives: Number(getNamed('unit_explosives')) || 0,
          smokeShells: Number(getNamed('unit_smoke_shells')) || 0,
          vis: getNamed('unit_vis'),
          standard_image: imagePaths.unit_image ?? '',
          hover_image: selectedUnit?.hover_image?.trim() || null,
          id_cobj: selectedUnit?.id_cobj ?? null,
          fire,
          fireReactive,
          fireRowOptions: collectFireRowOptions(root, 'standard'),
          fireRowOptionsReactive: reactiveIntensityInDom
            ? collectFireRowOptions(root, 'reactive')
            : preservedReactiveRowOpts,
          orderIds: selectedOrders,
          propertyIds: selectedProperties,
          editorFireIntensityTab:
            getNamed('editor_fire_intensity_tab').trim().toLowerCase() === 'reactive'
              ? 'reactive'
              : 'all',
          intelligenceAirRange,
          razvedkaRange,
          svzyRange,
          mapEditorPublic,
        }
        const res: any = await saveEditorUnit(body)
        const data = await reloadCatalog()
        const uid = res?.id
        if (uid != null) {
          const row = (data.unitsEditor || []).find((u: { id?: unknown }) => Number(u.id) === Number(uid))
          if (row) {
            setSelectedUnit({
              ...row,
              intelligenceAirRange: body.intelligenceAirRange,
              razvedkaRange: body.razvedkaRange,
              svzyRange: body.svzyRange,
            })
          } else
            setSelectedUnit({
              ...(selectedUnit || {}),
              ...body,
              id: uid,
              imagePath: body.standard_image,
              hover_image: body.hover_image,
            })
        }
        window.alert('Юнит сохранён')
        return
      }

      if (activeTab === 'hexes') {
        const visSel = getNamed('hex_vision_block')
        const payload = collectHexEditorPayload(root, {
          existingHexExtra:
            selectedUnit && typeof selectedUnit.hexExtra === 'object' && selectedUnit.hexExtra !== null
              ? (selectedUnit.hexExtra as Record<string, unknown>)
              : null,
        })
        const body = {
          id: selectedUnit?.id,
          name: getNamed('hex_name'),
          defendHuman: payload.defendHuman,
          defendTech: payload.defendTech,
          costMove: payload.costMoveInf,
          costMoveInf: payload.costMoveInf,
          costMoveTech: payload.costMoveTech,
          isVisible: visSel === 'yes',
          image_path: imagePaths.hex_image ?? '',
          id_cobj: selectedUnit?.id_cobj ?? null,
          allowedBuildings: [],
          hexExtra: payload.hexExtra,
          mapEditorPublic,
        }
        const res: any = await saveEditorHex(body)
        const newId = res?.id ?? res?.id_hex
        if (newId) {
          const hexEx = res?.hexExtra ?? payload.hexExtra
          setSelectedUnit({
            ...(selectedUnit || {}),
            ...body,
            id: newId,
            imagePath: body.image_path,
            allowedBuildings: [],
            hexExtra: hexEx,
            defBonusInf: payload.defendHuman,
            defBonusTech: payload.defendTech,
            moveCostInf: payload.costMoveInf,
            moveCostTech: payload.costMoveTech,
            visionBlock: body.isVisible,
            mapEditorPublic,
          })
        }
        reloadCatalog()
        window.alert('Гекс сохранён')
        return
      }

      if (activeTab === 'rules') {
        let head = ruleChapterState
        if (ruleChapterState === 'units') {
          head = ruleRefUnitState ? `units:${ruleRefUnitState}` : 'units'
        } else if (ruleChapterState === 'hexes') {
          head = ruleRefHexState ? `hexes:${ruleRefHexState}` : 'hexes'
        }
        const body = {
          id: selectedUnit?.id,
          name: getNamed('rule_title'),
          head,
          description: getNamed('rule_desc'),
          image_path: imagePaths.rule_image ?? '',
          image_path_2: imagePaths.rule_image_2 ?? '',
          image_path_3: imagePaths.rule_image_3 ?? '',
          id_cobj: selectedUnit?.id_cobj ?? null,
          mapEditorPublic,
        }
        const res: any = await saveEditorRule(body)
        const rid = res?.id ?? res?.id_rule ?? selectedUnit?.id
        if (rid != null) {
          setSelectedUnit({
            ...(selectedUnit || {}),
            ...body,
            id: rid,
            title: body.name,
            chapter: head,
            desc: body.description,
            imagePath: body.image_path,
            imagePath2: body.image_path_2,
            imagePath3: body.image_path_3,
            mapEditorPublic,
          })
        }
        reloadCatalog()
        window.alert('Правило сохранено')
      }
    } catch (e: any) {
      window.alert(e?.message || 'Ошибка сохранения')
    }
  }

  const handleDelete = async () => {
    const id = Number(selectedUnit?.id)
    if (!Number.isFinite(id)) return
    const label =
      activeTab === 'units' ? 'юнит' : activeTab === 'hexes' ? 'гекс' : activeTab === 'rules' ? 'правило' : 'объект'
    const title = String(selectedUnit?.name || selectedUnit?.title || `${label} #${id}`)
    if (!window.confirm(`Удалить ${label} «${title}»?`)) return
    try {
      if (activeTab === 'units') await deleteEditorUnit(id)
      else if (activeTab === 'hexes') await deleteEditorHex(id)
      else if (activeTab === 'rules') await deleteEditorRule(id)
      await reloadCatalog()
      setSelectedUnit(null)
      setShowEditor(false)
      window.alert('Удалено')
    } catch (e: any) {
      window.alert(e?.message || 'Ошибка удаления')
    }
  }

  const toggleOrder = (orderId: number | undefined) => {
    if (orderId == null || !Number.isFinite(orderId)) return
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((x) => x !== orderId) : [...prev, orderId],
    )
  }

  const toggleProperty = (propId: number | undefined) => {
    if (propId == null || !Number.isFinite(propId)) return
    setSelectedProperties((prev) =>
      prev.includes(propId) ? prev.filter((x) => x !== propId) : [...prev, propId],
    )
  }

  return (
    <div className={styles.editorUnit}>
      <EditorUnitToolbar onGoMain={() => navigate('/main')} />

      <div className={styles.contentRow}>
        <EditorUnitSidebar
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          factions={factions}
          unitTypes={unitTypes}
          selectedFaction={selectedFaction}
          selectedUnitType={selectedUnitType}
          setSelectedFaction={setSelectedFaction}
          setSelectedUnitType={setSelectedUnitType}
          hexSidebarCategories={HEX_SIDEBAR_CATEGORIES}
          selectedHexCategory={selectedHexCategory}
          setSelectedHexCategory={setSelectedHexCategory}
          ruleChapterFilters={ruleChapterFilters}
          selectedRuleChapterFilter={selectedRuleChapterFilter}
          setSelectedRuleChapterFilter={setSelectedRuleChapterFilter}
          onAddClick={handleAddClick}
          units={units}
          hexes={hexes}
          rules={rules}
          selectedUnit={selectedUnit}
          onSelectItem={handleUnitClick}
          renderThumb={listThumb}
        />

        <EditorUnitWorkspace
          showEditor={showEditor}
          activeTab={activeTab}
          selectedUnit={selectedUnit}
          editorFormRef={editorFormRef}
          unitTypes={unitTypes}
          imagePaths={imagePaths}
          handleImageUpload={handleImageUpload}
          handleImageClear={handleImageClear}
          defaultVisAsNumber={defaultVisAsNumber}
          isLegacyRuleHead={isLegacyRuleHead}
          ruleChapterState={ruleChapterState}
          setRuleChapterState={setRuleChapterState}
          setRuleRefUnitState={setRuleRefUnitState}
          setRuleRefHexState={setRuleRefHexState}
          ruleChapters={ruleChapters}
          ruleEditorChapterIds={ruleEditorChapterIds}
          units={units}
          hexes={hexes}
          ruleRefUnitState={ruleRefUnitState}
          ruleRefHexState={ruleRefHexState}
          battleOrdersForEditor={battleOrdersForEditor}
          selectedOrders={selectedOrders}
          toggleOrder={toggleOrder}
          orderIdByKey={Object.fromEntries(orderIdByKey)}
          editorUnitPropertiesForEditor={editorUnitPropertiesForEditor}
          selectedProperties={selectedProperties}
          toggleProperty={toggleProperty}
          propertyIdByKey={propertyIdByKey}
          handleSave={handleSave}
          handleDelete={handleDelete}
          handleClose={handleClose}
          mapEditorPublic={mapEditorPublic}
          setMapEditorPublic={setMapEditorPublic}
          EditorImageField={EditorImageField}
        />
      </div>
    </div>
  )
}

export default EditorUnit
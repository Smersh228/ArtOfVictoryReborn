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


const EDITOR_UNIT_PROPERTY_DEFS: { prop_key: string; name: string }[] = [
  { prop_key: 'tankPhobia', name: 'Танкобоязнь' },
  { prop_key: 'fireSector', name: 'Сектор стрельбы' },
  { prop_key: 'concealedTargetFire', name: 'Стрельба по закрытым целям' },
  { prop_key: 'areaFire', name: 'Стрельба по площади' },
]


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
  if (vis == null || vis === '') return 3
  if (typeof vis === 'number' && Number.isFinite(vis)) return vis
  const s = String(vis).trim()
  if (!s) return 3
  const first = s.split(/[,\s;]+/)[0]
  const n = Number(first)
  return Number.isFinite(n) ? n : 3
}

const EditorUnit = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<string>("units")
  const [selectedFaction, setSelectedFaction] = useState<string>("all")
  const [selectedUnitType, setSelectedUnitType] = useState<string>("all")
  const [showEditor, setShowEditor] = useState<boolean>(false)
  const [selectedUnit, setSelectedUnit] = useState<any>(null)
  const [selectedOrders, setSelectedOrders] = useState<number[]>([])
  const [selectedProperties, setSelectedProperties] = useState<number[]>([])
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

  const handleClose = () => {
    setShowEditor(false)
  }

  const getNamed = (name: string) => {
    const el = editorFormRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)
    return el?.value ?? ''
  }

  const handleSave = async () => {
    const root = editorFormRef.current
    if (!root) return

    try {
      if (activeTab === 'units') {
        const prevFire = (selectedUnit?.fire || {}) as Record<string, string | undefined>
        const fire = {
          range: getNamed('fire_range'),
          inf: getNamed('fire_inf'),
          art: getNamed('fire_art'),
          tech: getNamed('fire_tech'),
          armor: getNamed('fire_armor'),
          lt: getNamed('fire_lt'),
          mt: getNamed('fire_mt'),
          ht: getNamed('fire_ht'),
          sa: prevFire.sa ?? '0,1,0,0',
          ba: prevFire.ba ?? '0,0,0,0',
          build: prevFire.build ?? '1,3,0,2',
        }
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
          vis: getNamed('unit_vis'),
          standard_image: imagePaths.unit_image ?? '',
          hover_image: selectedUnit?.hover_image?.trim() || null,
          id_cobj: selectedUnit?.id_cobj ?? null,
          fire,
          orderIds: selectedOrders,
          propertyIds: selectedProperties,
        }
        const res: any = await saveEditorUnit(body)
        const data = await reloadCatalog()
        const uid = res?.id
        if (uid != null) {
          const row = (data.unitsEditor || []).find((u: { id?: unknown }) => Number(u.id) === Number(uid))
          if (row) setSelectedUnit(row)
          else
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
        const costMoveInf = Number(getNamed('hex_move_cost_inf')) || 1
        const costMoveTech = Number(getNamed('hex_move_cost_tech')) || 1
        const body = {
          id: selectedUnit?.id,
          name: getNamed('hex_name'),
          defendHuman: Number(getNamed('hex_def_inf')) || 0,
          defendTech: Number(getNamed('hex_def_tech')) || 0,
          costMove: costMoveInf,
          costMoveInf,
          costMoveTech,
          isVisible: visSel === 'yes',
          image_path: imagePaths.hex_image ?? '',
          id_cobj: selectedUnit?.id_cobj ?? null,
          allowedBuildings: [],
        }
        const res: any = await saveEditorHex(body)
        const newId = res?.id ?? res?.id_hex
        if (newId) {
          setSelectedUnit({
            ...(selectedUnit || {}),
            ...body,
            id: newId,
            imagePath: body.image_path,
            allowedBuildings: [],
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
          EditorImageField={EditorImageField}
        />
      </div>
    </div>
  )
}

export default EditorUnit
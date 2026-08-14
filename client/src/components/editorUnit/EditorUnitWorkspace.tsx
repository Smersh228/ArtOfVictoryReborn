import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/editorUnit.module.css';
import {
  EDITOR_BATTLE_ORDER_GROUP_LABELS,
  EDITOR_BATTLE_ORDER_GROUP_ORDER,
  type EditorBattleOrderCategory,
} from '../../game/battleOrderIcons';
import { EditorHexEditorFields } from './EditorHexEditorFields';

interface EditorImageFieldProps {
  label: string;
  value: string;
  thumbClass: string;
  labelClass: string;
  onUpload: (file: File | null) => void;
  onClear: () => void;
  variant?: 'row' | 'rulesColumn';
}

interface EditorUnitWorkspaceProps {
  showEditor: boolean;
  activeTab: string;
  selectedUnit: any;
  editorFormRef: React.RefObject<HTMLDivElement | null>;
  unitTypes: Array<{ id: string; label: string }>;
  imagePaths: Record<string, string>;
  handleImageUpload: (key: string, file: File | null) => void;
  handleImageClear: (key: string) => void;
  defaultVisAsNumber: (vis: unknown) => number;
  isLegacyRuleHead: (head: string, validChapterIds: string[]) => boolean;
  ruleChapterState: string;
  setRuleChapterState: (v: string) => void;
  setRuleRefUnitState: (v: string) => void;
  setRuleRefHexState: (v: string) => void;
  ruleChapters: ReadonlyArray<{ id: string; name: string }>;
  ruleEditorChapterIds: string[];
  units: any[];
  hexes: any[];
  ruleRefUnitState: string;
  ruleRefHexState: string;
  battleOrdersForEditor: any[];
  selectedOrders: number[];
  toggleOrder: (id: number | undefined) => void;
  orderIdByKey: Record<string, number>;
  editorUnitPropertiesForEditor: any[];
  selectedProperties: number[];
  toggleProperty: (id: number | undefined) => void;
  propertyIdByKey: Map<string, number>;
  handleSave: () => void;
  handleDelete: () => void;
  handleClose: () => void;
  mapEditorPublic: boolean;
  setMapEditorPublic: React.Dispatch<React.SetStateAction<boolean>>;
  EditorImageField: React.ComponentType<EditorImageFieldProps>;
}

function parseFireRangeSegments(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  return t.split(',').map((s) => s.trim())
}

function FooterMapPublicToggle({
  mapEditorPublic,
  setMapEditorPublic,
}: {
  mapEditorPublic: boolean
  setMapEditorPublic: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <button
      type="button"
      className={`${styles.footerMapPublicBtn} ${mapEditorPublic ? styles.footerMapPublicBtnOn : ''}`}
      onClick={() => setMapEditorPublic((v) => !v)}
      title="Если включено — объект виден всем в редакторе карт. Сохраните, чтобы применить."
    >
      {mapEditorPublic ? 'В редакторе карт: для всех' : 'В редакторе карт: скрыт'}
    </button>
  )
}

/** Редактор fire_range: матрица дистанций и редактируемые ячейки меткости + равномерное заполнение. */
function FireRangeEditor({
  initialRange,
  hiddenInputName = 'fire_range',
  hideMatrixLabel = false,
  hideQuickFillHeading = false,
  /** Смещение подписи дистанции: 0 — первая колонка «0» (ближний бой), 1 — первая колонка «1 клетка». */
  distanceDisplayOffset = 0,
  quickPositionsLabel,
  quickPositionsTitle,
  quickAccuracyLabel = 'Меткость',
  quickAccuracyTitle,
  matrixAriaLabel,
}: {
  initialRange: string
  hiddenInputName?: string
  hideMatrixLabel?: boolean
  hideQuickFillHeading?: boolean
  distanceDisplayOffset?: number
  quickPositionsLabel?: string
  quickPositionsTitle?: string
  quickAccuracyLabel?: string
  quickAccuracyTitle?: string
  matrixAriaLabel?: string
}) {
  const [rangeText, setRangeText] = useState(initialRange)
  const cellsRef = useRef<HTMLInputElement>(null)
  const accRef = useRef<HTMLInputElement>(null)

  const positionsLabel =
    quickPositionsLabel ??
    (distanceDisplayOffset === 0 ? 'Позиций (0…N−1 клеток)' : 'Позиций (1…N клеток)')
  const positionsTitle =
    quickPositionsTitle ??
    (distanceDisplayOffset === 0
      ? 'Сколько чисел в списке: 1-е — меткость в ближнем бою (0 клеток), далее — на 1, 2, … клеток'
      : 'Сколько столбцов: первая — дистанция 1 клетка, далее 2, 3, …')

  useEffect(() => {
    setRangeText(initialRange)
  }, [initialRange])

  function fillUniform() {
    const cells = Number(cellsRef.current?.value)
    const acc = Number(accRef.current?.value)
    if (!Number.isFinite(cells) || cells < 1 || cells > 99) return
    if (!Number.isFinite(acc)) return
    setRangeText(Array.from({ length: Math.floor(cells) }, () => String(acc)).join(','))
  }

  const segments = parseFireRangeSegments(rangeText)
  const showMatrix = segments.length > 0

  function distTitle(i: number): string {
    const d = i + distanceDisplayOffset
    if (distanceDisplayOffset === 0 && i === 0) return 'Ближний бой (0 клеток)'
    return `На дистанции ${d} кл.`
  }

  function cellAriaLabel(i: number): string {
    const d = i + distanceDisplayOffset
    if (distanceDisplayOffset === 0 && i === 0) return 'Меткость в ближнем бою (0 клеток)'
    return `${quickAccuracyLabel} на ${d} кл.`
  }

  const matrixAria =
    matrixAriaLabel ??
    (distanceDisplayOffset === 0
      ? 'Дистанция в клетках и меткость, с 0 для ближнего боя'
      : 'Радиус зоны в клетках и значение по каждой дистанции')

  return (
    <div className={styles.fireRangeBlock}>
      <input type="hidden" name={hiddenInputName} value={rangeText} />
      {showMatrix ? (
        <>
          {hideMatrixLabel ? null : <label className={styles.fieldLabel}>Меткость по клеткам</label>}
          <div className={styles.fireRangeMatrix} aria-label={matrixAria}>
            <div className={styles.fireRangeMatrixColumns}>
              {segments.map((v, i) => (
                <div key={`col-${i}`} className={styles.fireRangeMatrixCol}>
                  <span className={styles.fireRangeMatrixDistCell} title={distTitle(i)}>
                    {i + distanceDisplayOffset}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${styles.fieldInput} ${styles.fireRangeMatrixAccInput}${
                      v === '' ? ` ${styles.fireRangeMatrixAccCellEmpty}` : ''
                    }`}
                    aria-label={cellAriaLabel(i)}
                    title={distTitle(i)}
                    value={v}
                    placeholder={v === '' ? '—' : undefined}
                    onChange={(e) => {
                      const next = [...segments]
                      next[i] = e.target.value
                      setRangeText(next.join(','))
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className={styles.fireRangeQuickWrap}>
        {hideQuickFillHeading ? null : (
          <div className={styles.fireRangeQuickHeading}>Дальность (меткость), равномерная</div>
        )}
        <div className={styles.fireRangeQuickRow}>
          <label className={styles.fireRangeQuickField}>
            {positionsLabel}
            <input
              ref={cellsRef}
              type="number"
              min={1}
              max={99}
              className={styles.fieldInput}
              defaultValue={12}
              title={positionsTitle}
            />
          </label>
          <label className={styles.fireRangeQuickField}>
            {quickAccuracyLabel}
            <input
              ref={accRef}
              type="number"
              className={styles.fieldInput}
              defaultValue={2}
              title={quickAccuracyTitle ?? 'Значение для всех позиций при «Заполнить»'}
            />
          </label>
          <button type="button" className={styles.fireRangeQuickBtn} onClick={fillUniform}>
            Заполнить
          </button>
        </div>
      </div>
    </div>
  )
}

const FIRE_ROW_KEYS = ['inf', 'art', 'tech', 'armor', 'lt', 'mt', 'ht', 'sa', 'ba', 'build'] as const;

const FIRE_DEFAULT_CSV: Record<(typeof FIRE_ROW_KEYS)[number], string> = {
  inf: '3,5,1,4',
  art: '2,4,1,3',
  tech: '1,3,0,2',
  armor: '1,2,0,1',
  lt: '1,2,0,1',
  mt: '0,1,0,0',
  ht: '0,0,0,0',
  sa: '0,1,0,0',
  ba: '0,0,0,0',
  build: '1,3,0,2',
};

/** Численность N → N значений урона; каждое = min(N, 3): 2→«2,2», 5→«3,3,3,3,3». */
function fireIntensityCsvForStrength(rawStr: unknown): string {
  const n = Math.max(1, Math.min(99, Math.floor(Number(rawStr)) || 1));
  const per = Math.min(n, 3);
  return Array.from({ length: n }, () => String(per)).join(',');
}

function fireFieldName(rowKey: string, variant: 'standard' | 'reactive'): string {
  const base = variant === 'reactive' ? 'fire_r' : 'fire';
  return `${base}_${rowKey}`;
}

function readFireCsvFromUnit(
  unit: { fire?: Record<string, unknown>; fireReactive?: Record<string, unknown> } | null | undefined,
  rowKey: (typeof FIRE_ROW_KEYS)[number],
  variant: 'standard' | 'reactive',
): string {
  const block = variant === 'reactive' ? unit?.fireReactive : unit?.fire;
  const raw = block?.[rowKey];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') return String(raw);
  return FIRE_DEFAULT_CSV[rowKey];
}

function buildFireFieldsFromUnit(unit: EditorUnitWorkspaceProps['selectedUnit']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rowKey of FIRE_ROW_KEYS) {
    out[fireFieldName(rowKey, 'standard')] = readFireCsvFromUnit(unit, rowKey, 'standard');
    out[fireFieldName(rowKey, 'reactive')] = readFireCsvFromUnit(unit, rowKey, 'reactive');
  }
  return out;
}

function applyStrengthToAllFireFields(str: unknown): Record<string, string> {
  const csv = fireIntensityCsvForStrength(str);
  const out: Record<string, string> = {};
  for (const rowKey of FIRE_ROW_KEYS) {
    out[fireFieldName(rowKey, 'standard')] = csv;
    out[fireFieldName(rowKey, 'reactive')] = csv;
  }
  return out;
}

const EditorUnitWorkspace: React.FC<EditorUnitWorkspaceProps> = (props) => {
  const {
    showEditor,
    activeTab,
    selectedUnit,
    editorFormRef,
    unitTypes,
    imagePaths,
    handleImageUpload,
    handleImageClear,
    defaultVisAsNumber,
    isLegacyRuleHead,
    ruleChapterState,
    setRuleChapterState,
    setRuleRefUnitState,
    setRuleRefHexState,
    ruleChapters,
    ruleEditorChapterIds,
    units,
    hexes,
    ruleRefUnitState,
    ruleRefHexState,
    battleOrdersForEditor,
    selectedOrders,
    toggleOrder,
    orderIdByKey,
    editorUnitPropertiesForEditor,
    selectedProperties,
    toggleProperty,
    propertyIdByKey,
    handleSave,
    handleDelete,
    handleClose,
    mapEditorPublic,
    setMapEditorPublic,
    EditorImageField,
  } = props;

  const [orderGroupFilter, setOrderGroupFilter] = useState<EditorBattleOrderCategory>(
    EDITOR_BATTLE_ORDER_GROUP_ORDER[0],
  );

  const [fireIntensityTab, setFireIntensityTab] = useState<'all' | 'reactive'>('all');
  const [unitStr, setUnitStr] = useState<number>(() => Math.max(1, Number(selectedUnit?.str) || 5));
  const [fireFieldValues, setFireFieldValues] = useState<Record<string, string>>(() =>
    buildFireFieldsFromUnit(selectedUnit),
  );

  useEffect(() => {
    const tab =
      selectedUnit?.editorFireIntensityTab === 'reactive' ? 'reactive' : 'all';
    setFireIntensityTab(tab);
  }, [selectedUnit?.id]);

  useEffect(() => {
    setUnitStr(Math.max(1, Number(selectedUnit?.str) || 5));
    setFireFieldValues(buildFireFieldsFromUnit(selectedUnit));
  }, [selectedUnit?.id]);

  const ordersByCategory = useMemo(() => {
    const buckets: Record<EditorBattleOrderCategory, typeof battleOrdersForEditor> = {
      ordinary: [],
      special: [],
      sapper: [],
      aviation: [],
    };
    for (const o of battleOrdersForEditor) {
      const cat = (o as { editorCategory?: EditorBattleOrderCategory }).editorCategory ?? 'special';
      buckets[cat].push(o);
    }
    return buckets;
  }, [battleOrdersForEditor]);

  /** Приказы с отдельным редактором «радиус / макс. для успеха»: авиаразведка, разведка, радиоперехват. */
  const selectedReconOrderKeys = useMemo(() => {
    const idToKey = new Map<number, string>();
    for (const o of battleOrdersForEditor) {
      const id = (o as { id?: unknown }).id;
      const key = String((o as { order_key?: unknown }).order_key ?? '')
        .trim()
        .toLowerCase();
      if (typeof id === 'number' && Number.isFinite(id) && key) idToKey.set(id, key);
    }
    const out = new Set<string>();
    for (const oid of selectedOrders) {
      const k = idToKey.get(oid);
      if (k === 'intelligenceair' || k === 'razvedka' || k === 'svzy') out.add(k);
    }
    return out;
  }, [battleOrdersForEditor, selectedOrders]);

  const showIntelligenceAirRangeEditor = selectedReconOrderKeys.has('intelligenceair');
  const showRazvedkaRangeEditor = selectedReconOrderKeys.has('razvedka');
  const showSvzyRangeEditor = selectedReconOrderKeys.has('svzy');

  const showAnyReconRangeEditor =
    showIntelligenceAirRangeEditor || showRazvedkaRangeEditor || showSvzyRangeEditor;

  function fireRangeCsv(src: unknown): string {
    if (Array.isArray(src)) return src.map((x: unknown) => String(x)).join(',');
    return String(src ?? '1,2,3');
  }

  function handleUnitStrChange(raw: string) {
    const n = Math.max(1, Math.min(99, Math.floor(Number(raw)) || 1));
    setUnitStr(n);
    setFireFieldValues(applyStrengthToAllFireFields(n));
  }

  function renderFireRow(rowKey: string, label: string, variant: 'standard' | 'reactive') {
    const fieldName = fireFieldName(rowKey, variant);
    const v = fireFieldValues[fieldName] ?? FIRE_DEFAULT_CSV[rowKey as (typeof FIRE_ROW_KEYS)[number]];
    const opts =
      variant === 'reactive'
        ? ((selectedUnit?.fireRowOptionsReactive ?? {}) as Record<string, { melee?: boolean } | undefined>)
        : ((selectedUnit?.fireRowOptions ?? {}) as Record<string, { melee?: boolean } | undefined>);
    const melee = Boolean(opts[rowKey]?.melee);
    const base = variant === 'reactive' ? 'fire_r' : 'fire';
    return (
      <div key={`${variant}-${rowKey}`} className={styles.fireRowWithMelee}>
        <label className={styles.fieldLabel}>{label}</label>
        <div className={styles.fireRowMeleeLine}>
          <input
            name={fieldName}
            className={styles.fieldInput}
            value={v}
            onChange={(e) => setFireFieldValues((prev) => ({ ...prev, [fieldName]: e.target.value }))}
          />
          <label
            className={styles.fireMeleeCb}
            title="Юнит не получает приказы «Огонь» и «Огонь на подавление» — только ближний бой («Атака»)"
          >
            <input type="checkbox" name={`${base}_melee_${rowKey}`} defaultChecked={melee} />
            Ближний бой
          </label>
        </div>
      </div>
    );
  }

  function renderOrderChip(order: (typeof battleOrdersForEditor)[number]) {
    const id = order.id;
    const disabled = id == null;
    const selected = typeof id === 'number' && selectedOrders.includes(id);
    return (
      <div
        key={order.order_key}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && toggleOrder(id)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOrder(id);
          }
        }}
        className={`${styles.orderChip} ${selected ? styles.orderChipSelected : ''} ${disabled ? styles.orderChipDisabled : ''} ${order.icon ? '' : styles.orderChipTextOnly}`}
        title={
          disabled
            ? Object.keys(orderIdByKey).length === 0
              ? 'Справочник приказов не загрузился: проверьте, что сервер запущен и запрос /api/editor/orders доступен (авторизация, URL API), затем обновите страницу.'
              : `Нет строки в БД orders с ключом «${order.order_key}» — выполните миграции редактора или обновите страницу после запуска сервера.`
            : order.name
        }
      >
        {order.icon ? (
          <>
            <div className={styles.orderChipIconWrap}>
              <img src={order.icon} alt="" className={styles.orderChipIconImg} />
            </div>
            <div className={styles.orderChipLabel}>{order.name}</div>
          </>
        ) : (
          <div className={styles.chipTitleOnly}>{order.name}</div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.rightWorkspace}>
      {showEditor && (
        <div className={`${styles.editorWorkspaceInner} ${activeTab === 'rules' || activeTab === 'hexes' ? styles.editorWorkspaceInnerScroll : ''}`}>
          <div
            ref={editorFormRef}
            key={`${activeTab}-${selectedUnit?.id ?? 'new'}`}
            className={`${styles.editorUnitParametrs} ${activeTab === 'rules' || activeTab === 'hexes' ? styles.editorUnitParametrsTall : ''} ${activeTab === 'units' ? styles.editorUnitParametrsUnits : ''}`}
          >
            {activeTab === 'units' && (
              <>
                <input type="hidden" name="editor_fire_intensity_tab" value={fireIntensityTab} />
                <div className={styles.paramGrid3}>
                <div className={styles.glassCard}>
                  <h4 className={styles.cardTitle}>Основное</h4>
                  <div className={styles.fieldStack}>
                    <div>
                      <label className={styles.fieldLabel}>Название</label>
                      <input name="unit_name" className={styles.fieldInput} defaultValue={selectedUnit?.name || ''} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Тип</label>
                      <select name="unit_type" className={styles.fieldSelect} defaultValue={selectedUnit?.type || 'infantry'}>
                        {unitTypes.slice(1).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Фракция</label>
                      <select name="unit_faction" className={styles.fieldSelect} defaultValue={selectedUnit?.faction || 'germany'}>
                        <option value="germany">Вермахт</option>
                        <option value="ussr">СССР</option>
                      </select>
                    </div>
                    <EditorImageField
                      label="Изображение юнита"
                      value={imagePaths.unit_image ?? ''}
                      thumbClass={styles.thumb64}
                      labelClass={styles.fieldLabel}
                      onUpload={(f: File | null) => handleImageUpload('unit_image', f)}
                      onClear={() => handleImageClear('unit_image')}
                    />
                  </div>
                </div>

                <div className={styles.glassCard}>
                  <h4 className={styles.cardTitle}>Характеристики</h4>
                  <div className={styles.statsGrid2}>
                    <div>
                      <label className={styles.fieldLabel}>Численность</label>
                      <input
                        name="unit_str"
                        type="number"
                        min={1}
                        max={99}
                        className={`${styles.fieldInput} ${styles.w100}`}
                        value={unitStr}
                        onChange={(e) => handleUnitStrChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Защита</label>
                      <input name="unit_def" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.def ?? 0} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Очки перемещения</label>
                      <input name="unit_mov" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mov ?? 3} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Мораль</label>
                      <input name="unit_mor" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mor ?? 10} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Боезапас</label>
                      <input name="unit_ammo" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.ammo ?? '10'} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Видимость</label>
                      <input
                        name="unit_vis"
                        type="number"
                        min={0}
                        className={`${styles.fieldInput} ${styles.w100}`}
                        defaultValue={defaultVisAsNumber(selectedUnit?.vis)}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Мины</label>
                      <input name="unit_mines" type="number" min={0} className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mines ?? 0} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Взрывчатка</label>
                      <input
                        name="unit_explosives"
                        type="number"
                        min={0}
                        className={`${styles.fieldInput} ${styles.w100}`}
                        defaultValue={selectedUnit?.explosives ?? 0}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Дымовые снаряды</label>
                      <input
                        name="unit_smoke_shells"
                        type="number"
                        min={0}
                        className={`${styles.fieldInput} ${styles.w100}`}
                        defaultValue={selectedUnit?.smokeShells ?? 0}
                      />
                    </div>
                  </div>
                </div>

                <div className={`${styles.glassCard} ${styles.fireDamageGrid}`}>
                  <div className={styles.fireIntensityHeading}>
                    <h4 className={styles.fireDamageTitle}>Интенсивность огня</h4>
                    <div className={styles.fireIntensityFilterRow} role="tablist" aria-label="Режим таблицы огня">
                      <button
                        type="button"
                        className={`${styles.orderFilterBtn} ${fireIntensityTab === 'all' ? styles.orderFilterBtnActive : ''}`}
                        aria-selected={fireIntensityTab === 'all'}
                        onClick={() => setFireIntensityTab('all')}
                      >
                        Все юниты
                      </button>
                      <button
                        type="button"
                        className={`${styles.orderFilterBtn} ${fireIntensityTab === 'reactive' ? styles.orderFilterBtnActive : ''}`}
                        aria-selected={fireIntensityTab === 'reactive'}
                        onClick={() => setFireIntensityTab('reactive')}
                      >
                        Реактивная артиллерия
                      </button>
                    </div>
                  </div>

                  <div className={styles.fireIntensityModesStack}>
                    {fireIntensityTab === 'reactive' ? (
                      <div className={styles.fireIntensityGridTitle}>Стрельба в одну клетку</div>
                    ) : null}
                    <div className={styles.fireIntensityTableWrap}>
                      <div className={styles.fireCol}>
                        {renderFireRow('inf', 'Пехота', 'standard')}
                        {renderFireRow('art', 'Артиллерия', 'standard')}
                        {renderFireRow('tech', 'Техника', 'standard')}
                        {renderFireRow('armor', 'Бронетехника', 'standard')}
                        {renderFireRow('lt', 'Лёгкие танки', 'standard')}
                      </div>
                      <div className={styles.fireCol}>
                        {renderFireRow('mt', 'Средние танки', 'standard')}
                        {renderFireRow('ht', 'Тяжёлые танки', 'standard')}
                        {renderFireRow('sa', 'Малая авиация', 'standard')}
                        {renderFireRow('ba', 'Большая авиация', 'standard')}
                        {renderFireRow('build', 'Строения', 'standard')}
                      </div>
                    </div>

                    {fireIntensityTab === 'reactive' ? (
                      <div className={styles.fireReactiveIntensityBlock}>
                        <div className={styles.fireIntensityGridTitle}>Стрельба по клеткам</div>
                        <div className={styles.fireIntensityTableWrap}>
                          <div className={styles.fireCol}>
                            {renderFireRow('inf', 'Пехота', 'reactive')}
                            {renderFireRow('art', 'Артиллерия', 'reactive')}
                            {renderFireRow('tech', 'Техника', 'reactive')}
                            {renderFireRow('armor', 'Бронетехника', 'reactive')}
                            {renderFireRow('lt', 'Лёгкие танки', 'reactive')}
                          </div>
                          <div className={styles.fireCol}>
                            {renderFireRow('mt', 'Средние танки', 'reactive')}
                            {renderFireRow('ht', 'Тяжёлые танки', 'reactive')}
                            {renderFireRow('sa', 'Малая авиация', 'reactive')}
                            {renderFireRow('ba', 'Большая авиация', 'reactive')}
                            {renderFireRow('build', 'Строения', 'reactive')}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={`${styles.glassCard} ${styles.fireRangeSection}`} hidden={fireIntensityTab !== 'all'}>
                  <h4 className={styles.cardTitle}>Дальность стрельбы</h4>
                  <FireRangeEditor
                    key={`fire-range-std-${selectedUnit?.id ?? 'new'}`}
                    hiddenInputName="fire_range"
                    initialRange={fireRangeCsv(selectedUnit?.fire?.range)}
                  />
                </div>

                <div className={`${styles.glassCard} ${styles.fireRangeSection}`} hidden={fireIntensityTab !== 'reactive'}>
                  <h4 className={styles.cardTitle}>Дальность стрельбы (реактивная артиллерия)</h4>
                  <FireRangeEditor
                    key={`fire-range-r-${selectedUnit?.id ?? 'new'}`}
                    hiddenInputName="fire_range_r"
                    initialRange={fireRangeCsv(selectedUnit?.fireReactive?.range)}
                  />
                </div>
              </div>
              </>
            )}

            {activeTab === 'hexes' && (
              <div className={styles.hexEditorParamWrap}>
                <EditorHexEditorFields
                  selectedUnit={selectedUnit}
                  EditorImageField={EditorImageField}
                  imagePaths={imagePaths}
                  handleImageUpload={handleImageUpload}
                  handleImageClear={handleImageClear}
                />
              </div>
            )}

            {activeTab === 'rules' && (() => {
              const rawHead = (selectedUnit?.chapter ?? selectedUnit?.head ?? '').trim();
              const ruleChapterLegacy = isLegacyRuleHead(rawHead, ruleEditorChapterIds);
              return (
                <div className={styles.paramGrid1}>
                  <div className={styles.glassCard}>
                    <h4 className={styles.cardTitle}>Основное</h4>
                    <div className={styles.fieldStackLoose}>
                      <div className={styles.ruleMetaRow}>
                        <div className={styles.ruleMetaCell}>
                          <label className={styles.fieldLabelSm}>Название</label>
                          <input name="rule_title" className={styles.fieldInput} defaultValue={selectedUnit?.title || ''} />
                        </div>
                        <div className={styles.ruleMetaCell}>
                          <label className={styles.fieldLabelSm}>Глава</label>
                          <select
                            className={`${styles.fieldSelect} ${styles.ruleChapterSelect}`}
                            value={ruleChapterState}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRuleChapterState(v);
                              if (v !== 'units') setRuleRefUnitState('');
                              if (v !== 'hexes') setRuleRefHexState('');
                            }}
                          >
                            {ruleChapterLegacy && !ruleEditorChapterIds.includes(ruleChapterState) ? (
                              <option value={ruleChapterState}>Устаревшее: {ruleChapterState}</option>
                            ) : null}
                            {ruleChapters.map((ch) => (
                              <option key={ch.id} value={ch.id}>{ch.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {(ruleChapterState === 'units' || ruleChapterState === 'hexes') && ruleEditorChapterIds.includes(ruleChapterState) ? (
                        <div className={styles.ruleRefRow}>
                          <div className={styles.ruleRefCell}>
                            <label className={styles.fieldLabelSm}>Юнит из базы</label>
                            <select className={`${styles.fieldSelect} ${styles.ruleChapterSelect}`} value={ruleRefUnitState} disabled={ruleChapterState !== 'units'} onChange={(e) => setRuleRefUnitState(e.target.value)}>
                              <option value="">— не выбран —</option>
                              {units.map((u) => <option key={u.id} value={String(u.id)}>{u.name || `Юнит #${u.id}`}</option>)}
                            </select>
                          </div>
                          <div className={styles.ruleRefCell}>
                            <label className={styles.fieldLabelSm}>Гекс из базы</label>
                            <select className={`${styles.fieldSelect} ${styles.ruleChapterSelect}`} value={ruleRefHexState} disabled={ruleChapterState !== 'hexes'} onChange={(e) => setRuleRefHexState(e.target.value)}>
                              <option value="">— не выбран —</option>
                              {hexes.map((hx) => <option key={hx.id} value={String(hx.id)}>{hx.name || `Гекс #${hx.id}`}</option>)}
                            </select>
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.ruleImagesRow}>
                        <EditorImageField variant="rulesColumn" label="Изображение 1" value={imagePaths.rule_image ?? ''} thumbClass={styles.thumb64} labelClass={styles.fieldLabelSm} onUpload={(f: File | null) => handleImageUpload('rule_image', f)} onClear={() => handleImageClear('rule_image')} />
                        <EditorImageField variant="rulesColumn" label="Изображение 2" value={imagePaths.rule_image_2 ?? ''} thumbClass={styles.thumb64} labelClass={styles.fieldLabelSm} onUpload={(f: File | null) => handleImageUpload('rule_image_2', f)} onClear={() => handleImageClear('rule_image_2')} />
                        <EditorImageField variant="rulesColumn" label="Изображение 3" value={imagePaths.rule_image_3 ?? ''} thumbClass={styles.thumb64} labelClass={styles.fieldLabelSm} onUpload={(f: File | null) => handleImageUpload('rule_image_3', f)} onClear={() => handleImageClear('rule_image_3')} />
                      </div>
                      <h4 className={styles.cardTitleSmall}>Описание</h4>
                      <div className={styles.ruleDescSection}>
                        <textarea name="rule_desc" className={`${styles.fieldTextarea} ${styles.ruleDescTextarea}`} defaultValue={selectedUnit?.desc || ''} placeholder="Введите описание правила..." />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          {activeTab !== 'units' ? (
            <div className={styles.footerActions}>
              <FooterMapPublicToggle mapEditorPublic={mapEditorPublic} setMapEditorPublic={setMapEditorPublic} />
              <Button size={100} name="Сохранить" onClick={handleSave} />
              {Number.isFinite(Number(selectedUnit?.id)) ? <Button size={100} name="Удалить" onClick={handleDelete} /> : null}
              <Button size={100} name="Отмена" onClick={handleClose} />
            </div>
          ) : null}
          {activeTab === 'units' && (
            <>
              <div className={`${styles.editorUnitOrders} ${styles.editorUnitOrdersCompact}`}>
                <div className={styles.sectionHeading}>Приказы</div>
                <div className={styles.orderFilterRow} role="group" aria-label="Фильтр по типу приказов">
                  {EDITOR_BATTLE_ORDER_GROUP_ORDER.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`${styles.orderFilterBtn} ${orderGroupFilter === cat ? styles.orderFilterBtnActive : ''}`}
                      onClick={() => setOrderGroupFilter(cat)}
                    >
                      {EDITOR_BATTLE_ORDER_GROUP_LABELS[cat]}
                    </button>
                  ))}
                </div>
                <div className={styles.ordersRowWithIntelAir}>
                  <div className={styles.ordersGrid}>{ordersByCategory[orderGroupFilter].map(renderOrderChip)}</div>
                  {showAnyReconRangeEditor ? (
                    <div className={styles.ordersSpecialReconPanels}>
                      {showIntelligenceAirRangeEditor ? (
                        <div className={`${styles.glassCard} ${styles.intelligenceAirFireCard}`}>
                          <h4 className={styles.cardTitle}>Авиационная разведка</h4>
                          <p className={styles.intelligenceAirLegendLine}>Радиус зоны (1 — точка приказа)</p>
                          <p className={styles.intelligenceAirLegendLine}>Макс. значение для успеха</p>
                          <FireRangeEditor
                            key={`intel-air-range-${selectedUnit?.id ?? 'new'}`}
                            hiddenInputName="intelligence_air_range"
                            initialRange={fireRangeCsv(selectedUnit?.intelligenceAirRange)}
                            hideMatrixLabel
                            hideQuickFillHeading
                            distanceDisplayOffset={1}
                            quickAccuracyLabel="Макс. для успеха"
                            quickAccuracyTitle="Максимальное значение для успеха (подставляется во все позиции при «Заполнить»)"
                            matrixAriaLabel="Радиус зоны в клетках и макс. значение для успеха по дистанции"
                          />
                        </div>
                      ) : null}
                      {showRazvedkaRangeEditor ? (
                        <div className={`${styles.glassCard} ${styles.intelligenceAirFireCard}`}>
                          <h4 className={styles.cardTitle}>Разведка</h4>
                          <p className={styles.intelligenceAirLegendLine}>Радиус зоны (1 — точка приказа)</p>
                          <p className={styles.intelligenceAirLegendLine}>Макс. значение для успеха</p>
                          <FireRangeEditor
                            key={`razvedka-range-${selectedUnit?.id ?? 'new'}`}
                            hiddenInputName="razvedka_range"
                            initialRange={fireRangeCsv(selectedUnit?.razvedkaRange)}
                            hideMatrixLabel
                            hideQuickFillHeading
                            distanceDisplayOffset={1}
                            quickAccuracyLabel="Макс. для успеха"
                            quickAccuracyTitle="Максимальное значение для успеха (подставляется во все позиции при «Заполнить»)"
                            matrixAriaLabel="Радиус зоны в клетках и макс. значение для успеха по дистанции"
                          />
                        </div>
                      ) : null}
                      {showSvzyRangeEditor ? (
                        <div className={`${styles.glassCard} ${styles.intelligenceAirFireCard}`}>
                          <h4 className={styles.cardTitle}>Радиоперехват</h4>
                          <p className={styles.intelligenceAirLegendLine}>Радиус зоны (1 — точка приказа)</p>
                          <p className={styles.intelligenceAirLegendLine}>Макс. значение для успеха</p>
                          <FireRangeEditor
                            key={`svzy-range-${selectedUnit?.id ?? 'new'}`}
                            hiddenInputName="svzy_range"
                            initialRange={fireRangeCsv(selectedUnit?.svzyRange)}
                            hideMatrixLabel
                            hideQuickFillHeading
                            distanceDisplayOffset={1}
                            quickAccuracyLabel="Макс. для успеха"
                            quickAccuracyTitle="Максимальное значение для успеха (подставляется во все позиции при «Заполнить»)"
                            matrixAriaLabel="Радиус зоны в клетках и макс. значение для успеха по дистанции"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={`${styles.sectionHeading} ${styles.sectionHeadingProperties}`}>Свойства</div>
                <div className={`${styles.ordersGrid} ${styles.ordersGridProperties}`}>
                  {editorUnitPropertiesForEditor.map((prop) => {
                    const id = prop.id;
                    const disabled = id == null;
                    const selected = typeof id === 'number' && selectedProperties.includes(id);
                    return (
                      <div
                        key={prop.prop_key}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        onClick={() => !disabled && toggleProperty(id)}
                        onKeyDown={(e) => {
                          if (disabled) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleProperty(id);
                          }
                        }}
                        className={`${styles.orderChip} ${selected ? styles.orderChipSelected : ''} ${disabled ? styles.orderChipDisabled : ''} ${prop.icon ? '' : styles.orderChipTextOnly}`}
                        title={disabled ? (propertyIdByKey.size === 0 ? 'Справочник свойств не загрузился: проверьте сервер и запрос /api/editor/properties, затем обновите страницу.' : `Нет строки в БД property с ключом «${prop.prop_key}» — перезапустите сервер и обновите страницу.`) : prop.name}
                      >
                        {prop.icon ? (
                          <>
                            <div className={styles.orderChipIconWrap}>
                              <img src={prop.icon} alt="" className={styles.orderChipIconImg} />
                            </div>
                            <div className={styles.orderChipLabel}>{prop.name}</div>
                          </>
                        ) : (
                          <div className={styles.chipTitleOnly}>{prop.name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={styles.footerActions}>
                <FooterMapPublicToggle mapEditorPublic={mapEditorPublic} setMapEditorPublic={setMapEditorPublic} />
                <Button size={120} name="Сохранить" onClick={handleSave} />
                {Number.isFinite(Number(selectedUnit?.id)) ? <Button size={120} name="Удалить" onClick={handleDelete} /> : null}
                <Button size={120} name="Закрыть" onClick={handleClose} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EditorUnitWorkspace;

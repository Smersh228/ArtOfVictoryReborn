import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/editorUnit.module.css';

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
  EditorImageField: React.ComponentType<EditorImageFieldProps>;
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
    EditorImageField,
  } = props;

  return (
    <div className={styles.rightWorkspace}>
      {showEditor && (
        <div className={`${styles.editorWorkspaceInner} ${activeTab === 'rules' ? styles.editorWorkspaceInnerScroll : ''}`}>
          <div
            ref={editorFormRef}
            key={`${activeTab}-${selectedUnit?.id ?? 'new'}`}
            className={`${styles.editorUnitParametrs} ${activeTab === 'rules' ? styles.editorUnitParametrsTall : ''} ${activeTab === 'units' ? styles.editorUnitParametrsUnits : ''}`}
          >
            {activeTab === 'units' && (
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
                      <input name="unit_str" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.str ?? 10} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Защита</label>
                      <input name="unit_def" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.def ?? 0} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Очки перемещения</label>
                      <input name="unit_mov" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mov ?? 0} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Мораль</label>
                      <input name="unit_mor" type="number" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mor ?? 50} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Боезапас</label>
                      <input name="unit_ammo" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.ammo ?? '100'} />
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
                      <label className={styles.fieldLabel}>Дальность стрельбы (меткость)</label>
                      <input name="fire_range" className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.fire?.range ?? '1,2,3'} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>Мины</label>
                      <input name="unit_mines" type="number" min={0} className={`${styles.fieldInput} ${styles.w100}`} defaultValue={selectedUnit?.mines ?? 0} />
                    </div>
                  </div>
                </div>

                <div className={`${styles.glassCard} ${styles.fireDamageGrid}`}>
                  <h4 className={styles.fireDamageTitle}>Урон / меткость</h4>
                  <div className={styles.fireCol}>
                    <div><label className={styles.fieldLabel}>Пехота</label><input name="fire_inf" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.inf ?? '3,5,1,4'} /></div>
                    <div><label className={styles.fieldLabel}>Артиллерия</label><input name="fire_art" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.art ?? '2,4,1,3'} /></div>
                    <div><label className={styles.fieldLabel}>Техника</label><input name="fire_tech" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.tech ?? '1,3,0,2'} /></div>
                    <div><label className={styles.fieldLabel}>Бронетехника</label><input name="fire_armor" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.armor ?? '1,2,0,1'} /></div>
                    <div><label className={styles.fieldLabel}>Лёгкие танки</label><input name="fire_lt" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.lt ?? '1,2,0,1'} /></div>
                  </div>
                  <div className={styles.fireCol}>
                    <div><label className={styles.fieldLabel}>Средние танки</label><input name="fire_mt" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.mt ?? '0,1,0,0'} /></div>
                    <div><label className={styles.fieldLabel}>Тяжёлые танки</label><input name="fire_ht" className={styles.fieldInput} defaultValue={selectedUnit?.fire?.ht ?? '0,0,0,0'} /></div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'hexes' && (
              <div className={styles.paramGrid1}>
                <div className={`${styles.glassCard} ${styles.hexEditorMainCard}`}>
                  <h4 className={styles.cardTitle}>Основное</h4>
                  <div className={styles.fieldStackLoose}>
                    <div><label className={styles.fieldLabelSm}>Название</label><input name="hex_name" className={styles.fieldInput} defaultValue={selectedUnit?.name || ''} /></div>
                    <EditorImageField
                      label="Изображение гекса"
                      value={imagePaths.hex_image ?? ''}
                      thumbClass={styles.thumb64}
                      labelClass={styles.fieldLabel}
                      onUpload={(f: File | null) => handleImageUpload('hex_image', f)}
                      onClear={() => handleImageClear('hex_image')}
                    />
                    <div className={styles.statsGrid2}>
                      <div><label className={styles.fieldLabelSm}>Бонус защиты (пехота)</label><input name="hex_def_inf" type="number" className={styles.fieldInput} defaultValue={selectedUnit?.defBonusInf ?? 0} /></div>
                      <div><label className={styles.fieldLabelSm}>Бонус защиты (техника)</label><input name="hex_def_tech" type="number" className={styles.fieldInput} defaultValue={selectedUnit?.defBonusTech ?? 0} /></div>
                    </div>
                    <div className={styles.statsGrid2}>
                      <div><label className={styles.fieldLabelSm}>Стоимость перемещения (пехота)</label><input name="hex_move_cost_inf" type="number" className={styles.fieldInput} defaultValue={selectedUnit?.moveCostInf ?? selectedUnit?.moveCost ?? 1} /></div>
                      <div><label className={styles.fieldLabelSm}>Стоимость перемещения (техника)</label><input name="hex_move_cost_tech" type="number" className={styles.fieldInput} defaultValue={selectedUnit?.moveCostTech ?? selectedUnit?.moveCost ?? 1} /></div>
                    </div>
                    <div>
                      <label className={styles.fieldLabelSm}>Преграда для видимости</label>
                      <select name="hex_vision_block" className={styles.fieldSelect} defaultValue={selectedUnit?.visionBlock ? 'yes' : 'no'}>
                        <option value="yes">Да</option>
                        <option value="no">Нет</option>
                      </select>
                    </div>
                  </div>
                </div>
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
              <Button size={100} name="Сохранить" onClick={handleSave} />
              {Number.isFinite(Number(selectedUnit?.id)) ? <Button size={100} name="Удалить" onClick={handleDelete} /> : null}
              <Button size={100} name="Отмена" onClick={handleClose} />
            </div>
          ) : null}
          {activeTab === 'units' && (
            <>
              <div className={`${styles.editorUnitOrders} ${styles.editorUnitOrdersCompact}`}>
                <div className={styles.sectionHeading}>Приказы</div>
                <div className={styles.ordersGrid}>
                  {battleOrdersForEditor.map((order) => {
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
                        title={disabled ? (Object.keys(orderIdByKey).length === 0 ? 'Справочник приказов не загрузился: проверьте, что сервер запущен и запрос /api/editor/orders доступен (авторизация, URL API), затем обновите страницу.' : `Нет строки в БД orders с ключом «${order.order_key}» — выполните миграции редактора или обновите страницу после запуска сервера.`) : order.name}
                      >
                        {order.icon ? (
                          <>
                            <div className={styles.orderChipIconWrap}><img src={order.icon} alt="" className={styles.orderChipIconImg} /></div>
                            <div className={styles.orderChipLabel}>{order.name}</div>
                          </>
                        ) : (
                          <div className={styles.chipTitleOnly}>{order.name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className={styles.sectionHeading}>Свойства</div>
                <div className={styles.ordersGrid}>
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
                        className={`${styles.propChip} ${selected ? styles.propChipSelected : ''} ${disabled ? styles.propChipDisabled : ''}`}
                        title={disabled ? (propertyIdByKey.size === 0 ? 'Справочник свойств не загрузился: проверьте сервер и запрос /api/editor/properties, затем обновите страницу.' : `Нет строки в БД property с ключом «${prop.prop_key}» — перезапустите сервер и обновите страницу.`) : prop.name}
                      >
                        <div className={styles.chipTitleOnly}>{prop.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={styles.footerActions}>
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

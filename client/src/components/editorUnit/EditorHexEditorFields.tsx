import React, { useEffect, useState } from 'react';
import styles from '../../pages/styleModules/editorUnit.module.css';
import {
  HEX_FORM_CATEGORIES,
  HEX_MOVE_DEF_UNIT_TYPES,
  HEX_PLACEMENT_OPTS,
  HEX_UNIT_TYPES,
} from './editorHexTypes';
import { HexAccuracyBonusEditor } from './HexAccuracyBonusEditor';

function readHexExtra(sel: unknown): Record<string, unknown> {
  if (sel && typeof sel === 'object' && 'hexExtra' in sel) {
    const h = (sel as { hexExtra?: unknown }).hexExtra;
    if (h && typeof h === 'object') return h as Record<string, unknown>;
  }
  return {};
}

interface Props {
  selectedUnit: unknown;
  EditorImageField: React.ComponentType<{
    label: string;
    value: string;
    thumbClass: string;
    labelClass: string;
    onUpload: (file: File | null) => void;
    onClear: () => void;
  }>;
  imagePaths: Record<string, string>;
  handleImageUpload: (key: string, file: File | null) => void;
  handleImageClear: (key: string) => void;
}

export const EditorHexEditorFields: React.FC<Props> = ({
  selectedUnit,
  EditorImageField,
  imagePaths,
  handleImageUpload,
  handleImageClear,
}) => {
  const hexRow: Record<string, unknown> =
    selectedUnit != null && typeof selectedUnit === 'object'
      ? (selectedUnit as Record<string, unknown>)
      : {};
  const ex = readHexExtra(hexRow);
  const mc = (ex.moveCostByType as Record<string, number> | undefined) ?? {};
  const db = (ex.defBonusByType as Record<string, number> | undefined) ?? {};
  const acc = (ex.accuracyBonusByType as Record<string, number> | undefined) ?? {};
  const accMelee = (ex.accuracyBonusMeleeByType as Record<string, boolean> | undefined) ?? {};
  const amb = (ex.ambushAllowed as Record<string, boolean> | undefined) ?? {};
  const plc = (ex.placementAllowed as Record<string, boolean> | undefined) ?? {};

  const moveCostInf = typeof hexRow.moveCostInf === 'number' ? hexRow.moveCostInf : Number(hexRow.moveCostInf) || 1;
  const moveCostTech = typeof hexRow.moveCostTech === 'number' ? hexRow.moveCostTech : Number(hexRow.moveCostTech) || 1;
  const defInf = typeof hexRow.defBonusInf === 'number' ? hexRow.defBonusInf : Number(hexRow.defBonusInf) || 0;
  const defTech = typeof hexRow.defBonusTech === 'number' ? hexRow.defBonusTech : Number(hexRow.defBonusTech) || 0;

  const defaultMc = (id: string) => {
    const v = mc[id];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
    if (id === 'infantry') return moveCostInf;
    return moveCostTech;
  };

  const defaultDef = (id: string) => {
    const v = db[id];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
    if (id === 'infantry') return defInf;
    return defTech;
  };

  const category = typeof ex.category === 'string' && ex.category ? String(ex.category) : 'nature';
  const hexKey = String(hexRow.id ?? hexRow.name ?? 'new');
  const [flagRailway, setFlagRailway] = useState(ex.isRailway === true || ex.railway === true || ex.rail === true);
  const [flagRailStation, setFlagRailStation] = useState(ex.isRailStation === true);
  const [flagBridge, setFlagBridge] = useState(ex.isBridge === true);
  const [flagRailwayBridge, setFlagRailwayBridge] = useState(ex.isRailwayBridge === true);

  useEffect(() => {
    setFlagRailway(ex.isRailway === true || ex.railway === true || ex.rail === true);
    setFlagRailStation(ex.isRailStation === true);
    setFlagBridge(ex.isBridge === true);
    setFlagRailwayBridge(ex.isRailwayBridge === true);
  }, [hexKey, ex.isRailway, ex.railway, ex.rail, ex.isRailStation, ex.isBridge, ex.isRailwayBridge]);

  const showDestroyedBridgeImage = flagBridge || flagRailwayBridge;
  const showDestroyedRailwayImage = flagRailway || flagRailStation || flagRailwayBridge;

  return (
    <div className={styles.hexEditorLayout}>
      <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorMainSpan}`}>
        <h4 className={styles.cardTitle}>Основное</h4>
        <div className={styles.fieldStackLoose}>
          <div>
            <label className={styles.fieldLabelSm}>Название</label>
            <input name="hex_name" className={styles.fieldInput} defaultValue={String(hexRow.name ?? '')} />
          </div>
          <EditorImageField
            label="Изображение гекса"
            value={imagePaths.hex_image ?? ''}
            thumbClass={styles.thumb64}
            labelClass={styles.fieldLabel}
            onUpload={(f: File | null) => handleImageUpload('hex_image', f)}
            onClear={() => handleImageClear('hex_image')}
          />
          <div>
            <label className={styles.fieldLabelSm}>Группа местности</label>
            <select name="hex_category" className={styles.fieldSelect} defaultValue={category}>
              {HEX_FORM_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.fieldLabelSm}>Преграда для видимости</label>
            <select name="hex_vision_block" className={styles.fieldSelect} defaultValue={hexRow.visionBlock ? 'yes' : 'no'}>
              <option value="yes">Да</option>
              <option value="no">Нет</option>
            </select>
          </div>

          <div className={styles.hexEditorSectionTitle}>Тип объекта</div>
          <div className={styles.hexCheckboxGrid}>
            <label className={styles.fireMeleeCb}>
              <input type="checkbox" name="hex_flag_settlement" defaultChecked={ex.isSettlement === true} />
              Населённый пункт
            </label>
            <label className={styles.fireMeleeCb}>
              <input type="checkbox" name="hex_flag_city" defaultChecked={ex.isCity === true} />
              Город (пожар 9 ходов)
            </label>
            <label className={styles.fireMeleeCb}>
              <input type="checkbox" name="hex_flag_village" defaultChecked={ex.isVillage === true} />
              Деревня
            </label>
            <label className={styles.fireMeleeCb}>
              <input
                type="checkbox"
                name="hex_flag_rail"
                checked={flagRailStation}
                onChange={(e) => setFlagRailStation(e.target.checked)}
              />
              Ж/д станция
            </label>
            <label className={styles.fireMeleeCb}>
              <input
                type="checkbox"
                name="hex_flag_railway"
                checked={flagRailway}
                onChange={(e) => setFlagRailway(e.target.checked)}
              />
              Ж/д дорога
            </label>
            <label className={styles.fireMeleeCb}>
              <input
                type="checkbox"
                name="hex_flag_bridge"
                checked={flagBridge}
                onChange={(e) => setFlagBridge(e.target.checked)}
              />
              Мост
            </label>
            <label className={styles.fireMeleeCb}>
              <input
                type="checkbox"
                name="hex_flag_railway_bridge"
                checked={flagRailwayBridge}
                onChange={(e) => setFlagRailwayBridge(e.target.checked)}
              />
              Ж/д мост
            </label>
            <label className={styles.fireMeleeCb}>
              <input type="checkbox" name="hex_flag_ford" defaultChecked={ex.isFord === true} />
              Брод
            </label>
          </div>
          {showDestroyedBridgeImage ? (
            <EditorImageField
              label="Изображение разрушенного моста"
              value={imagePaths.hex_image_destroyed_bridge ?? ''}
              thumbClass={styles.thumb64}
              labelClass={styles.fieldLabel}
              onUpload={(f: File | null) => handleImageUpload('hex_image_destroyed_bridge', f)}
              onClear={() => handleImageClear('hex_image_destroyed_bridge')}
            />
          ) : null}
          {showDestroyedRailwayImage ? (
            <EditorImageField
              label="Изображение разрушенной ЖД"
              value={imagePaths.hex_image_destroyed_railway ?? ''}
              thumbClass={styles.thumb64}
              labelClass={styles.fieldLabel}
              onUpload={(f: File | null) => handleImageUpload('hex_image_destroyed_railway', f)}
              onClear={() => handleImageClear('hex_image_destroyed_railway')}
            />
          ) : null}
        </div>
      </div>

      <div className={styles.hexEditorAmbushPlaceBand}>
        <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorStretchCard}`}>
          <h4 className={styles.cardTitle}>Засада разрешена (тип юнита)</h4>
          <div
            className={`${styles.hexCheckboxGrid} ${styles.hexCheckboxGridDense} ${styles.hexCheckboxGridTwoCol}`}
          >
            {HEX_UNIT_TYPES.map((t) => (
              <label key={t.id} className={styles.fireMeleeCb}>
                <input type="checkbox" name={`hex_ambush_${t.id}`} defaultChecked={amb[t.id] !== false} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorStretchCard}`}>
          <h4 className={styles.cardTitle}>Разрешить установку</h4>
          <div
            className={`${styles.hexCheckboxGrid} ${styles.hexCheckboxGridDense} ${styles.hexCheckboxGridTwoCol}`}
          >
            {HEX_PLACEMENT_OPTS.map((p) => (
              <label key={p.key} className={styles.fireMeleeCb}>
                <input type="checkbox" name={p.name} defaultChecked={plc[p.key] !== false} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorCostUnderAmbush}`}>
        <h4 className={styles.hexCombatMergeTitle}>Стоимость перемещения</h4>
        <div className={styles.hexEditorStatsCompact}>
          {HEX_MOVE_DEF_UNIT_TYPES.map((t) => (
            <div key={t.id}>
              <label className={styles.fieldLabelSm}>{t.label}</label>
              <input
                name={`hex_mc_${t.id}`}
                type="number"
                min={0}
                className={styles.fieldInput}
                defaultValue={defaultMc(t.id)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorDefenseUnderPlace}`}>
        <h4 className={styles.hexCombatMergeTitle}>Бонус защиты</h4>
        <div className={styles.hexEditorStatsCompact}>
          {HEX_MOVE_DEF_UNIT_TYPES.map((t) => (
            <div key={t.id}>
              <label className={styles.fieldLabelSm}>{t.label}</label>
              <input
                name={`hex_def_${t.id}`}
                type="number"
                className={styles.fieldInput}
                defaultValue={defaultDef(t.id)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.glassCard} ${styles.hexEditorCard} ${styles.hexEditorCardFullRow}`}>
        <div className={styles.hexCombatMergeInner}>
          <div className={styles.hexCombatMergeMovement}>
            <h4 className={styles.hexCombatMergeTitle}>Движение при свойстве юнита</h4>
            <div className={`${styles.hexCheckboxGrid} ${styles.hexCheckboxGridDense}`}>
              <label className={styles.fireMeleeCb}>
                <input type="checkbox" name="hex_move_swamp_prop" defaultChecked={ex.moveWithSwampProp === true} />
                Преодоление болота
              </label>
              <label className={styles.fireMeleeCb}>
                <input type="checkbox" name="hex_move_river_prop" defaultChecked={ex.moveWithRiverProp === true} />
                Преодоление водной преграды
              </label>
              <label className={styles.fireMeleeCb}>
                <input type="checkbox" name="hex_move_water_unit_prop" defaultChecked={ex.moveWithWaterUnitProp === true} />
                Водный юнит
              </label>
            </div>
          </div>
          <div className={styles.hexCombatMergeBottom}>
            <h4 className={styles.hexCombatMergeTitle}>Бонус по меткости</h4>
            <HexAccuracyBonusEditor
              hexKey={String(hexRow.id ?? hexRow.name ?? 'new')}
              rules={ex.accuracyBonusRules}
              acc={acc}
              accMelee={accMelee}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

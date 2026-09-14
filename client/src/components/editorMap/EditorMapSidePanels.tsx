import React from 'react';
import styles from '../../pages/styleModules/editorMap.module.css';
import unitStyles from '../../pages/styleModules/editorUnit.module.css';
import { resolveEditorImageUrl } from '../../api/editorCatalog';
import {
  botsSlotsForLimit,
  type MapBotsState,
} from '../../game/editorMapBots';
import {
  addReinforcementUnit,
  createReinforcementWave,
  MAX_REINFORCEMENT_WAVES,
  poolCopyCount,
  reinforcementWaveUnitCap,
  REINFORCEMENT_UNITS_PER_HEX,
  removeReinforcementUnit,
  setReinforcementUnitCargo,
  type MapReinforcementsState,
  type ReinforcementWave,
} from '../../game/editorMapReinforcements';
import { factionForTeam, isWehrmachtFaction, teamSideLabel, teamsForLimit } from '../../game/editorMapTeam';
import {
  catalogTransportKind,
  padCargoSlots,
  slotIndicesForUnitId,
} from '../../game/editorMapTransportCargo';
import type { MapEnvironmentFlags } from '../../game/editorMapEnvironment';
import TransportCargoEditor from './TransportCargoEditor';

type FactionId = string;
type UnitTypeId = string;

interface AxisCaptureState {
  enabled: boolean;
  hexes: string;
  turns: string;
  requiredUnits: string;
}

interface AxisEliminationState {
  enabled: boolean;
  type: 'all' | 'specific';
  specificUnits: string;
}

type StruggleFactionId = string;
export type ScenarioPhotoSlot = 0 | 1;

const WEATHER_ROWS: { key: 'fog' | 'rain'; label: string }[] = [
  { key: 'fog', label: 'Туман' },
  { key: 'rain', label: 'Дождь' },
];

const factions: { id: FactionId; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'germany', label: 'Вермахт' },
  { id: 'ussr', label: 'СССР' },
];

const unitTypes: { id: UnitTypeId; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'infantry', label: 'Пехота' },
  { id: 'artillery', label: 'Артиллерия' },
  { id: 'tech', label: 'Техника' },
  { id: 'armor', label: 'Бронетехника' },
  { id: 'lightTank', label: 'Легкие танки' },
  { id: 'mediumTank', label: 'Средние танки' },
  { id: 'heavyTank', label: 'Тяжелые танки' },
  { id: 'lightAir', label: 'Малая авиация' },
  { id: 'heavyAir', label: 'Большая авиация' },
];

export const UnitsFilters: React.FC<{
  selectedFaction: FactionId;
  selectedUnitType: UnitTypeId;
  selectedTeam: number;
  teamLimit: 2 | 4 | 6;
  onFaction: (id: FactionId) => void;
  onUnitType: (id: UnitTypeId) => void;
  onTeam: (team: number) => void;
}> = ({ selectedFaction, selectedUnitType, selectedTeam, teamLimit, onFaction, onUnitType, onTeam }) => (
  <>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Команда</div>
      <div className={styles.filterRow}>
        {Array.from({ length: teamLimit }, (_, i) => i + 1).map((team) => (
          <div
            key={team}
            className={`${styles.filterItem} ${selectedTeam === team ? styles.active : ''}`}
            onClick={() => onTeam(team)}
          >
            {team} {team % 2 === 1 ? 'СССР' : 'Вермахт'}
          </div>
        ))}
      </div>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Фракция</div>
      <div className={styles.filterRow}>
        {factions.map((f) => (
          <div
            key={f.id}
            className={`${styles.filterItem} ${selectedFaction === f.id ? styles.active : ''}`}
            onClick={() => onFaction(f.id)}
          >
            {f.label}
          </div>
        ))}
      </div>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Тип</div>
      <div className={styles.unitTypeGrid}>
        {unitTypes.map((t) => (
          <div
            key={t.id}
            className={`${styles.filterItem} ${selectedUnitType === t.id ? styles.active : ''}`}
            onClick={() => onUnitType(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>
    </div>
  </>
);

export const ConditionsPanel: React.FC<{
  axisCapture: AxisCaptureState;
  setAxisCapture: React.Dispatch<React.SetStateAction<AxisCaptureState>>;
  axisElimination: AxisEliminationState;
  setAxisElimination: React.Dispatch<React.SetStateAction<AxisEliminationState>>;
  struggleFaction: StruggleFactionId;
  setStruggleFaction: (v: StruggleFactionId) => void;
  allyTasks: string;
  setAllyTasks: (v: string) => void;
  axisTasks: string;
  setAxisTasks: (v: string) => void;
  maxTurns: string;
  setMaxTurns: (v: string) => void;
  environment: MapEnvironmentFlags;
  setEnvironment: React.Dispatch<React.SetStateAction<MapEnvironmentFlags>>;
}> = ({
  axisCapture,
  setAxisCapture,
  axisElimination,
  setAxisElimination,
  struggleFaction,
  setStruggleFaction,
  allyTasks,
  setAllyTasks,
  axisTasks,
  setAxisTasks,
  maxTurns,
  setMaxTurns,
  environment,
  setEnvironment,
}) => (
  <>
    <div className={styles.filterGroup}>
      <div className={`${styles.filterGroupTitle} ${styles.conditionsVictoryTitle}`}>Методы победы</div>
      <select
        className={`${styles.panelInput} ${styles.fullWidthSpaced} ${styles.marginTopSm}`}
        value={struggleFaction}
        onChange={(e) => setStruggleFaction(e.target.value as StruggleFactionId)}
      >
        <option value="wehrmacht">Вермахт</option>
        <option value="rkka">РККА</option>
      </select>
      <div className={styles.conditionsBlock}>
        <label className={styles.checkboxRowBlock}>
          <input
            type="checkbox"
            checked={axisCapture.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setAxisCapture((prev) => ({ ...prev, enabled }));
              if (enabled) setAxisElimination((prev) => ({ ...prev, enabled: false }));
            }}
          />
          Захват области
        </label>
        {axisCapture.enabled && (
          <div className={styles.conditionsNested}>
            <div className={styles.fieldLabel}>Гексы (ID):</div>
            <input type="text" placeholder="5,6,7,8" value={axisCapture.hexes} onChange={(e) => setAxisCapture((p) => ({ ...p, hexes: e.target.value }))} className={`${styles.panelInput} ${styles.fullWidthSpaced}`} />
            <div className={styles.fieldLabel}>Ходов для захвата:</div>
            <input type="number" placeholder="3" value={axisCapture.turns} onChange={(e) => setAxisCapture((p) => ({ ...p, turns: e.target.value }))} className={`${styles.panelInput} ${styles.fullWidthSpaced}`} />
            <div className={styles.fieldLabel}>Нужно юнитов:</div>
            <input type="number" placeholder="2" value={axisCapture.requiredUnits} onChange={(e) => setAxisCapture((p) => ({ ...p, requiredUnits: e.target.value }))} className={`${styles.panelInput} ${styles.fullWidth}`} />
          </div>
        )}
      </div>
      <div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={axisElimination.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setAxisElimination((prev) => ({ ...prev, enabled }));
              if (enabled) setAxisCapture((prev) => ({ ...prev, enabled: false }));
            }}
          />
          Уничтожение врага
        </label>
        {axisElimination.enabled && (
          <div className={styles.conditionsNested}>
            <label className={styles.radioLabel}>
              <input type="radio" name="axisElimType" checked={axisElimination.type === 'all'} onChange={() => setAxisElimination((p) => ({ ...p, type: 'all' }))} /> Все юниты
            </label>
            <label className={styles.radioLabel}>
              <input type="radio" name="axisElimType" checked={axisElimination.type === 'specific'} onChange={() => setAxisElimination((p) => ({ ...p, type: 'specific' }))} /> Определенные юниты
            </label>
            {axisElimination.type === 'specific' && (
              <input type="text" placeholder="ID экземпляров через запятую (в меню по клику на юните), напр. 1, 2, 3" value={axisElimination.specificUnits} onChange={(e) => setAxisElimination((p) => ({ ...p, specificUnits: e.target.value }))} className={`${styles.panelInput} ${styles.fullWidth} ${styles.marginTopSm}`} />
            )}
          </div>
        )}
      </div>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.tasksBlock}>
        <div className={styles.tasksHeadingUssr}>ЗАДАЧИ РККА</div>
        <textarea value={allyTasks} onChange={(e) => setAllyTasks(e.target.value)} placeholder="Задачи для советских войск..." rows={4} className={`${styles.panelTextarea} ${styles.conditionsTasksTextarea} ${styles.fullWidth} ${styles.marginTopSm}`} />
      </div>
      <div className={`${styles.tasksBlock} ${styles.tasksBlockLast}`}>
        <div className={styles.tasksHeadingAxis}>ЗАДАЧИ ВЕРМАХТА</div>
        <textarea value={axisTasks} onChange={(e) => setAxisTasks(e.target.value)} placeholder="Задачи для немецких войск..." rows={4} className={`${styles.panelTextarea} ${styles.conditionsTasksTextarea} ${styles.fullWidth} ${styles.marginTopSm}`} />
      </div>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Погода и время суток</div>
      <div className={styles.conditionsWeather}>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={environment.night}
            onChange={(e) => setEnvironment((prev) => ({ ...prev, night: e.target.checked }))}
          />
          Ночное время суток
        </label>
        {environment.night ? (
          <label className={`${styles.checkboxRow} ${styles.conditionsWeatherNested}`}>
            <input
              type="checkbox"
              checked={environment.nightFromFirst}
              onChange={(e) => setEnvironment((prev) => ({ ...prev, nightFromFirst: e.target.checked }))}
            />
            С первого хода
          </label>
        ) : null}
        {WEATHER_ROWS.map((row) => {
          const spec = environment[row.key]
          return (
            <div key={row.key} className={styles.weatherSpecBlock}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={spec.enabled}
                  onChange={(e) =>
                    setEnvironment((prev) => ({
                      ...prev,
                      [row.key]: { ...prev[row.key], enabled: e.target.checked },
                    }))
                  }
                />
                {row.label}
              </label>
              {spec.enabled ? (
                <div className={styles.weatherSpecFields}>
                  <label className={styles.weatherSpecField}>
                    Шанс %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={styles.panelInput}
                      value={spec.chance}
                      onChange={(e) =>
                        setEnvironment((prev) => ({
                          ...prev,
                          [row.key]: { ...prev[row.key], chance: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className={styles.weatherSpecField}>
                    Ходов
                    <input
                      type="number"
                      min={1}
                      className={styles.panelInput}
                      value={spec.duration}
                      onChange={(e) =>
                        setEnvironment((prev) => ({
                          ...prev,
                          [row.key]: { ...prev[row.key], duration: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.fieldLabel}>Максимальное кол-во ходов для сценария:</div>
      <input type="number" value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} className={`${styles.panelInput} ${styles.fullWidth} ${styles.marginTopSm}`} />
    </div>
  </>
);

const BOT_DIFFICULTIES: { id: 'easy' | 'normal' | 'hard'; label: string }[] = [
  { id: 'easy', label: 'Легко' },
  { id: 'normal', label: 'Нормально' },
  { id: 'hard', label: 'Сложно' },
];

function teamFactionLabel(team: number): string {
  return team % 2 === 1 ? 'РККА' : 'Вермахт';
}

export const BotsPanel: React.FC<{
  bots: MapBotsState;
  setBots: React.Dispatch<React.SetStateAction<MapBotsState>>;
  teamLimit: 2 | 4 | 6;
}> = ({ bots, setBots, teamLimit }) => {
  const slots = botsSlotsForLimit(teamLimit, bots.slots);
  return (
    <>
      <div className={styles.filterGroup}>
        <div className={styles.filterGroupTitle}>Боты</div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={bots.enabled}
            onChange={(e) => setBots((prev) => ({ ...prev, enabled: e.target.checked, slots }))}
          />
          Разрешить ботов на карте
        </label>
        <p className={styles.botsHint}>
          Слоты «Бот» займёт ИИ при создании комнаты. Карта на двоих (один игрок и один бот) после проверки
          появится во вкладке «Одиночная игра».
        </p>
      </div>
      {bots.enabled ? (
        <>
          <div className={styles.filterGroup}>
            <div className={styles.filterGroupTitle}>Сложность</div>
            <div className={styles.filterRow}>
              {BOT_DIFFICULTIES.map((row) => (
                <div
                  key={row.id}
                  className={`${styles.filterItem} ${bots.difficulty === row.id ? styles.active : ''}`}
                  onClick={() => setBots((prev) => ({ ...prev, difficulty: row.id }))}
                >
                  {row.label}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <div className={styles.filterGroupTitle}>Слоты</div>
            {slots.map((slot) => (
              <div key={slot.team} className={styles.botsSlot}>
                <div className={styles.botsSlotTitle}>
                  Команда {slot.team} · {teamFactionLabel(slot.team)}
                </div>
                <div className={styles.filterRow}>
                  <div
                    className={`${styles.filterItem} ${slot.kind === 'player' ? styles.active : ''}`}
                    onClick={() =>
                      setBots((prev) => ({
                        ...prev,
                        slots: slots.map((s) => (s.team === slot.team ? { ...s, kind: 'player' } : s)),
                      }))
                    }
                  >
                    Игрок
                  </div>
                  <div
                    className={`${styles.filterItem} ${slot.kind === 'bot' ? styles.active : ''}`}
                    onClick={() =>
                      setBots((prev) => ({
                        ...prev,
                        slots: slots.map((s) => (s.team === slot.team ? { ...s, kind: 'bot' } : s)),
                      }))
                    }
                  >
                    Бот
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
};

type CatalogUnitLite = {
  id: number;
  name: string;
  type?: string;
  faction: string;
  imagePath: string;
  heavyTech?: boolean;
  heavyArtillery?: boolean;
  properties?: Array<{ prop_key?: string; name?: string }>;
  orders?: Array<{ order_key?: string; key?: string; name?: string }>;
};

export const ReinforcementsPanel: React.FC<{
  reinforcements: MapReinforcementsState;
  setReinforcements: React.Dispatch<React.SetStateAction<MapReinforcementsState>>;
  teamLimit: 2 | 4 | 6;
  catalogUnits: CatalogUnitLite[];
  pickingWaveId: string | null;
  onPickWaveHexes: (waveId: string | null) => void;
}> = ({
  reinforcements,
  setReinforcements,
  teamLimit,
  catalogUnits,
  pickingWaveId,
  onPickWaveHexes,
}) => {
  const teams = teamsForLimit(teamLimit);

  function patchWave(waveId: string, patch: (wave: ReinforcementWave) => ReinforcementWave) {
    setReinforcements((prev) => ({
      ...prev,
      waves: prev.waves.map((w) => (w.id === waveId ? patch(w) : w)),
    }));
  }

  return (
    <>
      <div className={styles.filterGroup}>
        <div className={styles.filterGroupTitle}>Подкрепления</div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={reinforcements.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setReinforcements((prev) => ({ ...prev, enabled }));
              if (!enabled) onPickWaveHexes(null);
            }}
          />
          Включить подкрепления на карте
        </label>
        <p className={styles.botsHint}>
          Число совпадает со счётчиком «Ход» в бою (с нуля). 0 — сразу после расстановки. 2 — два раза «Следующий
          ход», на панели «Ход: 2». Клик по карте отмечает гекс появления — в бою отряды встанут именно туда, без
          ручной расстановки. Без гексов волна не выйдет. На гекс — не больше {REINFORCEMENT_UNITS_PER_HEX} отрядов.
          В грузовик можно посадить пехоту или артиллерию, в поезд (техника со свойством ЖД) — 2 пехоты и 2 любых.
        </p>
      </div>
      {reinforcements.enabled ? (
        <>
          <div className={styles.filterGroup}>
            <div className={styles.filterGroupTitle}>Волны</div>
            <div
              className={styles.filterItem}
              onClick={() => {
                if (reinforcements.waves.length >= MAX_REINFORCEMENT_WAVES) return;
                const last = reinforcements.waves[reinforcements.waves.length - 1];
                const wave = createReinforcementWave(last?.team ?? 1, last ? last.arriveTurn + 1 : 0);
                setReinforcements((prev) => ({ ...prev, waves: [...prev.waves, wave] }));
                onPickWaveHexes(wave.id);
              }}
            >
              Добавить волну
            </div>
          </div>
          {reinforcements.waves.map((wave, index) => {
            const unitsForTeam = catalogUnits.filter((u) =>
              factionForTeam(wave.team) === 'ussr'
                ? String(u.faction).toLowerCase() === 'ussr'
                : isWehrmachtFaction(u.faction),
            );
            const picking = pickingWaveId === wave.id;
            const unitCap = reinforcementWaveUnitCap(wave);
            const atUnitCap = wave.unitIds.length >= unitCap;
            return (
              <div key={wave.id} className={`${styles.filterGroup} ${styles.reinforceWave}`}>
                <div className={styles.reinforceWaveHead}>
                  <div className={styles.botsSlotTitle}>
                    Волна {index + 1} · {teamFactionLabel(wave.team)}
                  </div>
                  <div
                    className={styles.filterItem}
                    onClick={() => {
                      if (picking) onPickWaveHexes(null);
                      setReinforcements((prev) => ({
                        ...prev,
                        waves: prev.waves.filter((w) => w.id !== wave.id),
                      }));
                    }}
                  >
                    Удалить
                  </div>
                </div>
                <div className={styles.filterGroupTitle}>Команда</div>
                <div className={styles.filterRow}>
                  {teams.map((team) => (
                    <div
                      key={team}
                      className={`${styles.filterItem} ${wave.team === team ? styles.active : ''}`}
                      onClick={() =>
                        patchWave(wave.id, (w) => ({
                          ...w,
                          team,
                          unitIds: factionForTeam(w.team) === factionForTeam(team) ? w.unitIds : [],
                          unitCargo: factionForTeam(w.team) === factionForTeam(team) ? w.unitCargo : [],
                        }))
                      }
                    >
                      {team} {teamSideLabel(team)}
                    </div>
                  ))}
                </div>
                <label className={styles.fieldLabel} htmlFor={`rf-turn-${wave.id}`}>
                  Ход появления
                </label>
                <input
                  id={`rf-turn-${wave.id}`}
                  type="number"
                  min={0}
                  max={99}
                  className={`${styles.panelInput} ${styles.fullWidth}`}
                  value={wave.arriveTurn}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    patchWave(wave.id, (w) => ({
                      ...w,
                      arriveTurn: Number.isFinite(n) && n >= 0 ? Math.min(99, n) : 0,
                    }));
                  }}
                />
                <div className={styles.filterRow}>
                  <div
                    className={`${styles.filterItem} ${picking ? styles.active : ''}`}
                    onClick={() => onPickWaveHexes(picking ? null : wave.id)}
                  >
                    {picking ? 'Клик по карте — гекс' : 'Гекс появления'}
                  </div>
                  {wave.cellIds.length ? (
                    <div
                      className={styles.filterItem}
                      onClick={() => patchWave(wave.id, (w) => ({ ...w, cellIds: [] }))}
                    >
                      Очистить гексы
                    </div>
                  ) : null}
                </div>
                <p className={styles.botsHint}>
                  {wave.cellIds.length
                    ? `Гексы: ${wave.cellIds.join(', ')} · максимум ${unitCap} отр. (${REINFORCEMENT_UNITS_PER_HEX} на гекс)`
                    : 'Отметьте гексы на карте — без них подкрепление в бою не появится.'}
                </p>
                <div className={styles.filterGroupTitle}>
                  Состав ({wave.unitIds.length}/{unitCap})
                </div>
                <div className={styles.reinforceUnitList}>
                  {unitsForTeam.map((unit) => {
                    const count = poolCopyCount(wave.unitIds, unit.id);
                    const src = resolveEditorImageUrl(unit.imagePath) ?? unit.imagePath;
                    const kind = catalogTransportKind(unit);
                    const slots = slotIndicesForUnitId(wave.unitIds, unit.id);
                    const cargoSlots = padCargoSlots(wave.unitCargo, wave.unitIds.length);
                    return (
                      <div key={unit.id} className={styles.reinforceUnitBlock}>
                        <div className={styles.reinforceUnitRow}>
                          <div className={styles.reinforceUnitThumb}>
                            {src ? <img src={src} alt="" /> : null}
                          </div>
                          <div className={styles.reinforceUnitName}>{unit.name}</div>
                          <div className={styles.deployQtyRow}>
                            <button
                              type="button"
                              className={styles.deployQtyBtn}
                              disabled={count <= 0}
                              onClick={() =>
                                setReinforcements((prev) => removeReinforcementUnit(prev, wave.id, unit.id))
                              }
                              aria-label="Убрать"
                            >
                              −
                            </button>
                            <span className={styles.deployQtyValue}>{count}</span>
                            <button
                              type="button"
                              className={styles.deployQtyBtn}
                              disabled={atUnitCap}
                              onClick={() =>
                                setReinforcements((prev) => addReinforcementUnit(prev, wave.id, unit.id))
                              }
                              aria-label="Добавить"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {kind && slots.length
                          ? slots.map((slotIndex, copyIdx) => (
                              <TransportCargoEditor
                                key={`${wave.id}-${unit.id}-${slotIndex}`}
                                kind={kind}
                                cargoIds={cargoSlots[slotIndex] ?? []}
                                catalogUnits={unitsForTeam}
                                faction={unit.faction}
                                hostUnit={unit}
                                title={
                                  slots.length > 1
                                    ? `${kind === 'train' ? 'Поезд' : 'Грузовик'} ${copyIdx + 1}`
                                    : undefined
                                }
                                onChange={(ids) =>
                                  setReinforcements((prev) =>
                                    setReinforcementUnitCargo(prev, wave.id, slotIndex, ids),
                                  )
                                }
                              />
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </>
  );
};

const ScenarioImageRow: React.FC<{
  label: string;
  value: string;
  onUpload: (file: File | null) => void;
  onClear: () => void;
}> = ({ label, value, onUpload, onClear }) => {
  const resolved = resolveEditorImageUrl(value);
  return (
    <div className={unitStyles.editorImageRow}>
      <span className={`${styles.fieldLabel} ${unitStyles.editorImageRowLabel}`}>{label}</span>
      <div className={`${unitStyles.thumb64} ${unitStyles.editorImageRowThumb}`}>
        {resolved ? <img src={resolved} alt="" className={unitStyles.editorThumbImg} /> : null}
      </div>
      <div className={`${unitStyles.imageActions} ${unitStyles.editorImageRowActions}`}>
        {value ? (
          <button type="button" className={unitStyles.imageRemoveBtn} onClick={onClear}>
            Удалить
          </button>
        ) : (
          <label className={unitStyles.fileUploadLabel}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              className={unitStyles.fileUploadInput}
              onChange={(e) => {
                onUpload(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            Загрузить
          </label>
        )}
      </div>
    </div>
  );
};

export const ScenarioPanel: React.FC<{
  missionBrief: string;
  setMissionBrief: (v: string) => void;
  historyText: string;
  setHistoryText: (v: string) => void;
  teamLimit: 2 | 4 | 6;
  setTeamLimit: (v: 2 | 4 | 6) => void;
  scenarioPhotos: readonly [string, string];
  onScenarioPhotoUpload: (slot: ScenarioPhotoSlot, file: File | null) => void;
  onScenarioPhotoClear: (slot: ScenarioPhotoSlot) => void;
}> = ({
  missionBrief,
  setMissionBrief,
  historyText,
  setHistoryText,
  teamLimit,
  setTeamLimit,
  scenarioPhotos,
  onScenarioPhotoUpload,
  onScenarioPhotoClear,
}) => (
  <>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Лимит команд</div>
      <select
        className={`${styles.panelInput} ${styles.fullWidth} ${styles.marginTopSm}`}
        value={teamLimit}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (n === 2 || n === 4 || n === 6) setTeamLimit(n);
        }}
      >
        <option value={2}>2</option>
        <option value={4}>4</option>
        <option value={6}>6</option>
      </select>
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Название миссии</div>
      <input type="text" value={missionBrief} onChange={(e) => setMissionBrief(e.target.value)} placeholder="Например: Битва за Прохоровку" className={`${styles.panelInput} ${styles.fullWidth} ${styles.marginTopSm}`} />
    </div>
    <div className={styles.filterGroup}>
      <div className={styles.filterGroupTitle}>Историческая справка</div>
      <textarea value={historyText} onChange={(e) => setHistoryText(e.target.value)} placeholder="Опишите историческое событие..." rows={5} className={`${styles.panelTextarea} ${styles.panelTextareaFixed} ${styles.fullWidth} ${styles.marginTopSm}`} />
    </div>
    <div className={`${styles.filterGroup} ${styles.scenarioPhotosGroup}`}>
      <div className={styles.filterGroupTitle}>Фотографии</div>
      <div className={styles.scenarioPhotoRows}>
        <ScenarioImageRow label="Фото 1" value={scenarioPhotos[0]} onUpload={(f) => onScenarioPhotoUpload(0, f)} onClear={() => onScenarioPhotoClear(0)} />
        <ScenarioImageRow label="Фото 2" value={scenarioPhotos[1]} onUpload={(f) => onScenarioPhotoUpload(1, f)} onClear={() => onScenarioPhotoClear(1)} />
      </div>
    </div>
  </>
);

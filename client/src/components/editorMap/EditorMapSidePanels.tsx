import React from 'react';
import styles from '../../pages/styleModules/editorMap.module.css';
import unitStyles from '../../pages/styleModules/editorUnit.module.css';
import { resolveEditorImageUrl } from '../../api/editorCatalog';

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

export type MapWeatherSpec = {
  enabled: boolean;
  chance: string;
  duration: string;
};

export type MapEnvironmentFlags = {
  night: boolean;
  nightFromFirst: boolean;
  fog: MapWeatherSpec;
  rain: MapWeatherSpec;
  strongWind: MapWeatherSpec;
};

const DEFAULT_WEATHER_SPEC: MapWeatherSpec = { enabled: false, chance: '30', duration: '3' };

export const DEFAULT_MAP_ENVIRONMENT: MapEnvironmentFlags = {
  night: false,
  nightFromFirst: true,
  fog: { ...DEFAULT_WEATHER_SPEC },
  rain: { ...DEFAULT_WEATHER_SPEC },
  strongWind: { ...DEFAULT_WEATHER_SPEC },
};

function weatherSpecFromRaw(raw: unknown): MapWeatherSpec {
  if (raw === true) return { enabled: true, chance: '30', duration: '3' }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEATHER_SPEC }
  const o = raw as Record<string, unknown>
  const chanceN = Number(o.chance)
  const durationN = Number(o.duration)
  return {
    enabled: o.enabled === true,
    chance: String(Number.isFinite(chanceN) ? Math.max(0, Math.min(100, Math.trunc(chanceN))) : 30),
    duration: String(Number.isFinite(durationN) && durationN > 0 ? Math.trunc(durationN) : 3),
  }
}

export function parseEnvironmentFromPayload(raw: unknown): MapEnvironmentFlags {
  const env = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    night: env.night === true,
    nightFromFirst: env.nightFromFirst !== false,
    fog: weatherSpecFromRaw(env.fog),
    rain: weatherSpecFromRaw(env.rain),
    strongWind: weatherSpecFromRaw(env.strongWind),
  }
}

function weatherSpecToPayload(spec: MapWeatherSpec) {
  const chance = Number(spec.chance)
  const duration = Number(spec.duration)
  return {
    enabled: spec.enabled,
    chance: Number.isFinite(chance) ? Math.max(0, Math.min(100, Math.trunc(chance))) : 30,
    duration: Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 3,
  }
}

export function environmentToPayload(env: MapEnvironmentFlags) {
  return {
    night: env.night,
    nightFromFirst: env.nightFromFirst,
    fog: weatherSpecToPayload(env.fog),
    rain: weatherSpecToPayload(env.rain),
    strongWind: weatherSpecToPayload(env.strongWind),
  }
}

const WEATHER_ROWS: { key: 'fog' | 'rain' | 'strongWind'; label: string }[] = [
  { key: 'fog', label: 'Туман' },
  { key: 'rain', label: 'Дождь' },
  { key: 'strongWind', label: 'Сильный ветер' },
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

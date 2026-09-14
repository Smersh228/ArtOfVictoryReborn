import React, { useMemo, useState } from 'react';
import Button from '../Button';
import { resolveEditorImageUrl } from '../../api/editorCatalog';
import { EDITOR_MAP_FORTIFICATIONS } from '../../game/editorMapFortifications';
import styles from '../../pages/styleModules/battle.module.css';

export type BattleDeployPick =
  | { kind: 'unit'; catalogUnitId: number }
  | { kind: 'structure'; structureId: string };

type CatalogUnit = {
  id: number;
  name: string;
  imagePath: string;
};

type CatalogBuilding = {
  dbId: number;
  name: string;
  imagePath: string;
};

type PoolTab = 'units' | 'structures';

export type BattleDeployMemberReady = {
  key: string;
  ready: boolean;
  isYou: boolean;
  label: string;
};

interface BattleDeployPanelProps {
  youReady: boolean;
  readonlyBattle: boolean;
  remaining: { unitIds: number[]; structureIds: string[] };
  membersReady: BattleDeployMemberReady[];
  selected: BattleDeployPick | null;
  onSelect: (pick: BattleDeployPick | null) => void;
  onReady: (ready: boolean) => void;
  busy: boolean;
  error: string | null;
  catalogUnits: CatalogUnit[];
  catalogBuildings: CatalogBuilding[];
  isReinforcement?: boolean;
  phoneModal?: boolean;
  phoneModalOpen?: boolean;
  onPhoneModalOpen?: () => void;
  onPhoneModalClose?: () => void;
}

function groupCounts<T extends number | string>(ids: T[]): { id: T; count: number }[] {
  const map = new Map<T, number>();
  const order: T[] = [];
  for (const id of ids) {
    const prev = map.get(id) ?? 0;
    if (prev === 0) order.push(id);
    map.set(id, prev + 1);
  }
  return order.map((id) => ({ id, count: map.get(id) ?? 0 }));
}

function structureMeta(
  structureId: string,
  catalogBuildings: CatalogBuilding[],
): { name: string; imagePath: string } {
  const fort = EDITOR_MAP_FORTIFICATIONS.find((f) => f.id === structureId);
  if (fort) return { name: fort.name, imagePath: fort.imagePath };
  if (structureId.startsWith('b:')) {
    const dbId = Number(structureId.slice(2));
    const b = catalogBuildings.find((x) => x.dbId === dbId);
    if (b) return { name: b.name, imagePath: b.imagePath };
  }
  return { name: structureId, imagePath: '' };
}

const BattleDeployPanel: React.FC<BattleDeployPanelProps> = ({
  youReady,
  readonlyBattle,
  remaining,
  membersReady,
  selected,
  onSelect,
  onReady,
  busy,
  error,
  catalogUnits,
  catalogBuildings,
  isReinforcement = false,
  phoneModal = false,
  phoneModalOpen = true,
  onPhoneModalOpen,
  onPhoneModalClose,
}) => {
  const [poolTab, setPoolTab] = useState<PoolTab>('units');
  const unitGroups = useMemo(() => groupCounts(remaining.unitIds), [remaining.unitIds]);
  const structureGroups = useMemo(() => groupCounts(remaining.structureIds), [remaining.structureIds]);
  const readyCount = membersReady.filter((m) => m.ready).length;
  const activeTab = isReinforcement ? 'units' : poolTab;

  const panel = (
    <aside
      className={`${styles.leftMenuPanel} ${styles.leftMenuPanelStandard} ${styles.battleDeployPanel}${phoneModal ? ` ${styles.battleDeployPanelPhone}` : ''}`}
      aria-label="Расстановка"
      aria-modal={phoneModal ? true : undefined}
      role={phoneModal ? 'dialog' : undefined}
    >
      <header className={styles.leftMenuHeader}>
        <div className={styles.leftMenuTitles}>
          <h2 className={styles.leftMenuTitle}>{isReinforcement ? 'Подкрепление' : 'Расстановка'}</h2>
          <p className={styles.leftMenuSubtitle}>
            {readonlyBattle
              ? isReinforcement
                ? 'Игрок расставляет прибывшие подкрепления'
                : 'Игроки расставляют войска по зонам'
              : youReady
                ? 'Ожидание остальных. Можно снять готовность и поменять расстановку'
                : isReinforcement
                  ? 'Выберите карточку и кликните гекс зоны прибытия. Свой юнит — клик, чтобы вернуть'
                  : 'Выберите карточку и кликните гекс своей зоны. Свой юнит или сооружение — клик, чтобы вернуть'}
          </p>
        </div>
        {phoneModal ? (
          <button
            type="button"
            className={styles.battleDeployModalMapBtn}
            onClick={onPhoneModalClose}
          >
            К карте
          </button>
        ) : null}
      </header>
      <div className={styles.leftMenuBody}>
        {!readonlyBattle ? (
          <>
            <div className={styles.battleDeployTabs}>
              <button
                type="button"
                className={`${styles.battleDeployTab} ${activeTab === 'units' ? styles.battleDeployTabActive : ''}`}
                onClick={() => setPoolTab('units')}
              >
                Юниты ({remaining.unitIds.length})
              </button>
              {!isReinforcement ? (
                <button
                  type="button"
                  className={`${styles.battleDeployTab} ${poolTab === 'structures' ? styles.battleDeployTabActive : ''}`}
                  onClick={() => setPoolTab('structures')}
                >
                  Сооружения ({remaining.structureIds.length})
                </button>
              ) : null}
            </div>
            {selected ? (
              <p className={styles.battleDeployPicked}>
                Выбрано — нажмите гекс своей зоны, чтобы поставить
              </p>
            ) : null}
            <div className={styles.battleDeployGrid}>
              {activeTab === 'units' &&
                (unitGroups.length ? (
                  unitGroups.map((row) => {
                    const unit = catalogUnits.find((u) => u.id === row.id);
                    const name = unit?.name || `Юнит #${row.id}`;
                    const src = unit ? resolveEditorImageUrl(unit.imagePath) ?? unit.imagePath : '';
                    const active =
                      selected?.kind === 'unit' && selected.catalogUnitId === row.id;
                    return (
                      <button
                        key={`u-${row.id}`}
                        type="button"
                        className={`${styles.battleDeployCard} ${active ? styles.battleDeployCardActive : ''}`}
                        disabled={youReady || busy}
                        onClick={() =>
                          onSelect(active ? null : { kind: 'unit', catalogUnitId: row.id })
                        }
                      >
                        {src ? <img src={src} alt="" width={44} height={44} /> : null}
                        <span className={styles.battleDeployCardName}>{name}</span>
                        <span className={styles.battleDeployCardCount}>×{row.count}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.leftMenuText}>Юнитов в пуле не осталось.</p>
                ))}
              {activeTab === 'structures' &&
                (structureGroups.length ? (
                  structureGroups.map((row) => {
                    const meta = structureMeta(row.id, catalogBuildings);
                    const src =
                      resolveEditorImageUrl(meta.imagePath) ?? meta.imagePath;
                    const active =
                      selected?.kind === 'structure' && selected.structureId === row.id;
                    return (
                      <button
                        key={`s-${row.id}`}
                        type="button"
                        className={`${styles.battleDeployCard} ${active ? styles.battleDeployCardActive : ''}`}
                        disabled={youReady || busy}
                        onClick={() =>
                          onSelect(active ? null : { kind: 'structure', structureId: row.id })
                        }
                      >
                        {src ? <img src={src} alt="" width={44} height={44} /> : null}
                        <span className={styles.battleDeployCardName}>{meta.name}</span>
                        <span className={styles.battleDeployCardCount}>×{row.count}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.leftMenuText}>Сооружений в пуле не осталось.</p>
                ))}
            </div>
          </>
        ) : null}
        <p className={styles.battleDeployHint}>
          Ставить всё не обязательно. Бой начнётся, когда все нажмут «Готов»
          {membersReady.length ? ` (${readyCount}/${membersReady.length})` : ''}.
        </p>
        <ul className={styles.battleDeployMembers}>
          {membersReady.map((m) => (
            <li key={m.key} className={m.ready ? styles.battleDeployMemberReady : undefined}>
              {m.label}
              {m.isYou ? ' (вы)' : ''}: {m.ready ? 'готов' : 'расставляет'}
            </li>
          ))}
        </ul>
        {error ? <p className={styles.battleDeployError}>{error}</p> : null}
      </div>
      {!readonlyBattle ? (
        <footer className={styles.leftMenuFooter}>
          <Button
            name={youReady ? 'Снять готовность' : 'Готов'}
            className={styles.battleDeployReadyBtn}
            disabled={busy}
            onClick={() => onReady(!youReady)}
          />
        </footer>
      ) : null}
    </aside>
  );

  if (!phoneModal) return panel;

  if (!phoneModalOpen) {
    return (
      <div className={styles.battleDeployPhoneDock} role="region" aria-label="Расстановка">
        {selected ? (
          <>
            <p className={styles.battleDeployPhoneDockText}>Нажмите гекс своей зоны</p>
            <button
              type="button"
              className={styles.battleDeployPhoneDockBtn}
              onClick={() => {
                onSelect(null);
                onPhoneModalOpen?.();
              }}
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.battleDeployPhoneDockBtn}
              onClick={onPhoneModalOpen}
            >
              {isReinforcement ? 'Пул подкреплений' : 'Пул войск'}
            </button>
            {!readonlyBattle ? (
              <Button
                name={youReady ? 'Снять готовность' : 'Готов'}
                className={styles.battleDeployPhoneDockReady}
                disabled={busy}
                onClick={() => onReady(!youReady)}
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={`${styles.leftMenuBackdrop} ${styles.leftMenuBackdropDim}`}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onPhoneModalClose?.();
        }}
      />
      {panel}
    </>
  );
};

export default BattleDeployPanel;

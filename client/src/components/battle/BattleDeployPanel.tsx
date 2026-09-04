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
}) => {
  const [poolTab, setPoolTab] = useState<PoolTab>('units');
  const unitGroups = useMemo(() => groupCounts(remaining.unitIds), [remaining.unitIds]);
  const structureGroups = useMemo(() => groupCounts(remaining.structureIds), [remaining.structureIds]);
  const readyCount = membersReady.filter((m) => m.ready).length;

  return (
    <aside
      className={`${styles.leftMenuPanel} ${styles.leftMenuPanelStandard} ${styles.battleDeployPanel}`}
      aria-label="Расстановка"
    >
      <header className={styles.leftMenuHeader}>
        <div className={styles.leftMenuTitles}>
          <h2 className={styles.leftMenuTitle}>Расстановка</h2>
          <p className={styles.leftMenuSubtitle}>
            {readonlyBattle
              ? 'Игроки расставляют войска по зонам'
              : youReady
                ? 'Ожидание остальных. Можно снять готовность и поменять расстановку'
                : 'Выберите карточку и кликните гекс своей зоны. Свой юнит или сооружение — клик, чтобы вернуть'}
          </p>
        </div>
      </header>
      <div className={styles.leftMenuBody}>
        {!readonlyBattle ? (
          <>
            <div className={styles.battleDeployTabs}>
              <button
                type="button"
                className={`${styles.battleDeployTab} ${poolTab === 'units' ? styles.battleDeployTabActive : ''}`}
                onClick={() => setPoolTab('units')}
              >
                Юниты ({remaining.unitIds.length})
              </button>
              <button
                type="button"
                className={`${styles.battleDeployTab} ${poolTab === 'structures' ? styles.battleDeployTabActive : ''}`}
                onClick={() => setPoolTab('structures')}
              >
                Сооружения ({remaining.structureIds.length})
              </button>
            </div>
            <div className={styles.battleDeployGrid}>
              {poolTab === 'units' &&
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
              {poolTab === 'structures' &&
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
};

export default BattleDeployPanel;

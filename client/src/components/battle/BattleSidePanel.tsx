import React, { useMemo, useState } from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';
import { teamSideLabel } from '../../game/editorMapTeam';
import type { BattleReportRow } from '../../pages/hooks/useBattleReportRows';

type ReportGroup = 'general' | 'ally' | 'enemy';

type BattleLeftPanelId = 'report' | 'tasks';
type BattleFaction = 'rkka' | 'wehrmacht' | 'none';

interface BattleSidePanelProps {
  leftMenu: BattleLeftPanelId | null;
  sideTitle: string;
  sideSubtitle: string;
  standardPanelStyle?: React.CSSProperties;
  apiRoomId: number | null;
  battleStartedAt: unknown;
  battleReportRows: {
    rows: BattleReportRow[];
  };
  destroyedSummary: {
    rkka: string[];
    wehrmacht: string[];
  };
  onHoverReportRow: (replay: any | null) => void;
  onCloseLeftMenu: () => void;
  myBattleFaction: BattleFaction;
  allyTasksBattle: string;
  axisTasksBattle: string;
  environmentLabels?: string[];
}

const BattleSidePanel: React.FC<BattleSidePanelProps> = ({
  leftMenu,
  sideTitle,
  sideSubtitle,
  standardPanelStyle,
  apiRoomId,
  battleStartedAt,
  battleReportRows,
  destroyedSummary,
  onHoverReportRow,
  onCloseLeftMenu,
  myBattleFaction,
  allyTasksBattle,
  axisTasksBattle,
  environmentLabels = [],
}) => {
  const [reportGroup, setReportGroup] = useState<ReportGroup>('general');
  const [reportTeam, setReportTeam] = useState<number | 'all'>('all');
  const spectator = myBattleFaction === 'none';
  const allyFaction = myBattleFaction === 'wehrmacht' ? 'wehrmacht' : 'rkka';
  const enemyFaction = allyFaction === 'rkka' ? 'wehrmacht' : 'rkka';
  const allyTitle = spectator ? 'РККА' : 'Союзники';
  const enemyTitle = spectator ? 'Вермахт' : 'Противник';

  const groupRows = useMemo(() => {
    const rows = battleReportRows.rows;
    if (reportGroup === 'general') {
      return rows.filter((row) => row.bucket === 'general' || row.isMeta || row.isTurnHeader);
    }
    const fac = reportGroup === 'ally' ? allyFaction : enemyFaction;
    return rows.filter((row) => row.bucket === 'team' && row.actorFaction === fac);
  }, [battleReportRows.rows, reportGroup, allyFaction, enemyFaction]);

  const teamOptions = useMemo(() => {
    const set = new Set<number>();
    for (const row of groupRows) {
      if (row.actorTeam != null && row.actorTeam > 0) set.add(row.actorTeam);
    }
    return [...set].sort((a, b) => a - b);
  }, [groupRows]);

  const visibleRows = useMemo(() => {
    if (reportGroup === 'general' || reportTeam === 'all') return groupRows;
    return groupRows.filter((row) => row.actorTeam === reportTeam);
  }, [groupRows, reportGroup, reportTeam]);

  if (!leftMenu) return null;
  return (
    <aside
      className={`${styles.leftMenuPanel} ${styles.leftMenuPanelStandard}`}
      style={standardPanelStyle}
      aria-label={sideTitle}
    >
      <header className={styles.leftMenuHeader}>
        <div className={styles.leftMenuTitles}>
          <h2 className={styles.leftMenuTitle}>{sideTitle}</h2>
          {sideSubtitle ? <p className={styles.leftMenuSubtitle}>{sideSubtitle}</p> : null}
        </div>
      </header>
      <div className={styles.leftMenuBody}>
        {leftMenu === 'report' && (
          <div className={styles.battleReportWrap}>
            {apiRoomId == null || !Number.isFinite(apiRoomId) || battleStartedAt == null ? (
              <p className={styles.leftMenuText}>Журнал хода доступен в бою по сети: откройте комнату и начните сражение.</p>
            ) : !battleReportRows.rows.length && !environmentLabels.length ? (
              <p className={styles.leftMenuText}>
                Записей ещё нет. Когда оба игрока подтвердят ход, здесь появится сводка последнего хода.
              </p>
            ) : (
              <>
              <div className={styles.battleReportFilters} role="tablist" aria-label="Фильтр отчёта">
                <button
                  type="button"
                  className={`${styles.battleReportFilter} ${reportGroup === 'general' ? styles.battleReportFilterActive : ''}`}
                  onClick={() => {
                    setReportGroup('general');
                    setReportTeam('all');
                  }}
                >
                  Общие
                </button>
                <button
                  type="button"
                  className={`${styles.battleReportFilter} ${reportGroup === 'ally' ? styles.battleReportFilterActive : ''}`}
                  onClick={() => {
                    setReportGroup('ally');
                    setReportTeam('all');
                  }}
                >
                  {allyTitle}
                </button>
                <button
                  type="button"
                  className={`${styles.battleReportFilter} ${reportGroup === 'enemy' ? styles.battleReportFilterActive : ''}`}
                  onClick={() => {
                    setReportGroup('enemy');
                    setReportTeam('all');
                  }}
                >
                  {enemyTitle}
                </button>
              </div>
              {reportGroup !== 'general' && teamOptions.length > 0 ? (
                <div className={styles.battleReportTeamFilters} aria-label="Команды">
                  <button
                    type="button"
                    className={`${styles.battleReportFilter} ${reportTeam === 'all' ? styles.battleReportFilterActive : ''}`}
                    onClick={() => setReportTeam('all')}
                  >
                    Все
                  </button>
                  {teamOptions.map((team) => (
                    <button
                      key={team}
                      type="button"
                      className={`${styles.battleReportFilter} ${reportTeam === team ? styles.battleReportFilterActive : ''}`}
                      onClick={() => setReportTeam(team)}
                    >
                      {team} {teamSideLabel(team)}
                    </button>
                  ))}
                </div>
              ) : null}
              <ul className={styles.battleReportList}>
                {environmentLabels.length ? (
                  <li className={`${styles.battleReportLine} ${styles.battleReportLineMeta} ${styles.battleReportLineTurn}`}>
                    <span className={styles.battleReportLineText}>
                      Сейчас: {environmentLabels.join(', ')}
                    </span>
                  </li>
                ) : null}
                <li className={`${styles.battleReportLine} ${styles.battleReportLineMeta} ${styles.battleReportLineTurn}`}>
                  <span className={styles.battleReportLineText}>
                    Уничтожены юниты РККА: {destroyedSummary.rkka.length ? destroyedSummary.rkka.join(', ') : '—'}
                  </span>
                </li>
                <li className={`${styles.battleReportLine} ${styles.battleReportLineMeta} ${styles.battleReportLineTurn}`}>
                  <span className={styles.battleReportLineText}>
                    Уничтожены юниты Вермахта: {destroyedSummary.wehrmacht.length ? destroyedSummary.wehrmacht.join(', ') : '—'}
                  </span>
                </li>
                {!visibleRows.length && (reportGroup !== 'general' || !environmentLabels.length) ? (
                  <li className={`${styles.battleReportLine} ${styles.battleReportLineMeta}`}>
                    <span className={styles.battleReportLineText}>Нет записей в этом фильтре</span>
                  </li>
                ) : null}
                {visibleRows.map((row) => (
                  <li
                    key={row.key}
                    className={`${styles.battleReportLine} ${row.isMeta ? styles.battleReportLineMeta : ''} ${row.isTurnHeader ? styles.battleReportLineTurn : ''} ${row.interactive ? styles.battleReportLineInteractive : ''}`}
                    onMouseEnter={() => {
                      if (row.replay) onHoverReportRow(row.replay);
                      else if (row.logEntry) onHoverReportRow(row.logEntry);
                    }}
                    onMouseLeave={() => onHoverReportRow(null)}
                  >
                    {row.formatted ? (
                      <div className={styles.battleReportLineCol}>
                        <span className={styles.battleReportOrderLabel}>{row.formatted.order}</span>
                        <span className={styles.battleReportUnitNames}>{row.formatted.detail}</span>
                        {'stats' in row.formatted && row.formatted.stats ? (
                          <span className={styles.battleReportStats}>{row.formatted.stats}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className={styles.battleReportLineText}>{row.line}</span>
                    )}
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        )}
        {leftMenu === 'tasks' && (
          <div className={styles.leftMenuText}>
            {myBattleFaction === 'rkka' && (
              <>
                <h3 className={styles.battleTasksFactionTitle}>Задачи РККА</h3>
                {allyTasksBattle ? (
                  <p className={styles.battleTasksBody}>{allyTasksBattle}</p>
                ) : (
                  <p className={styles.battleTasksEmpty}>
                    Для этой карты задачи СССР не заданы в редакторе (вкладка «Условия игры»).
                  </p>
                )}
              </>
            )}
            {myBattleFaction === 'wehrmacht' && (
              <>
                <h3 className={styles.battleTasksFactionTitle}>Задачи Вермахта</h3>
                {axisTasksBattle ? (
                  <p className={styles.battleTasksBody}>{axisTasksBattle}</p>
                ) : (
                  <p className={styles.battleTasksEmpty}>
                    Для этой карты задачи Германии не заданы в редакторе (вкладка «Условия игры»).
                  </p>
                )}
              </>
            )}
            {myBattleFaction === 'none' && (
              <>
                <h3 className={styles.battleTasksFactionTitle}>Задачи РККА</h3>
                {allyTasksBattle ? (
                  <p className={styles.battleTasksBody}>{allyTasksBattle}</p>
                ) : (
                  <p className={styles.battleTasksEmpty}>Не заданы в редакторе.</p>
                )}
                <h3 className={`${styles.battleTasksFactionTitle} ${styles.battleTasksFactionTitleSecond}`}>
                  Задачи Вермахта
                </h3>
                {axisTasksBattle ? (
                  <p className={styles.battleTasksBody}>{axisTasksBattle}</p>
                ) : (
                  <p className={styles.battleTasksEmpty}>Не заданы в редакторе.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <footer className={styles.leftMenuFooter}>
        <div className={styles.leftMenuActions}>
          <Button name="Закрыть" onClick={onCloseLeftMenu} />
        </div>
      </footer>
    </aside>
  );
};

export default BattleSidePanel;

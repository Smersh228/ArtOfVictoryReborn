import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

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
    rows: Array<{
      key: string;
      isMeta: boolean;
      isTurnHeader: boolean;
      interactive: boolean;
      replay?: any;
      formatted?: { order?: string; detail?: string; stats?: string } | null;
      line: string;
    }>;
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
}) => {
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
            ) : !battleReportRows.rows.length ? (
              <p className={styles.leftMenuText}>
                Записей ещё нет. Когда оба игрока подтвердят ход, здесь появится сводка последнего хода.
              </p>
            ) : (
              <ul className={styles.battleReportList}>
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
                {battleReportRows.rows.map((row) => (
                  <li
                    key={row.key}
                    className={`${styles.battleReportLine} ${row.isMeta ? styles.battleReportLineMeta : ''} ${row.isTurnHeader ? styles.battleReportLineTurn : ''} ${row.interactive ? styles.battleReportLineInteractive : ''}`}
                    onMouseEnter={() => {
                      if (row.replay) onHoverReportRow(row.replay);
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

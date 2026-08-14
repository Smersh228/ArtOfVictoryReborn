import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleToolbarProps {
  readonlyBattle: boolean;
  toolbarBusy: boolean;
  battleControlsDisabled: boolean;
  waitingNextTurn: boolean;
  turn: number;
  showAirSupportButton: boolean;
  airSupportDisabled?: boolean;
  onToggleAirSupport: () => void;
  onLeaveOrSurrender: () => void;
  onShowReport: () => void;
  onShowTasks: () => void;
  onNextTurn: () => void;
  reportBadgeCount?: number;
}

const BattleToolbar: React.FC<BattleToolbarProps> = ({
  readonlyBattle,
  toolbarBusy,
  battleControlsDisabled,
  waitingNextTurn,
  turn,
  showAirSupportButton,
  airSupportDisabled = false,
  onToggleAirSupport,
  onLeaveOrSurrender,
  onShowReport,
  onShowTasks,
  onNextTurn,
  reportBadgeCount = 0,
}) => {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarActions}>
          <div className={styles.toolbarBtnSlot}>
            <Button
              name={readonlyBattle ? 'Выйти' : 'Сдаться'}
              disabled={toolbarBusy}
              onClick={onLeaveOrSurrender}
            />
          </div>
          <div className={styles.toolbarBtnSlot}>
            <Button
              name="Показать отчёт"
              disabled={toolbarBusy}
              badgeCount={reportBadgeCount}
              onClick={onShowReport}
            />
          </div>
          {!readonlyBattle ? (
            <div className={styles.toolbarBtnSlot}>
              <Button name="Посмотреть задания" disabled={toolbarBusy} onClick={onShowTasks} />
            </div>
          ) : null}
          {showAirSupportButton ? (
            <div className={styles.toolbarBtnSlot}>
              <Button
                name="Авиаподдержка"
                disabled={toolbarBusy || airSupportDisabled}
                title={
                  airSupportDisabled
                    ? 'На поле нет юнита со свойством «Вызов авиации»'
                    : 'Состав авиации с карты миссии (на поле не показывается)'
                }
                onClick={onToggleAirSupport}
              />
            </div>
          ) : null}
        </div>
        <div className={styles.toolbarTurnGroup}>
          <div className={styles.toolbarBtnSlot}>
            <Button
              name="Следующий ход"
              disabled={battleControlsDisabled}
              onClick={() => !waitingNextTurn && onNextTurn()}
            />
          </div>
          <span className={styles.battleTurnCounter}>Ход: {turn}</span>
        </div>
      </div>
    </div>
  );
};

export default BattleToolbar;

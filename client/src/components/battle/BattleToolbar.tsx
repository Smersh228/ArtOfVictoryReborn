import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleToolbarProps {
  readonlyBattle: boolean;
  toolbarBusy: boolean;
  battleControlsDisabled: boolean;
  waitingNextTurn: boolean;
  turn: number;
  onLeaveOrSurrender: () => void;
  onShowReport: () => void;
  onShowTasks: () => void;
  onNextTurn: () => void;
}

const BattleToolbar: React.FC<BattleToolbarProps> = ({
  readonlyBattle,
  toolbarBusy,
  battleControlsDisabled,
  waitingNextTurn,
  turn,
  onLeaveOrSurrender,
  onShowReport,
  onShowTasks,
  onNextTurn,
}) => {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <Button
          name={readonlyBattle ? 'Выйти' : 'Сдаться'}
          size={280}
          disabled={toolbarBusy}
          onClick={onLeaveOrSurrender}
        />
        <Button size={280} name="Показать отчёт" disabled={toolbarBusy} onClick={onShowReport} />
        {!readonlyBattle ? (
          <Button size={280} name="Посмотреть задания" disabled={toolbarBusy} onClick={onShowTasks} />
        ) : null}
        <div className={styles.toolbarTurnGroup}>
          <Button
            name="Следующий ход"
            size={280}
            disabled={battleControlsDisabled}
            onClick={() => !waitingNextTurn && onNextTurn()}
          />
          <span className={styles.battleTurnCounter}>Ход: {turn}</span>
        </div>
      </div>
    </div>
  );
};

export default BattleToolbar;

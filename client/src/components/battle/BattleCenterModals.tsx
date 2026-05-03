import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

type BattleCenterModalId = 'surrender' | 'nextTurn';
type BattleFaction = 'rkka' | 'wehrmacht' | 'none';

interface BattleCenterModalsProps {
  centerModal: BattleCenterModalId | null;
  readonlyBattle: boolean;
  pendingOrdersCount: number;
  scenarioBattleOutcome: {
    winnerFaction: 'rkka' | 'wehrmacht';
    reason: 'objective' | 'timeout';
  } | null;
  opponentVictory: boolean;
  myBattleFaction: BattleFaction;
  onCloseCenterModal: () => void;
  onConfirmSurrender: () => void;
  onConfirmNextTurn: () => void;
  onExitAfterScenario: () => void;
  onExitAfterVictory: () => void;
}

const BattleCenterModals: React.FC<BattleCenterModalsProps> = ({
  centerModal,
  readonlyBattle,
  pendingOrdersCount,
  scenarioBattleOutcome,
  opponentVictory,
  myBattleFaction,
  onCloseCenterModal,
  onConfirmSurrender,
  onConfirmNextTurn,
  onExitAfterScenario,
  onExitAfterVictory,
}) => {
  return (
    <>
      {centerModal === 'surrender' && (
        <aside className={`${styles.leftMenuPanel} ${styles.leftMenuPanelSurrenderModal}`} aria-label="Сдаться">
          <header className={styles.leftMenuHeader}>
            <div className={styles.leftMenuTitles}>
              <h2 className={styles.leftMenuTitle}>Сдаться</h2>
              <p className={styles.leftMenuSubtitle}>Подтвердите выход из боя</p>
            </div>
          </header>
          <div className={styles.leftMenuBody}>
            <p className={styles.leftMenuText}>
              Вы уверены, что хотите сдаться? Текущий бой будет завершён, прогресс на карте не сохранится.
            </p>
          </div>
          <footer className={styles.leftMenuFooter}>
            <div className={styles.leftMenuActions}>
              <Button name="Отмена" onClick={onCloseCenterModal} />
              <Button
                name="Подтвердить"
                onClick={() => {
                  if (readonlyBattle) return;
                  onConfirmSurrender();
                }}
              />
            </div>
          </footer>
        </aside>
      )}
      {centerModal === 'nextTurn' && (
        <aside className={`${styles.leftMenuPanel} ${styles.leftMenuPanelSurrenderModal}`} aria-label="Следующий ход">
          <header className={styles.leftMenuHeader}>
            <div className={styles.leftMenuTitles}>
              <h2 className={styles.leftMenuTitle}>Следующий ход</h2>
              <p className={styles.leftMenuSubtitle}>Подтвердите завершение текущего хода</p>
            </div>
          </header>
          <div className={styles.leftMenuBody}>
            <p className={styles.leftMenuText}>
              После подтверждения кнопка станет неактивной до совместного перехода. Счётчик хода обновится, когда оба
              игрока подтвердят завершение текущего хода.
            </p>
            {pendingOrdersCount > 0 ? null : null}
          </div>
          <footer className={styles.leftMenuFooter}>
            <div className={styles.leftMenuActions}>
              <Button name="Отмена" onClick={onCloseCenterModal} />
              <Button
                name="Подтвердить"
                onClick={() => {
                  if (readonlyBattle) return;
                  onConfirmNextTurn();
                }}
              />
            </div>
          </footer>
        </aside>
      )}
      {scenarioBattleOutcome && (
        <aside className={`${styles.leftMenuPanel} ${styles.leftMenuPanelSurrenderModal}`} aria-label="Итог миссии">
          <header className={styles.leftMenuHeader}>
            <div className={styles.leftMenuTitles}>
              <h2 className={styles.leftMenuTitle}>
                {myBattleFaction === 'none'
                  ? 'Итог миссии'
                  : myBattleFaction === scenarioBattleOutcome.winnerFaction
                    ? 'Победа'
                    : 'Поражение'}
              </h2>
              <p className={styles.leftMenuSubtitle}>
                {scenarioBattleOutcome.reason === 'objective'
                  ? `Цель выполнена — победа: ${scenarioBattleOutcome.winnerFaction === 'rkka' ? 'РККА' : 'Вермахт'}`
                  : `Лимит ходов исчерпан — победа: ${scenarioBattleOutcome.winnerFaction === 'rkka' ? 'РККА' : 'Вермахт'}`}
              </p>
            </div>
          </header>
          <div className={styles.leftMenuBody}>
            <p className={styles.leftMenuText}>Сценарий карты завершён. Нажмите кнопку ниже, чтобы выйти в главное меню.</p>
          </div>
          <footer className={styles.leftMenuFooter}>
            <div className={styles.leftMenuActions}>
              <Button name="В главное меню" onClick={() => void onExitAfterScenario()} />
            </div>
          </footer>
        </aside>
      )}
      {opponentVictory && !scenarioBattleOutcome && (
        <aside className={`${styles.leftMenuPanel} ${styles.leftMenuPanelSurrenderModal}`} aria-label="Победа">
          <header className={styles.leftMenuHeader}>
            <div className={styles.leftMenuTitles}>
              <h2 className={styles.leftMenuTitle}>Победа</h2>
              <p className={styles.leftMenuSubtitle}>Противник сдался</p>
            </div>
          </header>
          <div className={styles.leftMenuBody}>
            <p className={styles.leftMenuText}>Соперник завершил бой по сдаче. Вы одержали победу в этом сражении.</p>
          </div>
          <footer className={styles.leftMenuFooter}>
            <div className={styles.leftMenuActions}>
              <Button name="В главное меню" onClick={() => void onExitAfterVictory()} />
            </div>
          </footer>
        </aside>
      )}
    </>
  );
};

export default BattleCenterModals;

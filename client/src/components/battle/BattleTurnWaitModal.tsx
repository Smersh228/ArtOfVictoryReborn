import React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button';
import BattleHourglass from './BattleHourglass';
import styles from '../../pages/styleModules/battle.module.css';

export type BattleTurnWaitMember = {
  key: string;
  label: string;
  isYou?: boolean;
  isBot?: boolean;
  ready?: boolean;
};

interface BattleTurnWaitModalProps {
  open: boolean;
  members: BattleTurnWaitMember[];
  canCancel?: boolean;
  cancelDisabled?: boolean;
  onCancel?: () => void;
}

const BattleTurnWaitModal: React.FC<BattleTurnWaitModalProps> = ({
  open,
  members,
  canCancel = false,
  cancelDisabled = false,
  onCancel,
}) => {
  if (!open) return null;

  return createPortal(
    <>
      <div
        className={`${styles.leftMenuBackdrop} ${styles.leftMenuBackdropDim} ${styles.battleTurnWaitBackdrop}`}
        role="presentation"
      />
      <aside
        className={`${styles.leftMenuPanel} ${styles.leftMenuPanelSurrenderModal} ${styles.battleTurnWaitModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-turn-wait-title"
      >
        <header className={styles.leftMenuHeader}>
          <BattleHourglass size={52} />
          <div className={styles.leftMenuTitles}>
            <h2 id="battle-turn-wait-title" className={styles.leftMenuTitle}>
              Ожидание хода
            </h2>
            <p className={styles.leftMenuSubtitle}>Ход начнётся, когда все игроки подтвердят</p>
          </div>
        </header>
        <div className={`${styles.leftMenuBody} ${styles.battleTurnWaitBody}`}>
          {members.length ? (
            <ul className={styles.battleTurnWaitList}>
              {members.map((m) => (
                <li
                  key={m.key}
                  className={m.ready ? styles.battleTurnWaitReady : styles.battleTurnWaitPending}
                >
                  <span>
                    {m.label}
                    {m.isYou ? ' (вы)' : m.isBot ? ' (бот)' : ''}
                  </span>
                  <span>{m.ready ? 'ход закончен' : 'ходит'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.leftMenuText}>Ждём остальных игроков.</p>
          )}
        </div>
        {canCancel ? (
          <footer className={styles.leftMenuFooter}>
            <div className={styles.leftMenuActions}>
              <Button name="Отменить ход" disabled={cancelDisabled} onClick={onCancel} />
            </div>
          </footer>
        ) : null}
      </aside>
    </>,
    document.body,
  );
};

export default BattleTurnWaitModal;

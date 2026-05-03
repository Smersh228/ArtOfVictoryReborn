import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleResolvingOverlayProps {
  active: boolean;
}

const BattleResolvingOverlay: React.FC<BattleResolvingOverlayProps> = ({ active }) => {
  if (!active) return null;
  return (
    <div
      className={styles.battleMapResolvingOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-resolving-title"
      aria-live="polite"
    >
      <div className={styles.battleMapResolvingModal}>
        <p id="battle-resolving-title" className={styles.battleMapResolvingTitle}>
          Ведётся расчёт боя
        </p>
        <p className={styles.battleMapResolvingHint}>Подождите…</p>
      </div>
    </div>
  );
};

export default BattleResolvingOverlay;

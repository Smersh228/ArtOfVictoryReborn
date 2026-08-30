import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleResolvingOverlayProps {
  active: boolean;
  title?: string;
  hint?: string;
}

const BattleResolvingOverlay: React.FC<BattleResolvingOverlayProps> = ({
  active,
  title = 'Ведётся расчёт боя',
  hint = 'Подождите…',
}) => {
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
          {title}
        </p>
        <p className={styles.battleMapResolvingHint}>{hint}</p>
      </div>
    </div>
  );
};

export default BattleResolvingOverlay;

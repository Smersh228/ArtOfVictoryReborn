import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import BattleHourglass from './BattleHourglass';

interface BattleResolvingOverlayProps {
  active: boolean;
  title?: string;
  hint?: string;
}

const BattleResolvingOverlay: React.FC<BattleResolvingOverlayProps> = ({
  active,
  title = 'Идёт бой',
  hint,
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
        <BattleHourglass size={72} />
        <p id="battle-resolving-title" className={styles.battleMapResolvingTitle}>
          {title}
        </p>
        {hint ? <p className={styles.battleMapResolvingHint}>{hint}</p> : null}
      </div>
    </div>
  );
};

export default BattleResolvingOverlay;

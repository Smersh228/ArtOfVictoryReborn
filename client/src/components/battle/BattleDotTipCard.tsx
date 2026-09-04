import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import type { BattleHoverTipView } from './battleHoverTip';

interface BattleDotTipCardProps {
  battleTipRef: React.RefObject<HTMLDivElement | null>;
  left: number;
  top: number;
  tip: BattleHoverTipView;
}

const BattleDotTipCard: React.FC<BattleDotTipCardProps> = ({ battleTipRef, left, top, tip }) => {
  return (
    <div
      ref={battleTipRef}
      className={styles.battleUnitTip}
      style={{ left, top }}
      role="status"
    >
      <div className={styles.battleUnitTipTitle}>{tip.title}</div>
      {tip.rows.map((row) => (
        <div key={row.key} className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>{row.key}</span>
          <span className={styles.battleUnitTipVal}>{row.val}</span>
        </div>
      ))}
    </div>
  );
};

export default BattleDotTipCard;

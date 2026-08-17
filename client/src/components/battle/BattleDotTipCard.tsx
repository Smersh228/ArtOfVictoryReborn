import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import type { DotHoverTip } from '../../game/cellDot';

interface BattleDotTipCardProps {
  battleTipRef: React.RefObject<HTMLDivElement | null>;
  left: number;
  top: number;
  tip: DotHoverTip;
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
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>Защита</span>
        <span className={styles.battleUnitTipVal}>{tip.defense}</span>
      </div>
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>БК</span>
        <span className={styles.battleUnitTipVal}>{tip.ammo}</span>
      </div>
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>Статус</span>
        <span className={styles.battleUnitTipVal}>{tip.statusLabel}</span>
      </div>
      {tip.occupantLabel ? (
        <div className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>Гарнизон</span>
          <span className={styles.battleUnitTipVal}>{tip.occupantLabel}</span>
        </div>
      ) : null}
    </div>
  );
};

export default BattleDotTipCard;

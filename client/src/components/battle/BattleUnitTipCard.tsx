import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import { unitStatsRowsForTip } from '../../game/battleUnitStatsTip';

interface BattleUnitTipCardProps {
  battleTipRef: React.RefObject<HTMLDivElement | null>;
  left: number;
  top: number;
  unit: Record<string, unknown>;
  factionLabel: string;
  playerLabel: string;
  cargoLine: string | null;
}

const BattleUnitTipCard: React.FC<BattleUnitTipCardProps> = ({
  battleTipRef,
  left,
  top,
  unit,
  factionLabel,
  playerLabel,
  cargoLine,
}) => {
  return (
    <div
      ref={battleTipRef}
      className={styles.battleUnitTip}
      style={{ left, top }}
      role="status"
    >
      <div className={styles.battleUnitTipTitle}>{String(unit.name ?? 'Юнит')}</div>
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>Фракция</span>
        <span className={styles.battleUnitTipVal}>{factionLabel}</span>
      </div>
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>Игрок</span>
        <span className={styles.battleUnitTipVal}>{playerLabel}</span>
      </div>
      {String(unit.type || '').toLowerCase() === 'tech' && cargoLine != null ? (
        <div className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>В кузове</span>
          <span className={styles.battleUnitTipVal}>{cargoLine}</span>
        </div>
      ) : null}
      {unitStatsRowsForTip(unit).map((row) => (
        <div key={row.key} className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>{row.key}</span>
          <span className={styles.battleUnitTipVal}>{row.val}</span>
        </div>
      ))}
    </div>
  );
};

export default BattleUnitTipCard;

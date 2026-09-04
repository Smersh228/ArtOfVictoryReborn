import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import { unitStatsRowsForTip } from '../../game/battleUnitStatsTip';

interface BattleUnitTipCardProps {
  battleTipRef: React.RefObject<HTMLDivElement | null>;
  left: number;
  top: number;
  unit: Record<string, unknown>;
  unitCell?: import('../../../server/src/game/gameLogic/cells/cell').Cell | null;
  cells?: import('../../../server/src/game/gameLogic/cells/cell').Cell[] | null;
  pendingOrderKey?: string | null;
  factionLabel: string;
  teamLabel: string;
  playerLabel: string;
  cargoLine: string | null;
  desantLine?: string | null;
}

const BattleUnitTipCard: React.FC<BattleUnitTipCardProps> = ({
  battleTipRef,
  left,
  top,
  unit,
  unitCell = null,
  cells = null,
  pendingOrderKey = null,
  factionLabel,
  teamLabel,
  playerLabel,
  cargoLine,
  desantLine = null,
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
        <span className={styles.battleUnitTipKey}>Команда</span>
        <span className={styles.battleUnitTipVal}>{teamLabel}</span>
      </div>
      <div className={styles.battleUnitTipRow}>
        <span className={styles.battleUnitTipKey}>Игрок</span>
        <span className={styles.battleUnitTipVal}>{playerLabel}</span>
      </div>
      {cargoLine != null ? (
        <div className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>В кузове</span>
          <span className={styles.battleUnitTipVal}>{cargoLine}</span>
        </div>
      ) : null}
      {desantLine != null ? (
        <div className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>Десантники</span>
          <span className={styles.battleUnitTipVal}>{desantLine}</span>
        </div>
      ) : null}
      {unitStatsRowsForTip(unit, cells, unitCell, { pendingOrderKey }).map((row) => (
        <div key={row.key} className={styles.battleUnitTipRow}>
          <span className={styles.battleUnitTipKey}>{row.key}</span>
          <span className={styles.battleUnitTipVal}>{row.val}</span>
        </div>
      ))}
    </div>
  );
};

export default BattleUnitTipCard;

import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import type { DotHoverTip } from '../../game/cellDot';

export type BattleHoverTipView = {
  title: string;
  rows: { key: string; val: string }[];
};

export function hoverTipFromDot(tip: DotHoverTip): BattleHoverTipView {
  const rows = [
    { key: 'Защита', val: String(tip.defense) },
    { key: 'Боезапас', val: String(tip.ammo) },
    { key: 'Статус', val: tip.statusLabel },
  ];
  if (tip.occupantLabel) rows.push({ key: 'Гарнизон', val: tip.occupantLabel });
  return { title: tip.title, rows };
}

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

import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';
import type { BattleHqRevealedOrder } from '../../api/rooms';

interface BattleHqRewritePanelProps {
  rewriteMax: number;
  revealedOrders: BattleHqRevealedOrder[];
  hqRoll?: number;
  onKeepOrders: () => void;
}

const BattleHqRewritePanel: React.FC<BattleHqRewritePanelProps> = ({
  rewriteMax,
  revealedOrders,
  hqRoll,
  onKeepOrders,
}) => {
  return (
    <div className={styles.battleHqRewriteBanner} role="status">
      <p className={styles.battleHqRewriteTitle}>Радиоперехват — связь со штабом</p>
      <p className={styles.battleHqRewriteHint}>
        Можно сменить до {rewriteMax} своих приказов
        {hqRoll != null ? ` (куб штаба ${hqRoll})` : ''}. Затем «Следующий ход».
      </p>
      {revealedOrders.length ? (
        <ul className={styles.battleHqRewriteList}>
          {revealedOrders.map((row) => (
            <li key={row.unitInstanceId}>
              {row.unitName || 'Юнит'} #{row.unitInstanceId}: {row.orderLabel || row.orderKey}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.battleHqRewriteHint}>Вскрытых приказов нет.</p>
      )}
      <div className={styles.battleHqRewriteActions}>
        <Button name="Оставить приказы" onClick={onKeepOrders} />
      </div>
    </div>
  );
};

export default BattleHqRewritePanel;

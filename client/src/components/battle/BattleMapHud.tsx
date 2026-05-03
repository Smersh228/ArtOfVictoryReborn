import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleOrderPickLike {
  orderLabel?: string;
  orderKey?: string;
  unit?: { [key: string]: any };
  defendStep?: 'facing' | 'range';
  unloadCargoInstanceId?: number | string | null;
}

interface BattleMapHudProps {
  battleHoverCellId: number | null;
  orderPick: BattleOrderPickLike | null;
  battleAreaFireCellIds: number[] | null;
}

function getOrderMetaText(orderPick: BattleOrderPickLike, battleAreaFireCellIds: number[] | null): string {
  const sec =
    orderPick.orderKey === 'defend' ||
    orderPick.orderKey === 'ambush' ||
    orderPick.orderKey === 'deploy' ||
    orderPick.orderKey === 'changeSector';
  if (sec && orderPick.defendStep === 'facing') {
    if (orderPick.orderKey === 'defend' || orderPick.orderKey === 'ambush') {
      return ' — соседний гекс: направление, затем клетка в секторе — глубина';
    }
    return ' — соседний гекс направления; сектор — на всю дальность орудия';
  }
  if (sec && orderPick.defendStep === 'range') {
    return ' — клик по клетке в подсвеченном секторе';
  }
  if (orderPick.orderKey === 'getSup' || orderPick.orderKey === 'loading' || orderPick.orderKey === 'tow') {
    return ' — жёлтая подсветка: цель в соседнем гексе';
  }
  if (
    (orderPick.orderKey === 'fire' || orderPick.orderKey === 'fireHard') &&
    battleAreaFireCellIds &&
    battleAreaFireCellIds.length > 0
  ) {
    return ' — зона огня по площади (туман не учитывается; цели не подсвечиваются)';
  }
  if (orderPick.orderKey === 'unloading') {
    return orderPick.unloadCargoInstanceId == null
      ? ' — выберите груз'
      : ' — серая подсветка и иконка: клетки выгрузки (рядом с грузовиком)';
  }
  return '';
}

const BattleMapHud: React.FC<BattleMapHudProps> = ({ battleHoverCellId, orderPick, battleAreaFireCellIds }) => {
  return (
    <div className={styles.battleCellIdCorner} aria-live="polite">
      <div className={styles.battleHudLine}>
        Клетка: <strong>{battleHoverCellId != null ? battleHoverCellId : '—'}</strong>
      </div>
      {orderPick && (
        <div className={styles.battleHudOrderLine}>
          Приказ: <strong>{orderPick.orderLabel}</strong>
          <span className={styles.battleHudOrderMeta}>
            {' '}
            · {orderPick.unit?.name ?? 'Юнит'}
            {getOrderMetaText(orderPick, battleAreaFireCellIds)}
          </span>
        </div>
      )}
    </div>
  );
};

export default BattleMapHud;

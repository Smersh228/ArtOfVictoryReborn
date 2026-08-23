import React from 'react';
import styles from '../../pages/styleModules/battle.module.css';
import { airOrderNeedsHexTarget } from '../../game/battleAirSupport';

type OrderPickLike = {
  orderLabel?: string;
  orderKey?: string;
  unit?: { name?: string };
  defendStep?: 'facing' | 'range';
  bombardmentStep?: 'target' | 'direction';
  patrolStep?: 'target' | 'radius';
  unloadCargoInstanceId?: number | null;
  useFireAdjustment?: boolean;
};

interface BattleMapHudProps {
  battleHoverCellId: number | null;
  orderPick: OrderPickLike | null;
  battleAreaFireCellIds: number[] | null;
  fireAdjustmentToggleAvailable?: boolean;
  onToggleFireAdjustment?: () => void;
}

function getOrderMetaText(
  orderPick: OrderPickLike,
  battleAreaFireCellIds: number[] | null | undefined,
  fireAdjustmentToggleAvailable?: boolean,
): string {
  const isDefendLike =
    orderPick.orderKey === 'defend' ||
    orderPick.orderKey === 'ambush' ||
    orderPick.orderKey === 'deploy' ||
    orderPick.orderKey === 'changeSector';
  if (isDefendLike) {
    if (orderPick.orderKey === 'defend' || orderPick.orderKey === 'ambush') {
      return orderPick.defendStep === 'range'
        ? ' — выберите максимальную дальность стрельбы'
        : ' — выберите направление сектора';
    }
    return ' — выберите направление сектора';
  }
  if (orderPick.orderKey === 'getSup' || orderPick.orderKey === 'loading' || orderPick.orderKey === 'tow') {
    return ' — клик по своему юниту или грузовику';
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
  if (orderPick.orderKey === 'bombardment') {
    if ((orderPick.bombardmentStep ?? 'target') === 'target') {
      return ' — клик по клетке, куда летит самолёт';
    }
    return ' — синий гекс: сторона захода; серый сосед — направление, впереди 3 гекса бомбардировки';
  }
  if (orderPick.orderKey === 'patrol') {
    if ((orderPick.patrolStep ?? 'target') === 'target') {
      return ' — клик: центр патруля (точка полёта)';
    }
    return ' — наведите курсор, чтобы увеличить зону; клик — подтвердить радиус';
  }
  if (orderPick.orderKey === 'interception') {
    return ' — клик по красному гексу: вражеская авиация в небе';
  }
  if (orderPick.orderKey === 'enterDot') {
    return ' — клик по гексу с ДОТ (вход займёт 1 ход)';
  }
  if (orderPick.orderKey === 'exitDot') {
    return ' — клик по соседнему гексу (не ДОТ): выход, пехота — 1 ход';
  }
  if (orderPick.orderKey === 'cutWire') {
    return ' — клик по соседнему гексу с проволокой';
  }
  if (orderPick.orderKey === 'fire' && fireAdjustmentToggleAvailable) {
    return orderPick.useFireAdjustment
      ? ' — корректировка огня: вкл (закрытые цели, видимые наземным союзникам)'
      : ' — включите корректировку для стрельбы по закрытым целям';
  }
  if (airOrderNeedsHexTarget(orderPick.orderKey ?? '')) {
    return ' — клик по клетке назначения: прямая от точки вылета';
  }
  return '';
}

const BattleMapHud: React.FC<BattleMapHudProps> = ({
  battleHoverCellId,
  orderPick,
  battleAreaFireCellIds,
  fireAdjustmentToggleAvailable,
  onToggleFireAdjustment,
}) => {
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
            {getOrderMetaText(orderPick, battleAreaFireCellIds, fireAdjustmentToggleAvailable)}
          </span>
          {orderPick.orderKey === 'fire' && fireAdjustmentToggleAvailable && onToggleFireAdjustment && (
            <button
              type="button"
              style={{ marginLeft: 8, fontSize: '0.85em', cursor: 'pointer' }}
              onClick={onToggleFireAdjustment}
            >
              Корректировка: {orderPick.useFireAdjustment ? 'вкл' : 'выкл'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BattleMapHud;

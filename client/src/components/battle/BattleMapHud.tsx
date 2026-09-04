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
  reconRangeStep?: 'radius';
  unloadCargoInstanceId?: number | null;
  useFireAdjustment?: boolean;
  fireModeStep?: 'mode';
  useReactiveFire?: boolean;
};

interface BattleMapHudProps {
  battleHoverCellId: number | null;
  orderPick: OrderPickLike | null;
  battleAreaFireCellIds: number[] | null;
  fireAdjustmentToggleAvailable?: boolean;
  onToggleFireAdjustment?: () => void;
  onApplyFireMode?: (reactive: boolean) => void;
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
  if (orderPick.orderKey === 'getSup' || orderPick.orderKey === 'loading' || orderPick.orderKey === 'tow' || orderPick.orderKey === 'railLoading') {
    return ' — клик по подсвеченному союзнику (тот же гекс или соседний)';
  }
  if (orderPick.orderKey === 'medical') {
    return ' — клик по союзной пехоте или артиллерии (свой или соседний гекс)';
  }
  if (orderPick.orderKey === 'loadingSup') {
    return ' — клик по складу (свой гекс или соседний)';
  }
  if ((orderPick.orderKey === 'fire' || orderPick.orderKey === 'fireHard') && orderPick.fireModeStep === 'mode') {
    return ' — обычный или реактивный';
  }
  if (
    (orderPick.orderKey === 'fire' || orderPick.orderKey === 'fireHard') &&
    battleAreaFireCellIds &&
    battleAreaFireCellIds.length > 0
  ) {
    return ' — зона огня по площади (туман не учитывается; цели не подсвечиваются)';
  }
  if (orderPick.orderKey === 'unloading' || orderPick.orderKey === 'railUnloading') {
    return orderPick.unloadCargoInstanceId == null
      ? ' — выберите груз'
      : ' — серая подсветка и иконка: клетки выгрузки (соседний гекс)';
  }
  if (orderPick.orderKey === 'smoke') {
    return battleAreaFireCellIds && battleAreaFireCellIds.length > 0
      ? ' — клик по подсвеченному гексу в дальности и секторе стрельбы'
      : ' — нет гексов в дальности/секторе (артиллерия должна быть развёрнута)';
  }
  if (orderPick.orderKey === 'explomost' || orderPick.orderKey === 'demolition') {
    return ' — клик по соседнему гексу: склад, ДОТ, мост, ЖД мост или ЖД дорога';
  }
  if (orderPick.orderKey === 'repairRailway') {
    return ' — клик по своему или соседнему гексу с разрушенной железной дорогой';
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
  if (orderPick.orderKey === 'razvedka' || orderPick.orderKey === 'svzy') {
    return ' — наведите курсор, чтобы увидеть зону; клик — подтвердить радиус (порог — колонка таблицы)';
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
    return ' — клик по своему или соседнему гексу у грани с проволокой';
  }
  if (orderPick.orderKey === 'fireMove') {
    const step = (orderPick as { fireMoveStep?: string }).fireMoveStep;
    if (step === 'dest') return ' — клик по клетке назначения (с учётом очков перемещения)';
    return ' — клик по цели обстрела (дальность и видимость с клетки назначения)';
  }
  if (orderPick.orderKey === 'hardMove') {
    return ' — клик по одиночной цели (мощная атака)';
  }
  if (orderPick.orderKey === 'trenches') {
    return ' — клик по соседнему гексу: сторона окопа (защита с фронта)';
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
  onApplyFireMode,
}) => {
  const fireModePick =
    (orderPick?.orderKey === 'fire' || orderPick?.orderKey === 'fireHard') &&
    orderPick.fireModeStep === 'mode';
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
          {fireModePick && onApplyFireMode ? (
            <div className={styles.battleHudFireModeRow}>
              <button type="button" className={styles.battleHudFireModeBtn} onClick={() => onApplyFireMode(false)}>
                Обычный
              </button>
              <button type="button" className={styles.battleHudFireModeBtn} onClick={() => onApplyFireMode(true)}>
                Реактивный
              </button>
            </div>
          ) : null}
          {orderPick.orderKey === 'fire' &&
            !fireModePick &&
            fireAdjustmentToggleAvailable &&
            onToggleFireAdjustment && (
            <button
              type="button"
              style={{ marginLeft: 8, fontSize: '0.85em', cursor: 'pointer', pointerEvents: 'auto' }}
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

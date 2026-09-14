import React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

import {
  getAmmoCapacityMaxUi,
  getExplosivesCapacityMaxUi,
  getMinesCapacityMaxUi,
  getSmokeCapacityMaxUi,
  readAmmoCountUi,
  readExplosivesCountUi,
  readMinesCountUi,
  readSmokeCountUi,
  supplyAmountsTotal,
  type BattleSupplyAmounts,
} from '../../game/battleLogisticsUi';

interface BattleUnitLite {
  instanceId?: number | string;
  name?: string;
  ammo?: number | string;
  [key: string]: unknown;
}

interface BattleActionModalsProps {
  battleAmmoModal: {
    giver: BattleUnitLite;
    receiver: BattleUnitLite;
    maxTransfer: number;
    maxMines: number;
    maxExplosives: number;
    maxSmoke: number;
    warehouseCellId?: number;
  } | null;
  supplyPick: BattleSupplyAmounts;
  onChangeSupplyPick: (next: BattleSupplyAmounts) => void;
  onCloseAmmoModal: () => void;
  onConfirmAmmoTransfer: () => void;
  unloadCargoPickModal: {
    truck: BattleUnitLite;
    orderLabel: string;
    carried: BattleUnitLite[];
  } | null;
  unloadingIconUrl: string | null;
  onCloseUnloadCargoModal: () => void;
  onSelectUnloadCargo: (instanceId: number) => void;
  accompanimentPickModal: {
    orderLabel: string;
    candidates: Array<{
      unitInstanceId: number;
      unitName: string;
      orderLabel: string;
    }>;
  } | null;
  accompanimentIconUrl: string | null;
  onCloseAccompanimentModal: () => void;
  onSelectAccompanimentTarget: (instanceId: number) => void;
  miningPickModal: {
    orderLabel: string;
  } | null;
  miningIconUrl: string | null;
  onCloseMiningModal: () => void;
  onSelectMineKind: (kind: 'infantry' | 'tank') => void;
}

function SupplySlider(props: {
  label: string;
  stockLabel: string;
  capLabel: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { label, stockLabel, capLabel, value, max, onChange } = props;
  if (max < 1) return null;
  return (
    <label className={styles.battleModalLabel}>
      {label}
      <span className={styles.battleModalMetaMuted}>
        {stockLabel} · {capLabel}
      </span>
      <strong>{value}</strong>
      <input
        type="range"
        className={styles.battleModalRange}
        min={0}
        max={max}
        step={1}
        value={Math.min(value, max)}
        onChange={(e) => {
          const v = Math.floor(parseInt(e.target.value, 10));
          if (!Number.isFinite(v)) return;
          onChange(Math.max(0, Math.min(max, v)));
        }}
      />
    </label>
  );
}

const BattleActionModals: React.FC<BattleActionModalsProps> = ({
  battleAmmoModal,
  supplyPick,
  onChangeSupplyPick,
  onCloseAmmoModal,
  onConfirmAmmoTransfer,
  unloadCargoPickModal,
  unloadingIconUrl,
  onCloseUnloadCargoModal,
  onSelectUnloadCargo,
  accompanimentPickModal,
  accompanimentIconUrl,
  onCloseAccompanimentModal,
  onSelectAccompanimentTarget,
  miningPickModal,
  miningIconUrl,
  onCloseMiningModal,
  onSelectMineKind,
}) => {
  return (
    <>
      {battleAmmoModal
        ? createPortal(
            <div
              role="dialog"
              aria-label={
                battleAmmoModal.warehouseCellId != null
                  ? 'Сколько припасов взять со склада'
                  : 'Сколько припасов передать'
              }
              className={styles.battleModalBackdrop}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCloseAmmoModal();
              }}
            >
              <div className={styles.battleModalPanel} onMouseDown={(e) => e.stopPropagation()}>
                <h3 className={styles.battleModalTitle}>
                  {battleAmmoModal.warehouseCellId != null ? 'Загрузка со склада' : 'Передача припасов'}
                </h3>
                <p className={styles.battleModalMeta}>
                  {battleAmmoModal.warehouseCellId != null ? (
                    <>
                      Склад кл. {battleAmmoModal.warehouseCellId} →{' '}
                      <strong>{battleAmmoModal.receiver.name ?? 'грузовик'}</strong>
                    </>
                  ) : (
                    <>
                      Кому: <strong>{battleAmmoModal.receiver.name ?? 'юнит'}</strong>
                    </>
                  )}
                </p>
                <SupplySlider
                  label="Боезапас"
                  stockLabel={
                    battleAmmoModal.warehouseCellId != null
                      ? `склад ${readAmmoCountUi(battleAmmoModal.giver)}`
                      : `грузовик ${readAmmoCountUi(battleAmmoModal.giver)}`
                  }
                  capLabel={`${readAmmoCountUi(battleAmmoModal.receiver)} / ${getAmmoCapacityMaxUi(battleAmmoModal.receiver)}`}
                  value={supplyPick.ammo}
                  max={battleAmmoModal.maxTransfer}
                  onChange={(ammo) => onChangeSupplyPick({ ...supplyPick, ammo })}
                />
                <SupplySlider
                  label="Мины"
                  stockLabel={
                    battleAmmoModal.warehouseCellId != null
                      ? `склад ${readMinesCountUi(battleAmmoModal.giver)}`
                      : `грузовик ${readMinesCountUi(battleAmmoModal.giver)}`
                  }
                  capLabel={`${readMinesCountUi(battleAmmoModal.receiver)} / ${getMinesCapacityMaxUi(battleAmmoModal.receiver)}`}
                  value={supplyPick.mines}
                  max={battleAmmoModal.maxMines}
                  onChange={(mines) => onChangeSupplyPick({ ...supplyPick, mines })}
                />
                <SupplySlider
                  label="Взрывчатка"
                  stockLabel={
                    battleAmmoModal.warehouseCellId != null
                      ? `склад ${readExplosivesCountUi(battleAmmoModal.giver)}`
                      : `грузовик ${readExplosivesCountUi(battleAmmoModal.giver)}`
                  }
                  capLabel={`${readExplosivesCountUi(battleAmmoModal.receiver)} / ${getExplosivesCapacityMaxUi(battleAmmoModal.receiver)}`}
                  value={supplyPick.explosives}
                  max={battleAmmoModal.maxExplosives}
                  onChange={(explosives) => onChangeSupplyPick({ ...supplyPick, explosives })}
                />
                <SupplySlider
                  label="Дымовые снаряды"
                  stockLabel={
                    battleAmmoModal.warehouseCellId != null
                      ? `склад ${readSmokeCountUi(battleAmmoModal.giver)}`
                      : `грузовик ${readSmokeCountUi(battleAmmoModal.giver)}`
                  }
                  capLabel={`${readSmokeCountUi(battleAmmoModal.receiver)} / ${getSmokeCapacityMaxUi(battleAmmoModal.receiver)}`}
                  value={supplyPick.smoke}
                  max={battleAmmoModal.maxSmoke}
                  onChange={(smoke) => onChangeSupplyPick({ ...supplyPick, smoke })}
                />
                <div className={styles.battleModalActions}>
                  <Button name="Отмена" className={styles.battleModalBtn} onClick={onCloseAmmoModal} />
                  <Button
                    name={battleAmmoModal.warehouseCellId != null ? 'Загрузить' : 'Передать'}
                    className={styles.battleModalBtn}
                    onClick={onConfirmAmmoTransfer}
                    disabled={supplyAmountsTotal(supplyPick) < 1}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {unloadCargoPickModal
        ? createPortal(
            <div
              role="dialog"
              aria-label="Кого выгрузить"
              className={styles.battleModalBackdrop}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCloseUnloadCargoModal();
              }}
            >
              <div
                className={`${styles.battleModalPanel} ${styles.battleModalPanelScroll}`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h3 className={styles.battleModalTitleRow}>
                  {unloadingIconUrl ? <img src={unloadingIconUrl} alt="" className={styles.battleModalTitleIcon} /> : null}
                  Выгрузка — выберите отряд
                </h3>
                <ul className={styles.battleModalCargoList}>
                  {unloadCargoPickModal.carried.map((cu) => {
                    const iid = parseInt(`${cu.instanceId ?? ''}`, 10);
                    return (
                      <li key={iid} className={styles.battleModalCargoItem}>
                        <button
                          type="button"
                          className={styles.battleModalCargoBtn}
                          onClick={() => {
                            if (!isFinite(iid)) return;
                            onSelectUnloadCargo(iid);
                          }}
                        >
                          {unloadingIconUrl ? <img src={unloadingIconUrl} alt="" className={styles.battleModalCargoIcon} /> : null}
                          <span>{cu.name ?? `Юнит ${iid}`}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className={styles.battleModalCancelWrap}>
                  <Button name="Отмена" className={styles.battleModalBtn} onClick={onCloseUnloadCargoModal} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {accompanimentPickModal
        ? createPortal(
            <div
              role="dialog"
              aria-label="Кого сопровождать"
              className={styles.battleModalBackdrop}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCloseAccompanimentModal();
              }}
            >
              <div
                className={`${styles.battleModalPanel} ${styles.battleModalPanelScroll}`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h3 className={styles.battleModalTitleRow}>
                  {accompanimentIconUrl ? (
                    <img src={accompanimentIconUrl} alt="" className={styles.battleModalTitleIcon} />
                  ) : null}
                  Сопровождение — выберите самолёт
                </h3>
                <p className={styles.battleModalMetaMuted}>
                  Сопровождающий летит к той же цели по своей траектории.
                </p>
                <ul className={styles.battleModalCargoList}>
                  {accompanimentPickModal.candidates.map((row) => (
                    <li key={row.unitInstanceId} className={styles.battleModalCargoItem}>
                      <button
                        type="button"
                        className={styles.battleModalCargoBtn}
                        onClick={() => onSelectAccompanimentTarget(row.unitInstanceId)}
                      >
                        <span>
                          <strong>{row.unitName}</strong>
                          <span className={styles.battleModalMetaMuted}> — {row.orderLabel}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={styles.battleModalCancelWrap}>
                  <Button name="Отмена" className={styles.battleModalBtn} onClick={onCloseAccompanimentModal} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {miningPickModal
        ? createPortal(
            <div
              role="dialog"
              aria-label="Тип мины"
              className={styles.battleModalBackdrop}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCloseMiningModal();
              }}
            >
              <div className={styles.battleModalPanel} onMouseDown={(e) => e.stopPropagation()}>
                <h3 className={styles.battleModalTitleRow}>
                  {miningIconUrl ? <img src={miningIconUrl} alt="" className={styles.battleModalTitleIcon} /> : null}
                  Минирование — выберите мину
                </h3>
                <p className={styles.battleModalMetaMuted}>Какую мину установить на этом гексе.</p>
                <ul className={styles.battleModalCargoList}>
                  <li className={styles.battleModalCargoItem}>
                    <button type="button" className={styles.battleModalCargoBtn} onClick={() => onSelectMineKind('infantry')}>
                      <span>
                        <strong>Пехотная</strong>
                        <span className={styles.battleModalMetaMuted}> — пехота, артиллерия, грузовики</span>
                      </span>
                    </button>
                  </li>
                  <li className={styles.battleModalCargoItem}>
                    <button type="button" className={styles.battleModalCargoBtn} onClick={() => onSelectMineKind('tank')}>
                      <span>
                        <strong>Танковая</strong>
                        <span className={styles.battleModalMetaMuted}> — танки, бронетехника, артиллерия, грузовики</span>
                      </span>
                    </button>
                  </li>
                </ul>
                <div className={styles.battleModalCancelWrap}>
                  <Button name="Отмена" className={styles.battleModalBtn} onClick={onCloseMiningModal} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default BattleActionModals;

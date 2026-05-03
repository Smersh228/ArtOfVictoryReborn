import React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

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
  } | null;
  ammoPickCount: number;
  onChangeAmmoPickCount: (count: number) => void;
  onCloseAmmoModal: () => void;
  onConfirmAmmoTransfer: () => void;
  readAmmoCountUi: (unit: BattleUnitLite) => number;
  getAmmoCapacityMaxUi: (unit: BattleUnitLite) => number;
  unloadCargoPickModal: {
    truck: BattleUnitLite;
    orderLabel: string;
    carried: BattleUnitLite[];
  } | null;
  unloadingIconUrl: string | null;
  onCloseUnloadCargoModal: () => void;
  onSelectUnloadCargo: (instanceId: number) => void;
}

const BattleActionModals: React.FC<BattleActionModalsProps> = ({
  battleAmmoModal,
  ammoPickCount,
  onChangeAmmoPickCount,
  onCloseAmmoModal,
  onConfirmAmmoTransfer,
  readAmmoCountUi,
  getAmmoCapacityMaxUi,
  unloadCargoPickModal,
  unloadingIconUrl,
  onCloseUnloadCargoModal,
  onSelectUnloadCargo,
}) => {
  return (
    <>
      {battleAmmoModal
        ? createPortal(
            <div
              role="dialog"
              aria-label="Сколько боеприпасов передать"
              className={styles.battleModalBackdrop}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCloseAmmoModal();
              }}
            >
              <div className={styles.battleModalPanel} onMouseDown={(e) => e.stopPropagation()}>
                <h3 className={styles.battleModalTitle}>Передача боеприпасов</h3>
                <p className={styles.battleModalMeta}>
                  Кому: <strong>{battleAmmoModal.receiver.name ?? 'юнит'}</strong>
                </p>
                <p className={styles.battleModalMetaMuted}>
                  В грузовике: {readAmmoCountUi(battleAmmoModal.giver)} БК · У получателя:{' '}
                  {readAmmoCountUi(battleAmmoModal.receiver)} / {getAmmoCapacityMaxUi(battleAmmoModal.receiver)} (лимит)
                </p>
                <label className={styles.battleModalLabel}>
                  Сколько передать: <strong>{ammoPickCount}</strong>
                  <input
                    type="range"
                    className={styles.battleModalRange}
                    min={1}
                    max={Math.max(1, battleAmmoModal.maxTransfer)}
                    step={1}
                    value={Math.min(ammoPickCount, battleAmmoModal.maxTransfer)}
                    onChange={(e) => {
                      const v = Math.floor(parseInt(e.target.value, 10));
                      if (!isFinite(v)) return;
                      onChangeAmmoPickCount(Math.max(1, Math.min(battleAmmoModal.maxTransfer, v)));
                    }}
                  />
                </label>
                <div className={styles.battleModalActions}>
                  <Button name="Отмена" className={styles.battleModalBtn} onClick={onCloseAmmoModal} />
                  <Button name="Передать" className={styles.battleModalBtn} onClick={onConfirmAmmoTransfer} />
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
    </>
  );
};

export default BattleActionModals;

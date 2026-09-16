import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import styles from '../../pages/styleModules/battle.module.css';

export type BattleHexCardMenuState = {
  cell: Cell;
  clientX: number;
  clientY: number;
  unit?: Record<string, unknown>;
};

interface BattleHexCardMenuProps {
  menu: BattleHexCardMenuState;
  onViewCard: () => void;
  onClose: () => void;
}

const BattleHexCardMenu: React.FC<BattleHexCardMenuProps> = ({ menu, onViewCard, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: menu.clientX + 8, top: menu.clientY + 8 });

  useLayoutEffect(() => {
    const el = ref.current;
    const pad = 8;
    const w = el?.offsetWidth ?? 180;
    const h = el?.offsetHeight ?? 72;
    let left = menu.clientX + 8;
    let top = menu.clientY + 8;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = menu.clientY - h - 8;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [menu.clientX, menu.clientY]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.battleUnitOrders}
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label={menu.unit ? 'Юнит' : 'Гекс'}
    >
      <header className={styles.battleUnitOrdersHeader}>
        <h3 className={styles.battleUnitOrdersTitle}>
          {menu.unit ? String(menu.unit.name ?? 'Юнит') : `Гекс ${menu.cell.id}`}
        </h3>
      </header>
      <div className={styles.battleUnitOrdersBody}>
        <button type="button" className={styles.battleUnitOrderBtn} role="menuitem" onClick={onViewCard}>
          Посмотреть карточку
        </button>
      </div>
    </div>
  );
};

export default BattleHexCardMenu;

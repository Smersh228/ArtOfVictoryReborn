import React, { useEffect, useRef, useState } from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleToolbarProps {
  readonlyBattle: boolean;
  toolbarBusy: boolean;
  infoLocked?: boolean;
  battleControlsDisabled: boolean;
  waitingNextTurn: boolean;
  turn: number;
  environmentLabels?: string[];
  showAirSupportButton: boolean;
  airSupportDisabled?: boolean;
  onToggleAirSupport: () => void;
  onLeaveOrSurrender: () => void;
  onShowReport: () => void;
  onShowTasks: () => void;
  onOpenChat: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onNextTurn: () => void;
  reportBadgeCount?: number;
  chatUnreadCount?: number;
}

const BattleToolbar: React.FC<BattleToolbarProps> = ({
  readonlyBattle,
  toolbarBusy,
  infoLocked = false,
  battleControlsDisabled,
  waitingNextTurn,
  turn,
  environmentLabels = [],
  showAirSupportButton,
  airSupportDisabled = false,
  onToggleAirSupport,
  onLeaveOrSurrender,
  onShowReport,
  onShowTasks,
  onOpenChat,
  onOpenRules,
  onOpenSettings,
  onNextTurn,
  reportBadgeCount = 0,
  chatUnreadCount = 0,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarLeftActions}>
          <div className={styles.toolbarMenuWrap} ref={menuRef}>
            <Button
              size={110}
              name={menuOpen ? 'Меню ▴' : 'Меню ▾'}
              className={`${styles.toolbarBtn}${menuOpen ? ` ${styles.toolbarMenuTriggerOpen}` : ''}`}
              onClick={() => setMenuOpen((open) => !open)}
            />
            {menuOpen ? (
              <div className={styles.toolbarMenuPanel} role="menu">
                <Button
                  size={240}
                  name={readonlyBattle ? 'Выйти' : 'Сдаться'}
                  disabled={readonlyBattle ? infoLocked : toolbarBusy}
                  onClick={() => runMenuAction(onLeaveOrSurrender)}
                />
                {!readonlyBattle ? (
                  <Button
                    size={240}
                    name="Посмотреть задания"
                    disabled={infoLocked}
                    onClick={() => runMenuAction(onShowTasks)}
                  />
                ) : null}
                <Button size={240} name="Правила" onClick={() => runMenuAction(onOpenRules)} />
                <Button size={240} name="Настройки" onClick={() => runMenuAction(onOpenSettings)} />
                {showAirSupportButton ? (
                  <Button
                    size={240}
                    name="Авиаподдержка"
                    disabled={toolbarBusy || airSupportDisabled}
                    title={
                      airSupportDisabled
                        ? 'На поле нет юнита со свойством «Вызов авиации»'
                        : 'Состав авиации с карты миссии (на поле не показывается)'
                    }
                    onClick={() => runMenuAction(onToggleAirSupport)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <Button
            size={110}
            name="Отчёт"
            className={styles.toolbarBtn}
            disabled={infoLocked}
            badgeCount={reportBadgeCount}
            onClick={onShowReport}
          />
          <Button
            size={128}
            name="Чат"
            className={`${styles.toolbarBtn} ${styles.toolbarChatBtn}`}
            disabled={infoLocked}
            badgeCount={chatUnreadCount}
            onClick={onOpenChat}
          />
        </div>
        <div className={styles.toolbarTurnGroup}>
          <div className={styles.toolbarBtnSlot}>
            <Button
              name="Следующий ход"
              disabled={battleControlsDisabled}
              onClick={() => !waitingNextTurn && onNextTurn()}
            />
          </div>
          <span className={styles.battleTurnCounter}>
            Ход: {turn}
            {environmentLabels.length ? ` · ${environmentLabels.join(', ')}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BattleToolbar;

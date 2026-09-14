import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/manual.module.css';

type ManualSidebarProps = {
  onGoMain?: () => void;
  onSelectSection: (id: string) => void;
  compact?: boolean;
};

const ManualSidebar: React.FC<ManualSidebarProps> = ({ onGoMain, onSelectSection, compact = false }) => {
  const btnSize = compact ? 220 : 320;
  return (
    <nav
      className={`${styles.manualSidebar} ${compact ? styles.manualSidebarCompact : ''}`}
      aria-label="Разделы справочника"
    >
      {onGoMain ? (
        <Button className={styles.manualSidebarButton} size={btnSize} name="На главную" onClick={onGoMain} />
      ) : null}
      <Button className={styles.manualSidebarButton} size={btnSize} name="Юниты" onClick={() => onSelectSection('units')} />
      <Button className={styles.manualSidebarButton} size={btnSize} name="Гексы" onClick={() => onSelectSection('hexes')} />
      <Button className={styles.manualSidebarButton} size={btnSize} name="Ход игры" onClick={() => onSelectSection('game_turn')} />
      <Button
        className={styles.manualSidebarButton}
        size={btnSize}
        name="Общие игровые механики"
        onClick={() => onSelectSection('general')}
      />
      <Button className={styles.manualSidebarButton} size={btnSize} name="Приказы" onClick={() => onSelectSection('orders')} />
      <Button className={styles.manualSidebarButton} size={btnSize} name="Свойства" onClick={() => onSelectSection('properties')} />
    </nav>
  );
};

export default ManualSidebar;

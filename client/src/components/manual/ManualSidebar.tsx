import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/manual.module.css';

type ManualSidebarProps = {
  onGoMain: () => void;
  onSelectSection: (id: string) => void;
};

const ManualSidebar: React.FC<ManualSidebarProps> = ({ onGoMain, onSelectSection }) => {
  return (
    <nav className={styles.manualSidebar} aria-label="Разделы справочника">
      <Button className={styles.manualSidebarButton} size={320} name="На главную" onClick={onGoMain} />
      <Button className={styles.manualSidebarButton} size={320} name="Юниты" onClick={() => onSelectSection('units')} />
      <Button className={styles.manualSidebarButton} size={320} name="Гексы" onClick={() => onSelectSection('hexes')} />
      <Button className={styles.manualSidebarButton} size={320} name="Ход игры" onClick={() => onSelectSection('game_turn')} />
      <Button
        className={styles.manualSidebarButton}
        size={320}
        name="Общие игровые механики"
        onClick={() => onSelectSection('general')}
      />
      <Button className={styles.manualSidebarButton} size={320} name="Приказы" onClick={() => onSelectSection('orders')} />
      <Button className={styles.manualSidebarButton} size={320} name="Свойства" onClick={() => onSelectSection('properties')} />
    </nav>
  );
};

export default ManualSidebar;

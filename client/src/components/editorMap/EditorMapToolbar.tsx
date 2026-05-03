import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapToolbarProps {
  onGoMain: () => void;
  onSaveMap: () => void;
  onGenerateGrid: () => void;
  onLoadMap: () => void;
  onShowGuide: () => void;
}

const EditorMapToolbar: React.FC<EditorMapToolbarProps> = ({
  onGoMain,
  onSaveMap,
  onGenerateGrid,
  onLoadMap,
  onShowGuide,
}) => {
  return (
    <div className={styles.toolbarRow}>
      <div className={styles.toolbarPrimary}>
        <Button size={280} name="На главную" onClick={onGoMain} />
        <Button size={280} name="Сохранить карту" onClick={onSaveMap} />
        <Button size={280} name="Сгенерировать сетку" onClick={onGenerateGrid} />
        <Button size={280} name="Загрузить карту" onClick={onLoadMap} />
        <Button size={280} name="Руководство" onClick={onShowGuide} />
      </div>
    </div>
  );
};

export default EditorMapToolbar;

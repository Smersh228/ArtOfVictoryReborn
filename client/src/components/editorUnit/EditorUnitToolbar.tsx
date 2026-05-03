import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/editorUnit.module.css';

interface EditorUnitToolbarProps {
  onGoMain: () => void;
}

const EditorUnitToolbar: React.FC<EditorUnitToolbarProps> = ({ onGoMain }) => {
  return (
    <div className={styles.toolbarBar}>
      <Button size={350} name="На главную" onClick={onGoMain} />
    </div>
  );
};

export default EditorUnitToolbar;

import React, { useEffect, useRef, useState } from 'react';
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
    <div className={styles.toolbarRow}>
      <div className={styles.toolbarSecondary} ref={menuRef}>
        <Button size={150} name="На главную" className={styles.toolbarBtn} onClick={onGoMain} />
        <div className={styles.toolbarMenuWrap}>
          <Button
            size={112}
            name={menuOpen ? 'Меню ▴' : 'Меню ▾'}
            className={`${styles.toolbarBtn}${menuOpen ? ` ${styles.toolbarMenuTriggerOpen}` : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen ? (
            <div className={styles.toolbarMenuPanel} role="menu">
              <Button size={240} name="Сохранить карту" onClick={() => runMenuAction(onSaveMap)} />
              <Button size={240} name="Сгенерировать сетку" onClick={() => runMenuAction(onGenerateGrid)} />
              <Button size={240} name="Загрузить карту" onClick={() => runMenuAction(onLoadMap)} />
              <Button size={240} name="Руководство" onClick={() => runMenuAction(onShowGuide)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default EditorMapToolbar;

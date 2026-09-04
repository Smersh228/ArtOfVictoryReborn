import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapGridModalProps {
  isOpen: boolean;
  widthSize: number;
  heightSize: number;
  minSize: number;
  maxWidth: number;
  maxHeight: number;
  setWidthSize: (value: number) => void;
  setHeightSize: (value: number) => void;
  onClose: () => void;
  onApply: () => void;
}

const EditorMapGridModal: React.FC<EditorMapGridModalProps> = ({
  isOpen,
  widthSize,
  heightSize,
  minSize,
  maxWidth,
  maxHeight,
  setWidthSize,
  setHeightSize,
  onClose,
  onApply,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Генерация сетки"
      subtitle={
        <>
          Задайте размер поля в гексах
          <span className={styles.modalGridWarn}>
            Больше 20×10 клеток: гексы и юниты станут меньше, возможны проблемы с
            производительностью.
          </span>
        </>
      }
      footer={
        <div className={styles.modalFooterActions}>
          <Button name="Отмена" onClick={onClose} />
          <Button name="Создать сетку" onClick={onApply} />
        </div>
      }
    >
      <div className={styles.modalFormGrid}>
        <div className={styles.modalField}>
          <label className={styles.modalLabel} htmlFor="editor-grid-width">
            Ширина
          </label>
          <span className={styles.modalHint}>Диапазон: {minSize}–{maxWidth}</span>
          <input
            id="editor-grid-width"
            className={styles.modalNumberInput}
            type="number"
            min={minSize}
            max={maxWidth}
            value={widthSize}
            onChange={(e) => setWidthSize(Number(e.target.value))}
          />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel} htmlFor="editor-grid-height">
            Высота
          </label>
          <span className={styles.modalHint}>Диапазон: {minSize}–{maxHeight}</span>
          <input
            id="editor-grid-height"
            className={styles.modalNumberInput}
            type="number"
            min={minSize}
            max={maxHeight}
            value={heightSize}
            onChange={(e) => setHeightSize(Number(e.target.value))}
          />
        </div>
      </div>
    </Modal>
  );
};

export default EditorMapGridModal;

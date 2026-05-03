import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapGridModalProps {
  isOpen: boolean;
  widthSize: number;
  heightSize: number;
  setWidthSize: (value: number) => void;
  setHeightSize: (value: number) => void;
  onClose: () => void;
  onApply: () => void;
}

const EditorMapGridModal: React.FC<EditorMapGridModalProps> = ({
  isOpen,
  widthSize,
  heightSize,
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
      subtitle="Задайте размер поля в гексах"
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
          <span className={styles.modalHint}>Диапазон: 5–20</span>
          <input
            id="editor-grid-width"
            className={styles.modalNumberInput}
            type="number"
            min={5}
            max={20}
            value={widthSize}
            onChange={(e) => setWidthSize(Number(e.target.value))}
          />
        </div>
        <div className={styles.modalField}>
          <label className={styles.modalLabel} htmlFor="editor-grid-height">
            Высота
          </label>
          <span className={styles.modalHint}>Диапазон: 5–10</span>
          <input
            id="editor-grid-height"
            className={styles.modalNumberInput}
            type="number"
            min={5}
            max={10}
            value={heightSize}
            onChange={(e) => setHeightSize(Number(e.target.value))}
          />
        </div>
      </div>
    </Modal>
  );
};

export default EditorMapGridModal;

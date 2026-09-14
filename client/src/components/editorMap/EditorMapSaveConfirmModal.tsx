import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapSaveConfirmModalProps {
  isOpen: boolean;
  saveMapBusy: boolean;
  defaultName: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

const EditorMapSaveConfirmModal: React.FC<EditorMapSaveConfirmModalProps> = ({
  isOpen,
  saveMapBusy,
  defaultName,
  onClose,
  onConfirm,
}) => {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  const title = name.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Сохранить карту на сервере?"
      subtitle="Имя карты можно задать здесь — вкладка «Сценарий» не обязательна"
      footer={
        <div className={styles.modalFooterActions}>
          <Button name="Отмена" onClick={onClose} disabled={saveMapBusy} />
          <Button
            name={saveMapBusy ? 'Сохранение…' : 'Сохранить'}
            onClick={() => {
              if (!title) {
                window.alert('Укажите название карты');
                return;
              }
              onConfirm(title);
            }}
            disabled={saveMapBusy}
          />
        </div>
      }
    >
      <label className={styles.fieldLabel} htmlFor="editor-save-map-name">
        Название карты
      </label>
      <input
        id="editor-save-map-name"
        type="text"
        className={`${styles.panelInput} ${styles.fullWidth} ${styles.marginTopSm}`}
        value={name}
        disabled={saveMapBusy}
        placeholder="Например: Битва за Прохоровку"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !saveMapBusy && title) onConfirm(title);
        }}
      />
    </Modal>
  );
};

export default EditorMapSaveConfirmModal;

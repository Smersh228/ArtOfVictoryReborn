import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapSaveConfirmModalProps {
  isOpen: boolean;
  saveMapBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const EditorMapSaveConfirmModal: React.FC<EditorMapSaveConfirmModalProps> = ({
  isOpen,
  saveMapBusy,
  onClose,
  onConfirm,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Сохранить карту на сервере?"
      footer={
        <div className={styles.modalFooterActions}>
          <Button name="Отмена" onClick={onClose} disabled={saveMapBusy} />
          <Button
            name={saveMapBusy ? 'Сохранение…' : 'Сохранить'}
            onClick={onConfirm}
            disabled={saveMapBusy}
          />
        </div>
      }
    >
      {null}
    </Modal>
  );
};

export default EditorMapSaveConfirmModal;

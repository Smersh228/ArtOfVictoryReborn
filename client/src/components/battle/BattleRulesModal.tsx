import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import ManualGuide from '../manual/ManualGuide';
import styles from '../../pages/styleModules/manual.module.css';

interface BattleRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BattleRulesModal: React.FC<BattleRulesModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Правила"
      subtitle="То же руководство, что на главной"
      size="full"
      flush
      elevated
      footer={<Button name="Закрыть" onClick={onClose} />}
    >
      <div className={styles.manualInModal}>
        <ManualGuide embedded />
      </div>
    </Modal>
  );
};

export default BattleRulesModal;

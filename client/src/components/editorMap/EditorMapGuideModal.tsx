import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EditorMapGuideModal: React.FC<EditorMapGuideModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual — руководство по редактору карт"
      subtitle="Краткая инструкция в стиле интерфейса редактора"
      size="lg"
      footer={
        <div className={styles.modalFooterActions}>
          <Button name="Закрыть" onClick={onClose} />
        </div>
      }
    >
      <div className={styles.manual}>
        <p className={styles.manualIntro}>
          Редактор позволяет собрать гексагональное поле, расставить юниты и типы местности, задать условия сценария и
          текст миссии перед сохранением или выгрузкой данных.
        </p>

        <div className={styles.manualSection}>
          <h3 className={styles.manualSectionTitle}>Интерфейс</h3>
          <ul className={styles.manualList}>
            <li>
              <strong>Слева</strong> — поле карты (canvas): клик по гексу применяет выбранный в палитре объект.
            </li>
            <li>
              <strong>Справа сверху</strong> — вкладки: Юниты, Гексы, Условия игры, Сценарий.
            </li>
            <li>
              <strong>Справа по центру</strong> — фильтры и поля выбранной вкладки.
            </li>
            <li>
              <strong>Справа внизу</strong> — палитра «Палитра объектов»: иконки юнитов или типов гексов.
            </li>
          </ul>
        </div>

        <div className={styles.manualSection}>
          <h3 className={styles.manualSectionTitle}>Порядок работы</h3>
          <ol className={styles.manualSteps}>
            <li className={styles.manualStep}>
              <span className={styles.manualStepBadge}>1</span>
              <div>
                <div className={styles.manualStepTitle}>Сетка</div>
                <p className={styles.manualStepText}>
                  Кнопка «Сгенерировать сетку» — задайте ширину (5–20) и высоту (5–10), подтвердите «Создать сетку».
                </p>
              </div>
            </li>
            <li className={styles.manualStep}>
              <span className={styles.manualStepBadge}>2</span>
              <div>
                <div className={styles.manualStepTitle}>Юниты и гексы</div>
                <p className={styles.manualStepText}>
                  Вкладка «Юниты»: фильтр по фракции и типу, затем клик по карточке в палитре и клик по гексу на карте.
                  Вкладка «Гексы» — выбор типа местности и клик по гексу.
                </p>
              </div>
            </li>
            <li className={styles.manualStep}>
              <span className={styles.manualStepBadge}>3</span>
              <div>
                <div className={styles.manualStepTitle}>Сценарий</div>
                <p className={styles.manualStepText}>
                  Вкладки «Условия игры» и «Сценарий» — победа, задачи сторон, лимит ходов, название и описание миссии,
                  фото.
                </p>
              </div>
            </li>
            <li className={styles.manualStep}>
              <span className={styles.manualStepBadge}>4</span>
              <div>
                <div className={styles.manualStepTitle}>Сохранение</div>
                <p className={styles.manualStepText}>
                  «Сохранить карту» — подтверждение и запись в базу; имя в списке серверов берётся из «Название миссии»
                  (вкладка «Сценарий»), условия и сценарий — из правой панели. «Загрузить карту» — открыть сохранённую
                  карту из базы обратно в редактор со всеми данными.
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className={styles.manualTip}>
          <span className={styles.manualTipLabel}>Важно</span>
          На один гекс можно поставить не более трёх юнитов. Снять выбор объекта — крестик в уведомлении внизу справа
          или смена вкладки.
        </div>

        <p className={styles.manualFooterNote}>
          Окно закрывается кнопкой «Закрыть», по крестику в заголовке или клавишей Escape.
        </p>
      </div>
    </Modal>
  );
};

export default EditorMapGuideModal;

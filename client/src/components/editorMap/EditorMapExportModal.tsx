import React from 'react';
import Modal from '../Modal';
import Button from '../Button';
import styles from '../../pages/styleModules/editorMap.module.css';
import type { SavedMapListItem } from '../../api/maps';

interface EditorMapExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportMapsLoading: boolean;
  exportMapsError: string | null;
  exportSavedMaps: SavedMapListItem[];
  exportingSavedMapId: number | null;
  onOpenSavedMap: (m: SavedMapListItem) => void;
  onDeleteSavedMap: (m: SavedMapListItem) => void;
  onModerateSavedMap: (m: SavedMapListItem, action: 'approve' | 'reject') => void;
}

const EditorMapExportModal: React.FC<EditorMapExportModalProps> = ({
  isOpen,
  onClose,
  exportMapsLoading,
  exportMapsError,
  exportSavedMaps,
  exportingSavedMapId,
  onOpenSavedMap,
  onDeleteSavedMap,
  onModerateSavedMap,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Загрузка карты"
      subtitle="Сохранённые на сервере карты — откройте нужную в редакторе целиком"
      size="lg"
      footer={
        <div className={styles.modalFooterActionsCenter}>
          <Button name="Закрыть" onClick={onClose} />
        </div>
      }
    >
      <div className={styles.exportPanelInner}>
        <p className={styles.exportSectionHint}>
          Нажмите «Открыть в редакторе» у выбранной карты: подставятся гексы, юниты, сооружения, условия и сценарий.
        </p>
        <div className={styles.exportList}>
          {exportMapsLoading && (
            <div className={styles.exportListEmpty}>
              <span>Загрузка списка…</span>
            </div>
          )}
          {!exportMapsLoading && exportMapsError && (
            <div className={styles.exportListError}>
              <span>{exportMapsError}</span>
            </div>
          )}
          {!exportMapsLoading && !exportMapsError && exportSavedMaps.length === 0 && (
            <div className={styles.exportListEmpty}>
              <span>Пока нет карт в базе. Сохраните карту кнопкой «Сохранить карту».</span>
            </div>
          )}
          {!exportMapsLoading &&
            !exportMapsError &&
            exportSavedMaps.map((m) => {
              const owner = String(m.ownerUsername || '').trim().toLowerCase();
              const canModerateDecision = Boolean(m.canModerate) && owner !== 'mstislaw';
              const pendingPlayerMap = m.moderationStatus === 'pending' && owner !== 'mstislaw';
              return (
                <div key={m.id} className={styles.exportListRow}>
                  <div className={styles.exportListNameWrap}>
                    <span className={styles.exportListName}>{m.name || `Карта #${m.id}`}</span>
                    {pendingPlayerMap ? (
                      <span className={styles.exportStatusPending}>На проверке</span>
                    ) : m.moderationStatus === 'rejected' ? (
                      <span className={styles.exportStatusRejected}>Отклонена</span>
                    ) : null}
                  </div>
                  <div className={styles.exportRowActions}>
                    <Button
                      name={exportingSavedMapId === m.id ? '…' : 'Открыть в редакторе'}
                      className={styles.exportOpenButton}
                      disabled={exportingSavedMapId != null}
                      onClick={() => onOpenSavedMap(m)}
                    />
                    {m.canModerate ? (
                      <>
                        <Button
                          name="Удалить"
                          className={styles.exportOpenButton}
                          disabled={exportingSavedMapId != null}
                          onClick={() => onDeleteSavedMap(m)}
                        />
                        {canModerateDecision ? (
                          <>
                            <Button
                              name="Принять"
                              className={styles.exportOpenButton}
                              disabled={exportingSavedMapId != null || m.moderationStatus === 'approved'}
                              onClick={() => onModerateSavedMap(m, 'approve')}
                            />
                            <Button
                              name="Отклонить"
                              className={styles.exportOpenButton}
                              disabled={exportingSavedMapId != null || m.moderationStatus === 'rejected'}
                              onClick={() => onModerateSavedMap(m, 'reject')}
                            />
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </Modal>
  );
};

export default EditorMapExportModal;

import React from 'react';
import Cells from '../map/Cells';
import styles from '../../pages/styleModules/lobby.module.css';
import type { RoomPublic } from '../../api/rooms';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';

interface LobbyMissionPanelsProps {
  room: RoomPublic | null;
  maxTurnsMission: string;
  allyTasksText: string;
  axisTasksText: string;
  previewCells: Cell[];
  previewLayout: { width: number; height: number; cellSize: number };
  photo0: string | undefined;
  photo1: string | undefined;
  historyText: string;
}

const LobbyMissionPanels: React.FC<LobbyMissionPanelsProps> = ({
  room,
  maxTurnsMission,
  allyTasksText,
  axisTasksText,
  previewCells,
  previewLayout,
  photo0,
  photo1,
  historyText,
}) => {
  return (
    <main className={styles.lobbyRight}>
      <div className={`${styles.glassCell} ${styles.lobbyBlockTaskInfo}`}>
        <p className={`${styles.cellLabel} ${styles.cellLabelPlain}`}>Условия</p>
        {maxTurnsMission ? (
          <p className={styles.lobbyMissionTurns}>
            Ходов на всю миссию: <strong>{maxTurnsMission}</strong>
          </p>
        ) : room?.mapId != null ? (
          <p className={styles.lobbyMissionTurnsMuted}>Лимит ходов не задан в редакторе (поле «Макс. ходов»).</p>
        ) : null}
        <div className={styles.lobbyTaskSplit}>
          <div className={styles.lobbyTaskColumn}>
            <p className={styles.lobbyTaskSubLabel}>Задачи РККА</p>
            <div className={styles.lobbyTaskBody}>
              {allyTasksText ? (
                <p className={styles.lobbyTaskBodyText}>{allyTasksText}</p>
              ) : (
                <p className={styles.playerPlaceholder}>
                  {room?.mapId != null
                    ? 'Задачи СССР не заданы (вкладка «Условия игры» в редакторе).'
                    : 'Нет данных карты для этой комнаты.'}
                </p>
              )}
            </div>
          </div>
          <div className={styles.lobbyTaskColumn}>
            <p className={styles.lobbyTaskSubLabel}>Задачи Вермахта</p>
            <div className={styles.lobbyTaskBody}>
              {axisTasksText ? (
                <p className={styles.lobbyTaskBodyText}>{axisTasksText}</p>
              ) : (
                <p className={styles.playerPlaceholder}>
                  {room?.mapId != null
                    ? 'Задачи Германии не заданы (вкладка «Условия игры» в редакторе).'
                    : 'Нет данных карты для этой комнаты.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.glassCell} ${styles.lobbyMap}`}>
        <p className={styles.cellLabel}>Карта{room?.map ? ` — ${room.map}` : ''}</p>
        {previewCells.length > 0 ? (
          <div className={styles.mapPreviewWrap}>
            <Cells
              mode="editor"
              lobbyPreview
              wrapClassName={styles.mapPreviewCellsWrap}
              cells={previewCells}
              width={previewLayout.width}
              height={previewLayout.height}
              cellSize={previewLayout.cellSize}
            />
          </div>
        ) : (
          <div className={styles.mapPlaceholder}>
            {room?.mapId != null
              ? 'Нет данных сетки в сохранённой карте.'
              : 'Превью недоступно без карты из редактора.'}
          </div>
        )}
      </div>

      <div className={`${styles.glassCell} ${styles.lobbyHistorical}`}>
        <p className={styles.cellLabel}>Историческая справка</p>
        <div className={styles.lobbyHistoricalPhotos} aria-label="Иллюстрации к справке">
          <div className={styles.lobbyHistoryPhotoSlot}>
            {photo0 ? <img src={photo0} alt="" /> : <span className={styles.lobbyHistoryPhotoPlaceholder}>Фото 1</span>}
          </div>
          <div className={styles.lobbyHistoryPhotoSlot}>
            {photo1 ? <img src={photo1} alt="" /> : <span className={styles.lobbyHistoryPhotoPlaceholder}>Фото 2</span>}
          </div>
        </div>
        <div className={styles.cellBody}>{historyText}</div>
      </div>
    </main>
  );
};

export default LobbyMissionPanels;

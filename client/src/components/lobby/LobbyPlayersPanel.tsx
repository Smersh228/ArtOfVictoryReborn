import React from 'react';
import Button from '../Button';
import styles from '../../pages/styleModules/lobby.module.css';
import type { RoomMember } from '../../api/rooms';

interface LobbyPlayersPanelProps {
  lobbyError: string | null;
  members: RoomMember[];
  factionLabel: (f: string | undefined) => string;
  readyLabel: (ready: boolean) => string;
  youAreHost: boolean;
  selfReady: boolean;
  canToggleReady: boolean;
  canStartBattle: boolean;
  canLobbyAction: boolean;
  startBattleHint: string;
  onToggleReady: () => void;
  onStartBattle: () => void;
  onToggleFaction: () => void;
}

const LobbyPlayersPanel: React.FC<LobbyPlayersPanelProps> = ({
  lobbyError,
  members,
  factionLabel,
  readyLabel,
  youAreHost,
  selfReady,
  canToggleReady,
  canStartBattle,
  canLobbyAction,
  startBattleHint,
  onToggleReady,
  onStartBattle,
  onToggleFaction,
}) => {
  return (
    <aside className={styles.lobbyLeft}>
      <section className={styles.lobbyPlayers} aria-label="Игроки">
        <h2 className={styles.sectionTitle}>Игроки</h2>
        <div className={styles.playerList}>
          {lobbyError ? (
            <p className={styles.playerListError}>{lobbyError}</p>
          ) : members.length === 0 ? (
            <p className={styles.playerPlaceholder}>Загрузка списка…</p>
          ) : (
            <ul className={styles.playerRows}>
              {members.map((m) => (
                <li key={m.key} className={styles.playerRow}>
                  <span className={styles.playerRowName}>{m.label}</span>
                  <span className={styles.playerRowFaction}>{factionLabel(m.faction)}</span>
                  <span className={styles.playerRowReady}>{readyLabel(m.ready)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className={styles.lobbyButtonRow}>
        {!youAreHost && (
          <Button
            name={selfReady ? 'Не готов' : 'Готов'}
            size={200}
            onClick={onToggleReady}
            disabled={!canToggleReady}
          />
        )}
        {youAreHost && (
          <Button
            name="В бой"
            size={200}
            disabled={!canStartBattle}
            title={startBattleHint || undefined}
            onClick={onStartBattle}
          />
        )}
        <Button
          name="Смена фракции"
          size={200}
          onClick={onToggleFaction}
          disabled={!canLobbyAction}
        />
      </div>
    </aside>
  );
};

export default LobbyPlayersPanel;

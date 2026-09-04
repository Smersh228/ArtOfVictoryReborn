import React from 'react';
import Button from '../Button';
import { resolveEditorImageUrl } from '../../api/editorCatalog';
import {
  formatBattleAirDesantLine,
  type AirSupportReadinessStatus,
  type BattleAirSupportUnitRow,
  isAirUnitOnRecallableMission,
  AIR_SUPPORT_READINESS_LABELS,
} from '../../game/battleAirSupport';
import { findUnitCellByInstanceId } from '../../game/battleMovePreview';
import { unitStatsRowsForTip } from '../../game/battleUnitStatsTip';
import type { LobbyFaction } from '../../api/rooms';
import type { Cell } from '../../../../server/src/game/gameLogic/cells/cell';
import {
  formatBattleTechCargoLine,
  formatBattleUnitFactionLabel,
  readBattleUnitOrdersFromPayload,
} from '../../pages/battlePageUtils';
import BattleUnitOrdersInner, {
  type BattleUnitOrdersDeps,
  type BattleUnitOrdersInnerUnit,
} from './BattleUnitOrdersInner';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleAirSupportPanelProps {
  open: boolean;
  onClose: () => void;
  units: BattleAirSupportUnitRow[];
  cells: Cell[];
  standardPanelStyle?: React.CSSProperties;
  onHoverAirSupportRow?: (row: { cellId: number; instanceId: number } | null) => void;
  readonlyBattle: boolean;
  viewerBattleFaction: LobbyFaction;
  unitIsMineOnMap: (unit: Record<string, unknown>, viewerFaction: LobbyFaction) => boolean;
  airSupportReadiness: Partial<Record<number, AirSupportReadinessStatus>>;
  onRecallAir?: (instanceId: number) => void;
  ordersDeps: BattleUnitOrdersDeps;
}

function airTypeLabel(type: string): string {
  if (type === 'lightAir') return 'Малая авиация';
  if (type === 'heavyAir') return 'Большая авиация';
  return type;
}

function statRow(key: string, val: string, rk: string) {
  return (
    <div key={rk} className={styles.airSupportUnitStatRow}>
      <span className={styles.airSupportUnitStatKey}>{key}</span>
      <span className={styles.airSupportUnitStatVal}>{val}</span>
    </div>
  );
}

const BattleAirSupportPanel: React.FC<BattleAirSupportPanelProps> = ({
  open,
  onClose,
  units,
  cells,
  standardPanelStyle,
  onHoverAirSupportRow,
  readonlyBattle,
  viewerBattleFaction,
  unitIsMineOnMap,
  airSupportReadiness,
  onRecallAir,
  ordersDeps,
}) => {
  if (!open) return null;

  return (
    <aside
      className={`${styles.leftMenuPanel} ${styles.leftMenuPanelStandard}`}
      style={standardPanelStyle}
      aria-label="Авиаподдержка"
    >
      <header className={styles.leftMenuHeader}>
        <div className={styles.leftMenuTitles}>
          <h2 className={styles.leftMenuTitle}>Авиаподдержка</h2>
        </div>
        <div className={styles.airSupportHeaderActions}>
          <Button name="Закрыть" size={200} onClick={onClose} />
        </div>
      </header>
      <div className={styles.leftMenuBody}>
        {!units.length ? (
          <p className={styles.leftMenuText}>На карте миссии нет отмеченной авиации.</p>
        ) : (
          <ul
            className={styles.airSupportList}
            onMouseLeave={() => onHoverAirSupportRow?.(null)}
          >
            {units.map((u) => {
              const src = resolveEditorImageUrl(u.imagePath);
              const live = findUnitCellByInstanceId(cells, u.instanceId);
              const unit = (live?.unit ?? null) as Record<string, unknown> | null;
              const displayName =
                (typeof unit?.name === 'string' && unit.name.trim()) || u.name.trim() || `Юнит ${u.instanceId}`;
              const factionLabel = formatBattleUnitFactionLabel((unit ?? { faction: u.faction }) as Record<string, unknown>);
              const cargoLine = unit ? formatBattleTechCargoLine(unit) : null;
              const desantLine = unit ? formatBattleAirDesantLine(unit) : null;
              const statRows = unit
                ? unitStatsRowsForTip(unit).filter((r) => r.key !== 'Боезапас')
                : [];

              const readiness: AirSupportReadinessStatus = airSupportReadiness[u.instanceId] ?? 'ready';
              const readinessLabel = AIR_SUPPORT_READINESS_LABELS[readiness];
              const readyForOrders = readiness === 'ready';

              const canPickOrdersBase =
                !readonlyBattle &&
                Boolean(live) &&
                Boolean(unit) &&
                unitIsMineOnMap(unit as Record<string, unknown>, viewerBattleFaction) &&
                readBattleUnitOrdersFromPayload(unit as Record<string, unknown>).length > 0;

              const hasOrders = canPickOrdersBase && readyForOrders;

              return (
                <li
                  key={u.instanceId}
                  className={`${styles.airSupportRow} ${styles.airSupportRowStatic}`}
                  onMouseEnter={() => onHoverAirSupportRow?.({ cellId: u.cellId, instanceId: u.instanceId })}
                  aria-label={`${displayName}, ${readinessLabel}`}
                >
                  <div className={styles.airSupportRowHead}>
                    <div className={styles.airSupportIcon}>
                      {src ? (
                        <img src={src} alt="" width={48} height={48} />
                      ) : (
                        <span className={styles.airSupportIconFallback} aria-hidden>
                          ✈
                        </span>
                      )}
                    </div>
                    <div className={styles.airSupportMeta}>
                      <div className={styles.airSupportName}>{displayName}</div>
                      <div
                        className={styles.airSupportReadinessBadge}
                        data-ready={readiness === 'ready' ? 'true' : 'false'}
                        data-status={readiness}
                      >
                        {readinessLabel}
                      </div>
                      {!live ? (
                        <div className={styles.airSupportWarning}>Юнит не найден на текущем поле боя</div>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.airSupportUnitStats}>
                    {statRow('Тип', airTypeLabel(u.type), 'type')}
                    {statRow('Фракция', factionLabel, 'fac')}
                    {cargoLine != null ? statRow('В кузове', cargoLine, 'cargo') : null}
                    {desantLine != null ? statRow('Десантники', desantLine, 'desant') : null}
                    {!unit ? (
                      statRow('Данные боя', 'Нет снимка юнита на клетке', 'nodata')
                    ) : (
                      statRows.map((row) => statRow(row.key, row.val, row.key))
                    )}
                  </div>
                  {canPickOrdersBase && !readyForOrders ? (
                    <div className={styles.airSupportNotReadyHint}>
                      {readiness === 'airborne'
                        ? 'Самолёт в небе, приказы недоступны.'
                        : 'Приказы недоступны: дождитесь статуса «Готовность к вылету».'}
                    </div>
                  ) : null}
                  {live && unit && isAirUnitOnRecallableMission(unit) && onRecallAir ? (
                    <div className={styles.airSupportRecallRow}>
                      <Button
                        name="Отменить задание"
                        size={200}
                        onClick={() => onRecallAir(u.instanceId)}
                      />
                    </div>
                  ) : null}
                  {hasOrders && live && unit ? (
                    <div
                      className={styles.airSupportEmbeddedPanel}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="group"
                      aria-label={`Приказы: ${displayName}`}
                    >
                      <div className={styles.airSupportEmbeddedOrdersTitle}>Приказы</div>
                      <BattleUnitOrdersInner
                        {...ordersDeps}
                        layout="airEmbedded"
                        unit={unit as BattleUnitOrdersInnerUnit}
                        cell={live.cell}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default BattleAirSupportPanel;

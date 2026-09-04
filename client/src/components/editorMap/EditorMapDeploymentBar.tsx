import React from 'react'
import styles from '../../pages/styleModules/editorMap.module.css'
import { teamSideLabel, teamsForLimit } from '../../game/editorMapTeam'
import {
  teamDeployPool,
  teamDeployZoneCount,
  type EditorDeploymentState,
} from '../../game/editorMapDeployment'

interface EditorMapDeploymentBarProps {
  teamLimit: 2 | 4 | 6
  brushTeam: number
  onBrushTeam: (team: number) => void
  deployment: EditorDeploymentState
  onOpenPoolModal: () => void
  onClearZone: () => void
}

const EditorMapDeploymentBar: React.FC<EditorMapDeploymentBarProps> = ({
  teamLimit,
  brushTeam,
  onBrushTeam,
  deployment,
  onOpenPoolModal,
  onClearZone,
}) => {
  const pool = teamDeployPool(deployment, brushTeam)
  const poolCount = pool.unitIds.length + pool.structureIds.length
  const zoneCount = teamDeployZoneCount(deployment, brushTeam)

  return (
    <div className={styles.deploymentBar}>
      <p className={styles.deploymentHint}>
        Пустой клик красит зону команды. Юниты и сооружения — через «Список пула».
      </p>
      <div className={styles.deploymentBrushLabel}>Кисть команды</div>
      <div className={styles.filterRow}>
        {teamsForLimit(teamLimit).map((team) => (
          <div
            key={team}
            className={`${styles.filterItem} ${brushTeam === team ? styles.active : ''}`}
            onClick={() => onBrushTeam(team)}
          >
            {team} {teamSideLabel(team)}
            {teamDeployZoneCount(deployment, team) > 0
              ? ` · ${teamDeployZoneCount(deployment, team)}`
              : ''}
          </div>
        ))}
      </div>
      <div className={styles.deploymentActions}>
        <button type="button" className={styles.deploymentActionBtn} onClick={onOpenPoolModal}>
          Список пула
          {poolCount > 0 ? ` (${poolCount})` : ''}
        </button>
        <button
          type="button"
          className={styles.deploymentActionBtnGhost}
          onClick={onClearZone}
          disabled={zoneCount === 0}
        >
          Очистить зону
        </button>
      </div>
    </div>
  )
}

export default EditorMapDeploymentBar

import React, { useMemo, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import styles from '../../pages/styleModules/editorMap.module.css'
import { resolveEditorImageUrl } from '../../api/editorCatalog'
import { factionForTeam, isWehrmachtFaction, teamSideLabel, teamsForLimit } from '../../game/editorMapTeam'
import {
  EDITOR_MAP_FORTIFICATIONS,
  type CatalogFortification,
} from '../../game/editorMapFortifications'
import {
  catalogBuildingStructureId,
  poolCopyCount,
  teamDeployPool,
  type EditorDeploymentState,
} from '../../game/editorMapDeployment'

type CatalogUnit = {
  id: number
  name: string
  type: string
  faction: string
  imagePath: string
}

type CatalogBuilding = {
  id: string
  dbId: number
  name: string
  imagePath: string
}

type PoolTab = 'units' | 'structures'

interface EditorMapDeploymentModalProps {
  isOpen: boolean
  onClose: () => void
  teamLimit: 2 | 4 | 6
  team: number
  onTeam: (team: number) => void
  deployment: EditorDeploymentState
  catalogUnits: CatalogUnit[]
  catalogBuildings: CatalogBuilding[]
  onAddUnit: (unitId: number) => void
  onRemoveUnit: (unitId: number) => void
  onAddStructure: (structureId: string) => void
  onRemoveStructure: (structureId: string) => void
}

const EditorMapDeploymentModal: React.FC<EditorMapDeploymentModalProps> = ({
  isOpen,
  onClose,
  teamLimit,
  team,
  onTeam,
  deployment,
  catalogUnits,
  catalogBuildings,
  onAddUnit,
  onRemoveUnit,
  onAddStructure,
  onRemoveStructure,
}) => {
  const [poolTab, setPoolTab] = useState<PoolTab>('units')
  const pool = teamDeployPool(deployment, team)
  const unitsForTeam = useMemo(() => {
    const ussr = factionForTeam(team) === 'ussr'
    return catalogUnits.filter((u) =>
      ussr ? String(u.faction).toLowerCase() === 'ussr' : isWehrmachtFaction(u.faction),
    )
  }, [catalogUnits, team])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Юниты для расстановки"
      subtitle="Добавьте несколько экземпляров одного юнита или сооружения — плюс и минус на карточке"
      footer={
        <div className={styles.modalFooterActionsCenter}>
          <Button name="Готово" onClick={onClose} />
        </div>
      }
    >
      <div className={styles.deployModalTeamRow}>
        {teamsForLimit(teamLimit).map((t) => (
          <div
            key={t}
            className={`${styles.filterItem} ${team === t ? styles.active : ''}`}
            onClick={() => onTeam(t)}
          >
            {t} {teamSideLabel(t)}
          </div>
        ))}
      </div>
      <div className={styles.deployModalTabs}>
        <div
          className={`${styles.filterItem} ${poolTab === 'units' ? styles.active : ''}`}
          onClick={() => setPoolTab('units')}
        >
          Юниты ({unitsForTeam.reduce((n, u) => n + poolCopyCount(pool.unitIds, u.id), 0)})
        </div>
        <div
          className={`${styles.filterItem} ${poolTab === 'structures' ? styles.active : ''}`}
          onClick={() => setPoolTab('structures')}
        >
          Сооружения ({pool.structureIds.length})
        </div>
      </div>
      <div className={styles.deployModalGrid}>
        {poolTab === 'units' &&
          unitsForTeam.map((unit) => {
            const count = poolCopyCount(pool.unitIds, unit.id)
            const src = resolveEditorImageUrl(unit.imagePath) ?? unit.imagePath
            return (
              <div
                key={unit.id}
                className={`${styles.objectItem} ${count > 0 ? styles.selected : ''}`}
              >
                <div className={styles.objectIcon}>
                  <img width={50} height={50} src={src} alt={unit.name} />
                </div>
                <div className={styles.objectName}>{unit.name}</div>
                <div className={styles.deployQtyRow}>
                  <button
                    type="button"
                    className={styles.deployQtyBtn}
                    disabled={count <= 0}
                    onClick={() => onRemoveUnit(unit.id)}
                    aria-label="Убрать"
                  >
                    −
                  </button>
                  <span className={styles.deployQtyValue}>{count}</span>
                  <button
                    type="button"
                    className={styles.deployQtyBtn}
                    onClick={() => onAddUnit(unit.id)}
                    aria-label="Добавить"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        {poolTab === 'structures' && (
          <>
            {EDITOR_MAP_FORTIFICATIONS.map((f: CatalogFortification) => {
              const count = poolCopyCount(pool.structureIds, f.id)
              return (
                <div
                  key={f.id}
                  className={`${styles.objectItem} ${count > 0 ? styles.selected : ''}`}
                >
                  <div
                    className={`${styles.objectIcon} ${styles.objectIconBuild}${
                      f.iconVariant === 'wire' ? ` ${styles.objectIconBuildWire}` : ''
                    }`}
                  >
                    <img src={f.imagePath} alt={f.name} />
                  </div>
                  <div className={styles.objectName}>{f.name}</div>
                  <div className={styles.deployQtyRow}>
                    <button
                      type="button"
                      className={styles.deployQtyBtn}
                      disabled={count <= 0}
                      onClick={() => onRemoveStructure(f.id)}
                      aria-label="Убрать"
                    >
                      −
                    </button>
                    <span className={styles.deployQtyValue}>{count}</span>
                    <button
                      type="button"
                      className={styles.deployQtyBtn}
                      onClick={() => onAddStructure(f.id)}
                      aria-label="Добавить"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
            {catalogBuildings.map((b) => {
              const sid = catalogBuildingStructureId(b.dbId)
              const count = poolCopyCount(pool.structureIds, sid)
              const src = resolveEditorImageUrl(b.imagePath) ?? b.imagePath
              return (
                <div
                  key={b.id}
                  className={`${styles.objectItem} ${count > 0 ? styles.selected : ''}`}
                >
                  <div className={styles.objectIcon}>
                    <img width={50} height={50} src={src} alt={b.name} />
                  </div>
                  <div className={styles.objectName}>{b.name}</div>
                  <div className={styles.deployQtyRow}>
                    <button
                      type="button"
                      className={styles.deployQtyBtn}
                      disabled={count <= 0}
                      onClick={() => onRemoveStructure(sid)}
                      aria-label="Убрать"
                    >
                      −
                    </button>
                    <span className={styles.deployQtyValue}>{count}</span>
                    <button
                      type="button"
                      className={styles.deployQtyBtn}
                      onClick={() => onAddStructure(sid)}
                      aria-label="Добавить"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </Modal>
  )
}

export default EditorMapDeploymentModal

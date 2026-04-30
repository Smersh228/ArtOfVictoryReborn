import React from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'

interface UnitMenuUnit {
  name?: string
  instanceId?: string | number
}

interface UnitMenuState {
  x: number
  y: number
  unit: UnitMenuUnit
  cell: Cell
}

interface CellMenuState {
  x: number
  y: number
  cell: Cell
}

interface CellContextMenusProps {
  mode: 'editor' | 'battle'
  lobbyPreview: boolean
  unitMenu: UnitMenuState | null
  cellMenu: CellMenuState | null
  onDeleteUnit: () => void
}

function formatUnitMeta(unit: UnitMenuUnit) {
  return `ID юнит: ${unit.instanceId ?? '—'}`
}

const CellContextMenus: React.FC<CellContextMenusProps> = ({
  mode,
  lobbyPreview,
  unitMenu,
  cellMenu,
  onDeleteUnit,
}) => {
  if (!(mode === 'editor' && !lobbyPreview)) {
    return null
  }

  let unitMenuView: React.ReactNode = null
  if (unitMenu) {
    unitMenuView = (
      <div
        style={{
          position: 'absolute',
          top: unitMenu.y,
          left: unitMenu.x,
          transform: 'translate(-50%, 0)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          padding: '4px 0',
          minWidth: '160px',
          zIndex: 1000,
          border: '1px solid #ddd',
          color: '#333',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #eee',
            fontWeight: 'bold',
            fontSize: '13px',
            backgroundColor: '#f8f8f8',
          }}
        >
          {unitMenu.unit.name || 'Юнит'}
        </div>
        <div
          style={{
            padding: '4px 12px 6px',
            borderBottom: '1px solid #eee',
            fontSize: '12px',
            fontWeight: 600,
            color: '#1565c0',
            backgroundColor: '#f8f8f8',
          }}
        >
          {formatUnitMeta(unitMenu.unit)}
        </div>

        <div style={{ padding: '4px 0' }}>
          <div
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#d32f2f',
            }}
            onClick={onDeleteUnit}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fff3f5')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>Удалить юнит</span>
          </div>
        </div>
      </div>
    )
  }

  let cellMenuView: React.ReactNode = null
  if (cellMenu) {
    cellMenuView = (
      <div
        style={{
          position: 'absolute',
          top: cellMenu.y,
          left: cellMenu.x,
          transform: 'translate(-50%, 0)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          padding: '4px 0',
          minWidth: '160px',
          zIndex: 1000,
          border: '1px solid #ddd',
          color: '#333',
        }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #eee',
            fontWeight: 'bold',
            fontSize: '13px',
            backgroundColor: '#f8f8f8',
          }}
        >
          Клетка
        </div>
        <div
          style={{
            padding: '8px 12px',
            fontWeight: 'bold',
            fontSize: '15px',
            color: '#000000',
          }}
        >
          ID: {cellMenu.cell.id}
        </div>
      </div>
    )
  }

  return (
    <div>
      {unitMenuView}
      {cellMenuView}
    </div>
  )
}

export default CellContextMenus

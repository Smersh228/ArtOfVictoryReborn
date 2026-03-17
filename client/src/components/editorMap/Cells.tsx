import React, { useRef, useEffect, useState } from 'react'
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'

interface CellsProps {
  cells: Cell[]
  width: number 
  height: number
  cellSize: number
  onCellClick?: (cell: Cell) => void
  onUnitDelete?: (unitInstanceId: number, cell: Cell) => void
}

const UNIT_POSITIONS = [
  { x: 0, y: -15 },  
  { x: -15, y: 8 },  
  { x: 15, y: 8 },   
]

const Cells: React.FC<CellsProps> = ({ 
  cells, 
  width, 
  height, 
  cellSize, 
  onCellClick,
  onUnitDelete 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  const [hoveredUnit, setHoveredUnit] = useState<{ cell: Cell, unit: any, index: number } | null>(null)
  const [unitMenu, setUnitMenu] = useState<{ visible: boolean, x: number, y: number, unit: any, cell: Cell } | null>(null)

  const getCellCenter = (q: number, r: number) => {
    const x = cellSize * 1.5 * q + width / 2
    const y = cellSize * (1.732 * r + 0.866 * q) + height / 2
    return { x, y }
  }

  const getCellCorners = (centerX: number, centerY: number) => {
    const corners = []
    for (let i = 0; i < 6; i++) {
      const angle = i * 60 * Math.PI / 180
      corners.push({
        x: centerX + cellSize * Math.cos(angle),
        y: centerY + cellSize * Math.sin(angle)
      })
    }
    return corners
  }

  const isPointInCell = (x: number, y: number, centerX: number, centerY: number) => {
    const dx = x - centerX
    const dy = y - centerY
    return Math.sqrt(dx * dx + dy * dy) < cellSize
  }

  const findCellAtPosition = (mouseX: number, mouseY: number) => {
    for (const cell of cells) {
      const center = getCellCenter(cell.coor.x, cell.coor.z)
      if (isPointInCell(mouseX, mouseY, center.x, center.y)) {
        return cell
      }
    }
    return null
  }

  const findUnitAtPosition = (mouseX: number, mouseY: number) => {
    for (const cell of cells) {
      if (!cell.units?.length) continue
      
      const center = getCellCenter(cell.coor.x, cell.coor.z)
      
      for (let i = 0; i < Math.min(cell.units.length, 3); i++) {
        const unit = cell.units[i]
        const pos = UNIT_POSITIONS[i]
        
        const unitX = center.x + pos.x
        const unitY = center.y + pos.y
        const distance = Math.hypot(mouseX - unitX, mouseY - unitY)
        
        const unitSize = cell.units.length === 1 ? 40 : cell.units.length === 2 ? 35 : 30
        
        if (distance < unitSize / 2) {
          return { cell, unit, index: i }
        }
      }
    }
    return null
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cells.length) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const unitUnderMouse = findUnitAtPosition(x, y)
    
    if (unitUnderMouse) {
      setHoveredUnit(unitUnderMouse)
      setHoverCell(unitUnderMouse.cell)
      if (canvasRef.current) canvasRef.current.style.cursor = 'pointer'
    } else {
      setHoveredUnit(null)
      const cellUnderMouse = findCellAtPosition(x, y)
      setHoverCell(cellUnderMouse)
      if (canvasRef.current) {
        canvasRef.current.style.cursor = cellUnderMouse ? 'pointer' : 'default'
      }
    }
    
    draw()
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const unitUnderMouse = findUnitAtPosition(x, y)
    
    if (unitUnderMouse) {
      e.stopPropagation()
      setUnitMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        unit: unitUnderMouse.unit,
        cell: unitUnderMouse.cell
      })
    } else {
      setUnitMenu(null)
      if (onCellClick) {
        const cell = findCellAtPosition(x, y)
        if (cell) onCellClick(cell)
      }
    }
  }

  const handleDeleteUnit = () => {
    if (unitMenu && onUnitDelete) {
      onUnitDelete(unitMenu.unit.instanceId, unitMenu.cell)
      setUnitMenu(null)
    }
  }

  const drawUnits = (ctx: CanvasRenderingContext2D, cell: Cell, center: { x: number, y: number }) => {
    if (!cell.units?.length) return

    const unitCount = cell.units.length
    const unitSize = unitCount === 1 ? 40 : unitCount === 2 ? 35 : 30
    
    cell.units.slice(0, 3).forEach((unit: any, index: number) => {
      const pos = UNIT_POSITIONS[index]
      const unitX = center.x + pos.x
      const unitY = center.y + pos.y
      
      const isHovered = hoveredUnit?.cell.id === cell.id && hoveredUnit.unit.id === unit.id
      const isMenuOpen = unitMenu?.cell.id === cell.id && unitMenu.unit.id === unit.id

      if (isHovered || isMenuOpen) {
        ctx.shadowColor = 'yellow'
        ctx.shadowBlur = 15
      }
      
      ctx.fillStyle = '#FF6B6B'
      ctx.beginPath()
      ctx.arc(unitX, unitY, unitSize/2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(unit.name?.[0] || 'U', unitX, unitY)
      
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    })

    const extraUnits = cell.units.length - 3
    if (extraUnits > 0) {
      ctx.beginPath()
      ctx.arc(center.x + 20, center.y - 15, 12, 0, 2 * Math.PI)
      ctx.fillStyle = '#ff4444'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.fillStyle = 'white'
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`+${extraUnits}`, center.x + 20, center.y - 15)
    }
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, width, height)

    for (const cell of cells) {
      const center = getCellCenter(cell.coor.x, cell.coor.z)
      const corners = getCellCorners(center.x, center.y)

      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()

      ctx.fillStyle = '#D3D3D3'
      ctx.fill()

      ctx.strokeStyle = 'black'
      ctx.lineWidth = 1
      ctx.stroke()

      if (hoverCell?.id === cell.id && !hoveredUnit) {
        ctx.strokeStyle = 'yellow'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      drawUnits(ctx, cell, center)
    }
  }

  useEffect(() => {
    const handleClickOutside = () => {
      if (unitMenu) setUnitMenu(null)
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [unitMenu])

  useEffect(() => {
    draw()
  }, [cells, hoverCell, hoveredUnit, unitMenu])

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoverCell(null)
          setHoveredUnit(null)
          if (canvasRef.current) canvasRef.current.style.cursor = 'default'
          draw()
        }}
      />
      
      {unitMenu && (
        <div
          style={{
            position: 'fixed',
            top: unitMenu.y,
            left: unitMenu.x,
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            padding: '8px 0',
            minWidth: '180px',
            zIndex: 1000,
            border: '1px solid #ddd',
            color: '#333'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid #eee',
            fontWeight: 'bold',
            fontSize: '14px',
            backgroundColor: '#f8f8f8'
          }}>
            {unitMenu.unit.name || 'Юнит'}
          </div>
          
          <div style={{ padding: '4px 0' }}>
            <div
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                color: '#d32f2f'
              }}
              onClick={handleDeleteUnit}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fff3f5'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>Удалить юнит</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cells
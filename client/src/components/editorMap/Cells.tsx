import React, { useRef, useEffect, useState } from 'react';
import { Cell } from '../../../../server/src/game/gameLogic/cells/cell';

interface Cells {
  cells: Cell[];
  width: number;
  height: number;
  cellSize: number;
  onCellClick?: (cell: Cell) => void;
}

const Cells: React.FC<Cells> = ({ 
  cells, 
  width , 
  height , 
  cellSize ,
  onCellClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);


  const cellPosition = (q: number, r: number) => {
    const x = cellSize * 1.5 * q;
    const y = cellSize * (1.732 * r + 0.866 * q);
    const centerX = width / 2;
    const centerY = height / 2 ;
    return { x: centerX + x, y: centerY + y };
  };
  const getCellAngles = (centerX: number, centerY: number) => {
    const angles = [];
    for (let i = 0; i < 6; i++) {
      const angle = i * 60 * Math.PI / 180;
      angles.push({ x: centerX + cellSize * Math.cos(angle), y: centerY + cellSize * Math.sin(angle)});
    }
    return angles;
  };
  const isCell = (x: number, y: number, centerX: number, centerY: number) => {
    const xCell = x - centerX;
    const yCell = y - centerY;
    return Math.sqrt(xCell * xCell + yCell * yCell) < cellSize;
  };

  const findCell = (mouseX: number, mouseY: number) => {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const center = cellPosition(cell.coor.x, cell.coor.z);
      if (isCell(mouseX, mouseY, center.x, center.y)) {
        return cell;
      }
    }
    return null;
  };

  const draw = () => {


    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);


    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const center = cellPosition(cell.coor.x, cell.coor.z);
      const corners = getCellAngles(center.x, center.y);

      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let j = 1; j < 6; j++) {
        ctx.lineTo(corners[j].x, corners[j].y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1;
      ctx.stroke();

      
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cells.length === 0) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cell = findCell(x, y);
    
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cell ? 'pointer' : 'default';
    }
    
    setHoverCell(cell);
    draw();
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick || cells.length === 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cell = findCell(x, y);
    if (cell) {
      onCellClick(cell);
    }
  };

  useEffect(() => {
    draw();
  }, [cells, hoverCell]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => { setHoverCell(null); if (canvasRef.current) canvasRef.current.style.cursor = 'default'; draw();
        }}
       
      />
      

    </div>
  );
};

export default Cells;
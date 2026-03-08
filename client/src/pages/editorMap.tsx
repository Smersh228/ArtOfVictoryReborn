import React, { useEffect, useState } from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/editorMap.module.css'
import Button from '../components/Button';
import Cells from '../components/editorMap/Cells';
import { Cell } from './../../../server/src/game/gameLogic/cells/cell'
import Modal from '../components/Modal';

const EditorMap: React.FC = () => {
  const [cells, setCells] = useState<Cell[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [widthSize, setWidthSize] = useState(10);
  const [heightSize, setHeightSize] = useState(10);

  const generateEmptyGrid = (width: number, height: number) => {
    const newCells: Cell[] = [];
    let id = 1;
    const left = -Math.floor(width / 2);
    const right = Math.ceil(width / 2) - 1;
    const top = -Math.floor(height / 2);
    const bottom = Math.ceil(height / 2) - 1;
    
    for (let q = left; q <= right; q++) {
      const q_offset = Math.floor(q / 2);
      for (let r = top - q_offset; r <= bottom - q_offset; r++) {
        const s = -q - r;
        newCells.push(new Cell(
          id++,
          'plain',
          [],
          { x: q, y: s, z: r },
          'empty.png',
          0,
          true,
          { infantry: 0, technics: 0 },
          { trench: 0, wire: 0, antiTankBuild: 0, storage: 0, mine: 0, trenchTank: 0, dot: 0, pontonBridge: 0 }
        ));
      }
    }
    
    setCells(newCells);
    setShowModal(false);
  };

  const handleCellClick = (cell: Cell) => {};

  return (
    <div className={styles.editorMap}>
      <div style={{display:'flex'}}>
        <div style={{display:'flex', width:"1400px", justifyContent:"space-between"}}>
          <Button size={280} name='Назад в меню'></Button>
          <Button size={280} name='Сохранить карту'></Button>
          <Button size={280} name='Сгенерировать сетку для карты' onClick={() => setShowModal(true)}></Button>
          <Button size={280} name='Выгрузить карту'></Button>
        </div>
        <div style={{display:'flex', width:"350px", justifyContent:"center", marginLeft:"100px"}}>
          <Button size={280} name='Руководство по редактору карт'></Button>
        </div>
      </div>
      <div style={{display:'flex'}}>
        <div className={styles.editorMainMap}>
          <Cells 
            cells={cells}
            width={1400}
            height={835}
            cellSize={42}
            onCellClick={handleCellClick} 
          />
        </div>
        <div className={styles.editorMapTool}>
        </div>
      </div>
<Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Генерация сетки">
  <div>
    <div>Ширина (5-20):</div>
    <input 
      type="number" 
      min="5" 
      max="20"
      value={widthSize}
      onChange={(e) => setWidthSize(Number(e.target.value))}
    />
  </div>
  <div>
    <div>Высота (5-10):</div>
    <input 
      type="number" 
      min="5" 
      max="10"
      value={heightSize}
      onChange={(e) => setHeightSize(Number(e.target.value))}
    />
  </div>
  <div>
  <Button name="Отмена" onClick={() => setShowModal(false)} />
  <Button name="Создать" onClick={() => generateEmptyGrid(widthSize, heightSize)} />
  </div>
</Modal>
    </div>
  );
};

export default EditorMap;
import React, { useEffect, useState } from 'react'
import MainBlock from '../components/main/MainBlock'
import styles from './styleModules/editorMap.module.css'
import Button from '../components/Button'
import Cells from '../components/editorMap/Cells'
import { Cell } from './../../../server/src/game/gameLogic/cells/cell'
import Modal from '../components/Modal'

const EditorMap: React.FC = () => {
  const [cells, setCells] = useState<Cell[]>([])
  
 
  const [showGridModal, setShowGridModal] = useState<boolean>(false)
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false)
  const [showExportModal, setShowExportModal] = useState<boolean>(false)
  
  const [widthSize, setWidthSize] = useState<number>(10)
  const [heightSize, setHeightSize] = useState<number>(10)
  const [activeTab, setActiveTab] = useState<string>("units")
  const [selectedFaction, setSelectedFaction] = useState<string>("all")
  const [selectedUnitType, setSelectedUnitType] = useState<string>("all")
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [nextInstanceId, setNextInstanceId] = useState<number>(1)

  const [axisCapture, setAxisCapture] = useState({ enabled: false, hexes: "", turns: "", requiredUnits: "1"})
  const [axisElimination, setAxisElimination] = useState({enabled: false, type: "all", specificUnits: ""})

  const [allyTasks, setAllyTasks] = useState("")
  const [axisTasks, setAxisTasks] = useState("")
 
  const [maxTurns, setMaxTurns] = useState("20")

  /*const [weather, setWeather] = useState({fog: false, wind: false})

  const [resources, setResources] = useState({fuel: false, food: false}) */

  const [missionBrief, setMissionBrief] = useState("")
  const [historyText, setHistoryText] = useState("")
  const [photos, setPhotos] = useState<string[]>([])

  const tabs = [
    { id: 'units', label: 'Юниты' },
    { id: 'hexes', label: 'Гексы' },
    { id: 'conditions', label: 'Условия игры' },
    { id: 'scenario', label: 'Сценарий' }
  ]

  const factions = [
    { id: 'all', label: 'Все' },
    { id: 'germany', label: 'Вермахт' },
    { id: 'ussr', label: 'СССР' }
  ]

  const unitTypes = [
    { id: 'all', label: 'Все' },
    { id: 'infantry', label: 'Пехота' },
    { id: 'artillery', label: 'Артиллерия' },
    { id: 'tech', label: 'Техника' },
    { id: 'armor', label: 'Бронетехника' },
    { id: 'lightTank', label: 'Легкие танки' },
    { id: 'mediumTank', label: 'Средние танки' },
    { id: 'heavyTank', label: 'Тяжелые танки' },
    { id: 'lightAir', label: 'Малая авиация' },
    { id: 'heavyAir', label: 'Большая авиация' }
  ]

 const units = [
  /*   {  ВРЕМЕННО
      id: 1, 
      name: 'Немецкая пехота', 
      type: 'infantry', 
      faction: 'germany', 
      imagePath: '/src/img/units/Germany/humans/humans/infanrtyGerman.png'
    },
    { 
      id: 2, 
      name: 'Советская пехота', 
      type: 'infantry', 
      faction: 'ussr', 
      imagePath: '/src/img/units/USSR/humans/infantry/infantryUSSR.png' 
    },
    { 
      id: 3, 
      name: 'T-34', 
      type: 'mediumTank', 
      faction: 'ussr', 
      imagePath: '/src/img/units/USSR/tanks/mediumTanks/t34.png' 
    },
    { 
      id: 4, 
      name: 'Pz-3G', 
      type: 'mediumTank', 
      faction: 'germany',   
      imagePath: '/src/img/units/Germany/tanks/mediumTanks/pz3.png' 
    },
    { 
      id: 5, 
      name: 'Пулемёт максим', 
      type: 'infantry', 
      faction: 'ussr', 
      imagePath: '/src/img/units/USSR/humans/infantry/maxim.png' 
    },*/
  ]

  const hexTypes = [
  //  { id: 'forest', type: "forest", name: "Лес", imagePath: '/src/img/hex/nature/forest.png' }
  ] 

  const generateEmptyGrid = (width: number, height: number) => {
    const newCells: Cell[] = []
    let id = 1
    
    const left = -Math.floor(width / 2)
    const right = Math.ceil(width / 2) - 1
    const top = -Math.floor(height / 2)
    const bottom = Math.ceil(height / 2) - 1
    
    for (let q = left; q <= right; q++) {
      const q_offset = Math.floor(q / 2)
      for (let r = top - q_offset; r <= bottom - q_offset; r++) {
        const s = -q - r
//
        const newCell = new Cell(
          id++,
          'plain', 
          [], 
          { x: q, y: s, z: r },
          '',
          0,
          true,
          { infantry: 0, technics: 0 },
          { trench: 0, wire: 0, antiTankBuild: 0, storage: 0, mine: 0, trenchTank: 0, dot: 0, pontonBridge: 0 }
        )
        
        newCells.push(newCell)
      }
    }
    
    setCells(newCells)
    setShowGridModal(false)
  }

  const handleCellClick = (cell: Cell) => {
    if (!selectedItem) return
    
    setCells(prevCells => 
      prevCells.map(c => {
        if (c.id === cell.id) {
          if (activeTab === 'hexes') {
            return {
              ...c,
              type: selectedItem.type
            }
          }
          if (activeTab === 'units') {
            const currentUnits = c.units || []
            
            if (currentUnits.length >= 3) {
              alert('Нельзя поставить больше 3 юнитов на один гекс!')
              return c
            }
            const newUnit = {
              ...selectedItem,
              instanceId: nextInstanceId,
            }         
            setNextInstanceId(nextInstanceId + 1)
            return {
              ...c,
              units: [...currentUnits, newUnit]
            }
          }
        }
        return c
      })
    )
  }

  const handleUnitDelete = (unitInstanceId: number, cell: Cell) => {
    setCells(prevCells => 
      prevCells.map(c => {
        if (c.id === cell.id && c.units) {
          return {
            ...c,
            units: c.units.filter(u => u.instanceId !== unitInstanceId) // переделать
          }
        }
        return c
      })
    )
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const newPhotos: string[] = []
      for (let i = 0; i < files.length; i++) {
        const url = URL.createObjectURL(files[i])
        newPhotos.push(url)
      }
      setPhotos([...photos, ...newPhotos])
    }
  }

  const removePhoto = (index: number) => {
    const newPhotos = [...photos]
    newPhotos.splice(index, 1)
    setPhotos(newPhotos)
  }



  return (
    <div className={styles.editorMap}>
     
      <div style={{display: 'flex'}}>
        <div style={{display: 'flex', width: '1400px', justifyContent: 'space-between'}}>
          <Button size={280} name='Назад в меню' /> {/*  в будущем*/}
          <Button size={280} name='Сохранить карту' />
          <Button size={280} name='Сгенерировать сетку' onClick={() => setShowGridModal(true)} />
          <Button size={280} name='Выгрузить карту' onClick={() => setShowExportModal(true)} />
        </div>
        <div style={{display: 'flex', width: '350px', justifyContent: 'center', marginLeft: '100px'}}>
          <Button size={280} name='Руководство' onClick={() => setShowGuideModal(true)} />
        </div>
      </div>
      
      {selectedItem && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#333',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>Выбран: {selectedItem.name}</span>
          <button 
            onClick={() => setSelectedItem(null)}
            style={{
              background: 'red',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              borderRadius: '50%',
              width: '20px',
              height: '20px'
            }}
          >
            ✕ 
          </button>
        </div>
      )}

      <div style={{display: 'flex'}}>
        <div className={styles.editorMainMap}>
          <Cells 
            cells={cells}
            width={1400}
            height={835}
            cellSize={42}
            onCellClick={handleCellClick}
            onUnitDelete={handleUnitDelete}
          />
        </div>

        <div className={styles.editorMapTool}>
          <div className={styles.mainTabs}>
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`${styles.mainTab} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => {
                  setActiveTab(tab.id)
                  setSelectedItem(null) 
                }}
              >
                {tab.label}
              </div>
            ))}
          </div>

          <div className={styles.editorUnitFilter}>
            {activeTab === 'units' && (
              <>
                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Фракция</div>
                  <div className={styles.filterRow}>
                    {factions.map(f => (
                      <div key={f.id} className={`${styles.filterItem} ${selectedFaction === f.id ? styles.active : ''}`} onClick={() => setSelectedFaction(f.id)}>
                        {f.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Тип</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {unitTypes.map(type => (
                      <div key={type.id} className={`${styles.filterItem} ${selectedUnitType === type.id ? styles.active : ''}`} onClick={() => setSelectedUnitType(type.id)}>
                        {type.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'conditions' && (
              <>
                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Методы победы (Германия)</div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={axisCapture.enabled}
                        onChange={(e) => {
                          setAxisCapture({
                            ...axisCapture,
                            enabled: e.target.checked
                          })
                          if (e.target.checked) {
                            setAxisElimination({...axisElimination, enabled: false})
                          }
                        }}
                      />
                      Захват области
                    </label>
                    
                    {axisCapture.enabled && (
                      <div style={{ marginLeft: '25px', marginTop: '10px' }}>
                        <div>Гексы (ID):</div>
                        <input type="text" placeholder="5,6,7,8" value={axisCapture.hexes} onChange={(e) => setAxisCapture({...axisCapture, hexes: e.target.value})} style={{ width: '100%', marginBottom: '5px' }} />
                        <div>Ходов для захвата:</div>
                        <input type="number" placeholder="3" value={axisCapture.turns}
                          onChange={(e) => setAxisCapture({...axisCapture, turns: e.target.value})}
                          style={{ width: '100%', marginBottom: '5px' }}
                        />
                        <div>Нужно юнитов:</div>
                        <input type="number" placeholder="2" value={axisCapture.requiredUnits} onChange={(e) => setAxisCapture({...axisCapture, requiredUnits: e.target.value})} style={{ width: '100%' }}/>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" checked={axisElimination.enabled}
                        onChange={(e) => {
                          setAxisElimination({
                            ...axisElimination,
                            enabled: e.target.checked
                          })
                          if (e.target.checked) {
                            setAxisCapture({...axisCapture, enabled: false})
                          }
                        }}
                      />
                      Уничтожение врага
                    </label>
                    
                    {axisElimination.enabled && (
                      <div style={{ marginLeft: '25px', marginTop: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                          <input type="radio" name="axisElimType" checked={axisElimination.type === 'all'}
                            onChange={() => setAxisElimination({...axisElimination, type: 'all'})}
                          /> Все юниты
                        </label>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                          <input type="radio" name="axisElimType" checked={axisElimination.type === 'specific'}
                            onChange={() => setAxisElimination({...axisElimination, type: 'specific'})}
                          /> Определенные юниты
                        </label>
                        
                        {axisElimination.type === 'specific' && (
                          <input type="text" placeholder="ID юнитов" value={axisElimination.specificUnits}
                            onChange={(e) => setAxisElimination({...axisElimination, specificUnits: e.target.value})}
                            style={{ width: '100%', marginTop: '5px' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div style={{  paddingLeft: '10px', marginBottom: '15px' }}>
                    <div style={{ fontWeight: 'bold', color: '#fc0606' }}>ЗАДАЧИ СССР</div>
                    <textarea 
                      value={allyTasks}
                      onChange={(e) => setAllyTasks(e.target.value)}
                      placeholder="Задачи для советских войск..."
                      rows={4}
                      style={{ width: '100%', marginTop: '5px' }}
                    />
                  </div>
                  <div style={{  paddingLeft: '10px' }}>
                    <div style={{ fontWeight: 'bold', color: '#363434' }}>ЗАДАЧИ ГЕРМАНИИ</div>
                    <textarea value={axisTasks} onChange={(e) => setAxisTasks(e.target.value)} placeholder="Задачи для немецких войск..."
                      rows={4}
                      style={{ width: '100%', marginTop: '5px' }}
                    />
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div>Максимальное кол-во ходов для сценария:</div>
                  <input 
                    type="number" 
                    value={maxTurns}
                    onChange={(e) => setMaxTurns(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            )}

            {activeTab === 'scenario' && (
              <>
                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Название миссии</div>
                  <input type="text" value={missionBrief} onChange={(e) => setMissionBrief(e.target.value)}
                    placeholder="Например: Битва за Прохоровку"
                    style={{ width: '100%' }}
                  />
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Историческая справка</div>
                  <textarea value={historyText} onChange={(e) => setHistoryText(e.target.value)} placeholder="Опишите историческое событие..."
                    rows={5}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Фотографии</div>
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*"
                    onChange={handlePhotoUpload}
                  />
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: '5px',
                    marginTop: '10px',
                    minHeight: '100px',
                    border: '1px dashed #ccc',
                    padding: '5px'
                  }}>
                    {photos.map((photo, index) => (
                      <div key={index} style={{ position: 'relative' }}>
                        <img src={photo} style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt={`photo-${index}`} />
                        <button
                          onClick={() => removePhoto(index)}
                          style={{
                            position: 'absolute',
                            top: '0',
                            right: '0',
                            background: 'red',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer'
                          }}
                        >✕</button>
                      </div>
                    ))}
                    {photos.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                        Нет фото
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.objectsBlock}>
            <div className={styles.objectsGrid}>
              {activeTab === 'units' && units
                .filter(u => selectedFaction === 'all' || u.faction === selectedFaction)
                .filter(u => selectedUnitType === 'all' || u.type === selectedUnitType)
                .map(unit => (
                  <div 
                    key={unit.id} 
                    className={`${styles.objectItem} ${selectedItem?.id === unit.id ? styles.selected : ''}`}
                    onClick={() => setSelectedItem(unit)}
                  >
                    <div className={styles.objectIcon}>
                      <img width={50} height={50} src={unit.imagePath} alt={unit.name} />
                    </div>
                    <div className={styles.objectName}>{unit.name}</div>
                  </div>
                ))}
              
              {activeTab === 'hexes' && hexTypes.map(hex => (
                <div 
                  key={hex.id} 
                  className={`${styles.objectItem} ${selectedItem?.id === hex.id ? styles.selected : ''}`}
                  onClick={() => setSelectedItem(hex)}
                >
                  <div className={styles.objectIcon}>
                    <img src={hex.imagePath} alt={hex.name} />
                  </div>
                  <div className={styles.objectName}>{hex.name}</div>
                </div>
              ))}
            </div>
            </div>
        </div>
      </div>

  
      <Modal isOpen={showGridModal} onClose={() => setShowGridModal(false)} title="Генерация сетки">
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
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <Button name='Создать' onClick={() => generateEmptyGrid(widthSize, heightSize)} />
          <Button name="Закрыть" onClick={() => setShowGridModal(false)} />
        </div>
      </Modal>

    
      <Modal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} title="Руководство по редактору">
        1
           <Button name="Закрыть" onClick={() => setShowGridModal(false)} />
      </Modal>

  
<Modal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Выгрузить карту">
  <div style={{ padding: '10px' }}>
    
   
    

 
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px'
    }}>
      <h4 style={{ margin: 0 }}>Сохраненные карты:</h4>
      
    </div>

   
    <div style={{ 
      maxHeight: '300px',
      overflowY: 'auto',
      border: '1px solid #ddd',
      borderRadius: '6px',
      padding: '5px'
    }}>
      <div style={{ 
        textAlign: 'center', 
        padding: '30px 20px',
        color: '#999'
      }}>
    
      </div>
    </div>

   
    <div style={{ 
      display: 'flex', 
      gap: '10px', 
      marginTop: '20px',
      justifyContent: 'center'
    }}>
      <Button 
        name='Выгрузить' 
        onClick={() => {
          console.log('Выгружаем карту')
          setShowExportModal(false)
        }}
      />
      <Button name="Закрыть" onClick={() => setShowExportModal(false)} />
    </div>
  </div>
</Modal>
    </div>
  )
}

export default EditorMap
import React, { useState } from 'react'
import Button from '../components/Button'
import styles from './styleModules/editorUnit.module.css'

const EditorUnit = () => {
  const [activeTab, setActiveTab] = useState<string>("units")
  const [selectedFaction, setSelectedFaction] = useState<string>("all")
  const [selectedUnitType, setSelectedUnitType] = useState<string>("all")
  const [showEditor, setShowEditor] = useState<boolean>(false)
  const [selectedUnit, setSelectedUnit] = useState<any>(null)
  const [selectedOrders, setSelectedOrders] = useState<any>([])
  const [selectedProperties, setSelectedProperties] = useState<any>([])

  const tabs = [
    { id: 'units', label: 'Юниты' },
    { id: 'hexes', label: 'Гексы' },
    { id: 'buildings', label: 'Сооружения' },
    { id: 'rules', label: 'Правила' }
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

  const ordersList = [
   

  ]

  const propertiesList = [
    
  ]

  const chapters = [
    
  ]

  const units = [
   
  ]

  const hexes = [
   
  ]

  const buildings = [
   
  ]

  const rules = [
    
  ]

  const handleAddClick = () => {
   
  }

  const handleUnitClick = (unit) => {
    
  }

  const handleClose = () => {
    
  }

  const toggleOrder = (orderId) => {
    
  }

  const toggleProperty = (propId) => {
   
  }

  return (
    <div className={styles.editorUnit}>
      <div style={{ display: 'flex' }}>
        <Button size={350} name='Назад в меню' />
      </div>

      <div style={{ display: 'flex', height: 'calc(100% - 50px)' }}>
        <div className={styles.editorUnitList}>
          <div className={styles.editorUnitFilter}>
            <div className={styles.mainTabs}>
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className={`${styles.mainTab} ${activeTab === tab.id ? styles.active : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </div>
              ))}
            </div>

            {activeTab === 'units' && (
              <>
                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Фракция</div>
                  <div className={styles.filterRow}>
                    {factions.map(f => (
                      <div
                        key={f.id}
                        className={`${styles.filterItem} ${selectedFaction === f.id ? styles.active : ''}`}
                        onClick={() => setSelectedFaction(f.id)}
                      >
                        {f.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupTitle}>Тип</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {unitTypes.map(type => (
                      <div
                        key={type.id}
                        className={`${styles.filterItem} ${selectedUnitType === type.id ? styles.active : ''}`}
                        onClick={() => setSelectedUnitType(type.id)}
                      >
                        {type.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.editorUnitItems}>
            <div className={styles.addItem} onClick={handleAddClick}>
              <div className={styles.addIcon}>+</div>
              <div>Добавить</div>
            </div>
            
            {activeTab === 'units' && units
              .filter(u => selectedFaction === 'all' || u.faction === selectedFaction)
              .filter(u => selectedUnitType === 'all' || u.type === selectedUnitType)
              .map(unit => (
                <div 
                  key={unit.id} 
                  className={`${styles.unitItem} ${selectedUnit?.id === unit.id ? styles.selected : ''}`}
                  onClick={() => handleUnitClick(unit)}
                >
                  <div className={styles.unitImage}>🪖</div>
                  <div>{unit.name}</div>
                </div>
              ))}

            {activeTab === 'hexes' && hexes.map(item => (
              <div 
                key={item.id} 
                className={`${styles.unitItem} ${selectedUnit?.id === item.id ? styles.selected : ''}`}
                onClick={() => handleUnitClick(item)}
              >
                <div className={styles.unitImage}>🪖</div>
                <div>{item.name}</div>
              </div>
            ))}

            {activeTab === 'buildings' && buildings.map(item => (
              <div 
                key={item.id} 
                className={`${styles.unitItem} ${selectedUnit?.id === item.id ? styles.selected : ''}`}
                onClick={() => handleUnitClick(item)}
              >
                <div className={styles.unitImage}>🪖</div>
                <div>{item.name}</div>
              </div>
            ))}

            {activeTab === 'rules' && rules.map(item => (
              <div 
                key={item.id} 
                className={`${styles.unitItem} ${selectedUnit?.id === item.id ? styles.selected : ''}`}
                onClick={() => handleUnitClick(item)}
              >
                <div className={styles.unitImage}></div>
                <div>{item.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: '1450px' }}>
          {showEditor && (
            <div>
              <div className={styles.editorUnitParametrs} style={ activeTab === "rules" ? {height:"700px", padding: '15px' } : {  padding: '15px' } }>
                
                {activeTab === 'units' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr  1fr 2fr  ', gap: '25px' }}>
                    <div style={{ background: '#3b3b3b52', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ height:"30px", fontSize: '16px', color: '#eeeeee',  textAlign:"center" }}>
                        Основное
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Название</label>
                          <input defaultValue={selectedUnit?.name || ''} style={{ width: '200px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Тип</label>
                          <select style={{ width: '215px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.type || 'infantry'}>
                            {unitTypes.slice(1).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                         <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Фракция</label>
                          <select style={{ width: '215px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.faction || 'germany'}>
                            <option value="germany">Вермахт</option>
                            <option value="ussr">СССР</option>
                          </select>
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Фото юнита</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ width: '40px', height: '40px', background: '#e9ecef', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}></div>
                            <input placeholder="путь к файлу" style={{  width: '100px',  padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                        </div>

                      </div>
                    </div>

                    <div style={{ background: '#3233335d', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{height:"30px", fontSize: '14px', color: '#ffffff',  textAlign:"center" }}>
                        Характеристики
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Численность</label>
                          <input type="number" defaultValue={selectedUnit?.str || 10} style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Защита</label>
                          <input type="number" defaultValue={selectedUnit?.def || 0} style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Очки перемещение</label>
                          <input type="number" defaultValue={selectedUnit?.mov || 0} style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Мораль</label>
                          <input type="number" defaultValue={selectedUnit?.mor || 50} style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Боезапас</label>
                          <input defaultValue={selectedUnit?.ammo || '100'} style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Видимость</label>
                          <input defaultValue={selectedUnit?.vis || '3,2,1'} style={{ width: '100px', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Дальность стрельбы(Месткость)</label>
                          <input defaultValue={selectedUnit?.fire?.range || '1,2,3'} style={{ width: '100px', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#19191a4f', padding: '15px', borderRadius: '8px',display:"grid", gridAutoRows: "30px",gridTemplateColumns:"repeat(2,1fr)"}}>
                      <h4 style={{  fontSize: '14px', color: '#fdfeff',  gridColumnStart:"1",gridRowStart:"1",gridRowEnd:"1",gridColumnEnd:"4",textAlign:'center' }}>
                        Урон/Меткость
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',margin:"15px",textAlign:"center" }}>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Пехота</label>
                          <input defaultValue={selectedUnit?.fire?.inf || '3,5,1,4'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Артиллерия</label>
                          <input defaultValue={selectedUnit?.fire?.art || '2,4,1,3'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Техника</label>
                          <input defaultValue={selectedUnit?.fire?.tech || '1,3,0,2'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                       
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Бронетехника</label>
                          <input defaultValue={selectedUnit?.fire?.armor || '1,2,0,1'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Легкие танки</label>
                          <input defaultValue={selectedUnit?.fire?.lt || '1,2,0,1'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                      </div>
                      <div style={{textAlign:"center", display: 'flex', flexDirection: 'column', gap: '8px',margin:"15px",gridColumnStart:"1",gridRowStart:"2",gridRowEnd:"2",gridColumnEnd:"2" }}>
                        <div >
                           <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Средние танки</label>
                          <input defaultValue={selectedUnit?.fire?.mt || '0,1,0,0'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Тяжелые танки</label>
                          <input defaultValue={selectedUnit?.fire?.ht || '0,0,0,0'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Малая авиация</label>
                          <input defaultValue={selectedUnit?.fire?.sa || '0,1,0,0'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Большая авиация</label>
                          <input defaultValue={selectedUnit?.fire?.ba || '0,0,0,0'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '14px', color: '#f7f6f6', display: 'block', marginBottom: '3px' }}>Строения</label>
                          <input defaultValue={selectedUnit?.fire?.build || '1,3,0,2'} style={{ width: '100%', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

               
                {activeTab === 'hexes' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#1e1e1f2f', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: '#f1f1f1', textAlign: 'center', marginBottom: '15px' }}>
                        Основное
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Название</label>
                          <input defaultValue={selectedUnit?.name || ''} style={{ width: '70%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Изображение гекса</label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ width: '60px', height: '60px', background: '#e9ecef', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}></div>
                            <input placeholder="путь к файлу" style={{  padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Бонус защиты (пехота)</label>
                            <input type="number" defaultValue={selectedUnit?.defBonusInf || 0} style={{ width: '70%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Бонус защиты (техника)</label>
                            <input type="number" defaultValue={selectedUnit?.defBonusTech || 0} style={{ width: '70%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Стоимость перемещения</label>
                            <input type="number" defaultValue={selectedUnit?.moveCost || 1} style={{ width: '70%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Преграда для видимости</label>
                            <select style={{ width: '75%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.visionBlock ? 'yes' : 'no'}>
                              <option value="yes">Да</option>
                              <option value="no">Нет</option>
                            </select>
                          </div>
                          
                        </div>
                        
                      </div>
                      
                    </div>

                    <div style={{ background: '#1e1e1f2d', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: '#f1f1f1', textAlign: 'center', marginBottom: '15px' }}>
                        Разрешенные строения
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        {propertiesList.map(prop => (
                          <div
                            key={prop.id}
                            onClick={() => toggleProperty(prop.id)}
                            style={{
                              padding: '12px',
                              background:"white",
                              border: selectedProperties.includes(prop.id) ? 'solid 2px black' : '',
                              color: selectedProperties.includes(prop.id) ? 'black' : '#333',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              textAlign: 'center',

                            }}
                          >
                            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{prop.icon}</div>
                            <div style={{ fontSize: '11px' }}>{prop.name}</div>
                          </div>
                        ))}
                        
                      </div>
                      
                    </div>
                    
                  </div>
                  
                )}

                {activeTab === 'buildings' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#22222225', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: '#ffffff', textAlign: 'center', marginBottom: '15px' }}>
                        Основное
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Название</label>
                          <input defaultValue={selectedUnit?.name || ''} style={{ width: '70%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Изображение</label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ width: '60px', height: '60px', background: '#e9ecef', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}></div>
                            <input placeholder="путь к файлу" style={{  padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#2c2c2c3d', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: '#ffffff', textAlign: 'center', marginBottom: '15px' }}>
                        Свойства сооружения
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '10px' }}>Бонус к юнитам</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <label style={{ fontSize: '11px', color: '#070707' }}>Пехота</label>
                              <input type="number" defaultValue={selectedUnit?.bonusInf || 0} style={{ width: '70%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', color: '#070707' }}>Техника</label>
                              <input type="number" defaultValue={selectedUnit?.bonusTech || 0} style={{ width: '70%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '10px' }}>Преграда для юнитов</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <label style={{ fontSize: '11px', color: '#070707' }}>Пехота</label>
                              <select style={{ width: '70%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.blockInf ? 'yes' : 'no'}>
                                <option value="yes">Да</option>
                                <option value="no">Нет</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', color: '#080808' }}>Техника</label>
                              <select style={{ width: '70%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.blockTech ? 'yes' : 'no'}>
                                <option value="yes">Да</option>
                                <option value="no">Нет</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'rules' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr ', gap: '20px' }}>
                    <div style={{ background: '#2d2e2e36', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: '#fafafa', textAlign: 'center', marginBottom: '20px' }}>
                        Основное
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Название</label>
                          <input defaultValue={selectedUnit?.title || ''} style={{ width: '300px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Глава</label>
                          <select style={{ width: '300px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} defaultValue={selectedUnit?.chapter || 'movement'}>
                            {chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>Изображение</label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ width: '60px', height: '60px', background: '#e9ecef', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}></div>
                            <input placeholder="путь к файлу" style={{ width: '200px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                          </div>
                        </div>
                        <h4 style={{ fontSize: '16px', color: '#f8f8f8', textAlign: 'center', marginBottom: '15px' }}>
                          Описание
                        </h4>
                        <div>
                          <textarea 
                            defaultValue={selectedUnit?.desc || ''} 
                            style={{ width: '98%', height: '200px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical' }}
                            placeholder="Введите описание правила..."
                          />
                        </div>
                        
                      </div>
                      
                    </div>
                    
                  </div>
                  
                )}
              </div>
             { activeTab !== "units" ?   <div    style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '15px' }}>
                    <Button size={100} name='Сохранить' onClick={handleClose} />
                    <Button size={100} name='Отмена' onClick={handleClose} />
                  </div> : "" }
              {activeTab === 'units' && (
                <div className={styles.editorUnitOrders} style={{    padding: '15px', marginTop: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Приказы</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 100px)', marginBottom: '50px', gap:"10px" , height:"120px" }}>
                    {ordersList.map(order => (
                      <div
                        key={order.id}
                        onClick={() => toggleOrder(order.id)}
                        style={{
                          padding: '5px',
                          background:  '#f4f5f7' ,
                          border: selectedOrders.includes(order.id) ? "" : "solid 2px black" ,
                          color: selectedOrders.includes(order.id) ? 'black' : '#333',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          width:"90px",
                          height:"60px"
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}><img src='../img/orderUnits/ordinaryOrders/moveOrders/move.png'></img></div>
                        <div style={{ fontSize: '12px' }}>{order.name}</div>
                      </div>
                    ))}
                  </div>
               
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Свойства</div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 100px)', marginBottom: '50px', gap:"10px" , height:"120px" }}>
                    {propertiesList.map(prop => (
                      <div
                        key={prop.id}
                        onClick={() => toggleProperty(prop.id)}
                        style={{
                         padding: '5px',
                          background:  '#f4f5f7' ,
                          border: selectedProperties.includes(prop.id) ? "" : "solid 2px black" ,
                          color: selectedProperties.includes(prop.id) ? 'black' : '#333',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          width:"90px",
                          height:"60px"
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{prop.icon}</div>
                        <div style={{ fontSize: '12px' }}>{prop.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab !== 'units' && (
                <div className={styles.editorUnitOrders} style={{  display:"none",marginTop: '10px', overflowY: 'auto', height: '400px' }}>
                  
                  
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditorUnit
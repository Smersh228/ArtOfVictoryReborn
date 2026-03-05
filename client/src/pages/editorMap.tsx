import React from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/editorMap.module.css'
import Button from '../components/Button';

const EditorMap: React.FC = () => {
  //редактор карт будет нужен как удобный инструмент для создания карт(для пользователей и для администрации игры)
  return (
    <div  className={styles.editorMap}  >
      <div style={{display:'flex'}}>
        <div style={{display:'flex',width:"1400px",justifyContent:"space-between"}}>
      <Button size={280} name='Назад в меню'></Button>
      <Button size={280} name='Сохранить карту'></Button>
      <Button size={280} name='Сгенирировать сетку для карты'></Button>
      <Button size={280} name='Выгрузить карту'></Button>
        </div>
        <div style={{display:'flex',width:"350px",justifyContent:"center",marginLeft:"100px"}}>
      <Button size={280} name='Руководство по редактору карт'></Button>
      </div>
      </div>
      <div style={{display:'flex'} }>
      <div className={styles.editorMainMap} >
        

      </div>
      <div className={styles.editorMapTool} >



      </div>
      </div>
    </div>
  );
};

export default EditorMap;
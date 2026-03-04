import React from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/main.module.css'
import Button from '../components/Button';

const EditoMap: React.FC = () => {
  //редактор карт будет нужен как удобный инструмент для создания карт(для пользователей и для администрации игры)
  return (
    <div  className={styles.editorMap}  >
      <div style={{display:'flex'}}>
      <Button name='1'></Button>
      <Button name='1'></Button>
      <Button name='1'></Button>
      <Button name='1'></Button>
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

export default EditoMap;
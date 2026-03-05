import React from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/editorUnit.module.css';
import Button from '../components/Button';

const EditorUnit: React.FC = () => {
  //админская вещь для добавления юнитов в игру
  return (
    <div className={styles.editorUnit}  >
      <div style={{display:"flex"}}>
      <Button name='Назад в меню'></Button>
      </div>
      <div style={{display:"flex"}}>
        <div className={styles.editorUnitList}></div>
        <div>
          <div className={styles.editorUnitParametrs}>

          </div>
          <div  className={styles.editorUnitOrders} >
            
          </div>
        </div>
        </div>
      </div>
     
  );
};

export default EditorUnit;
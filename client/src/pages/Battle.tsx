import React, { useEffect } from 'react';
import styles from './styleModules/battle.module.css'
import Button from '../components/Button';


const Battle: React.FC = () => {

 
  return (
    <div className={styles.battleMain}  >
          <div style={{display:"flex"}}>
            <div><Button size={200} name='Сдаться'></Button></div>
             <div style={{marginLeft:"auto"}}><Button size={200} name='Следующий ход'></Button>
             </div></div>
          <div className={styles.battleMap}> </div>

           <div className={styles.battleButtons}>
          <Button size={200} name='Показать отчёт'></Button> 
           <Button size={200} name='Чат'></Button>
           </div>
    </div>
  );
};

export default Battle;
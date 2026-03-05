import React from 'react';
import styles from '../styleModules/listMain.module.css'
import Button from '../Button';
import Room from './Room';
const ListServer: React.FC = () => {
  
  return (
    <div className={styles.list}  >
      <div className={styles.listName}>Список игровых комнат</div>
      <div>
           <Room></Room>

      </div>
    </div>
  );
};

export default ListServer;
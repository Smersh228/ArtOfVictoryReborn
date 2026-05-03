import React from 'react';
import styles from '../styleModules/createLobby.module.css'
const CreateLobby: React.FC = () => {
  
  return (
  <div className={styles.createLobby}  >
      <div className={styles.createLobbyName}>Создание игровой комнаты</div>
    </div>
  );
};

export default CreateLobby;
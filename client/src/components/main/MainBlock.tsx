import React from 'react';
import styles from '../styleModules/mainBlock.module.css'
import Button from '../Button';
const MainBlock: React.FC = () => {
  
  return (
    <div className={styles.main} >
    <Button name='Сетевая игра'></Button>
    <Button name='Руководство по игре'></Button>
    <Button name='Редактор карт'></Button>
    <Button name='Редактор юнитов'></Button>
    <Button name='Настройки'></Button>
    </div>
  );
};

export default MainBlock;
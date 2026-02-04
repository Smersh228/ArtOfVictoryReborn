import React from 'react';
import MainBlock from '../components/MainBlock';
import styles from './styleModules/main.module.css'
const Main: React.FC = () => {
  
  return (
    <div className={styles.main} >
    <MainBlock></MainBlock>
    </div>
  );
};

export default Main;
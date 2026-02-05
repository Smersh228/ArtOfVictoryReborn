import React from 'react';
import styles from './styleModules/mainBlock.module.css'
import Button from './Button';
const MainBlock: React.FC = () => {
  
  return (
    <div className={styles.main} >
    <Button></Button>
    </div>
  );
};

export default MainBlock;
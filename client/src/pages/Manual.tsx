import React from 'react';
import styles from './styleModules/manual.module.css'
import Button from '../components/Button';


const Manual: React.FC = () => {
  
  return (
    <div className={styles.manual}  >
            <div className={styles.manualName}>Руководство по игре</div>
            <div style={{display:"flex"}}>
                <div className={styles.manualButtons}>
                    <Button size={300} name='Назад в меню'></Button>
                     <Button name=''></Button>
                      <Button name='1'></Button>
                       <Button name='1'></Button>
                        <Button name='1'></Button>
                         <Button name='1'></Button>
                          <Button name='1'></Button>
                          <Button name='1'></Button>

                          <Button name='1'></Button>
                          <Button name='1'></Button>
                        
                           

                </div>
                <div className={styles.manualTutorial}>


                </div>
            </div>
    </div>
  );
};

export default Manual;
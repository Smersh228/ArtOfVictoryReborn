import React from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/main.module.css';
import Button from '../components/Button';

const EditorUnit: React.FC = () => {
  //админская вещь для добавления юнитов в игру
  return (
    <div className={styles.editorUnit}  >
      <div style={{display:"flex"}}>
      <Button name='1'></Button>
      <Button name='1'></Button>
      </div>
      <div>
      <div>


      </div>
     <div>
      <div>


      </div>
      <div>
        
      </div>


     </div>

      </div>
    </div>
  );
};

export default EditorUnit;
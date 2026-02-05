import React from 'react';
import styles from './styleModules/editorMain.module.css'
import Button from './Button';
import MapEditorMain from './mapEditorMain';
import EditorParameters from './editorParameters';

const EditorMain: React.FC = () => {
  


  
  return (
    <div className={styles.main} >
        
       
        <div className={styles.mainHead}> <Button></Button><Button></Button><Button></Button><Button></Button> </div>
        <div className={styles.mainCenter} > <MapEditorMain></MapEditorMain> <EditorParameters></EditorParameters>  </div> 
    </div>
  );
};

export default EditorMain;
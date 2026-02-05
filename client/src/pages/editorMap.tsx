import React from 'react';
import MainBlock from '../components/MainBlock';
import styles from './styleModules/main.module.css'
import EditorMain from '../components/editorMain';
const EditoMap: React.FC = () => {
  
  return (
    <div className={styles.main} >
        <EditorMain></EditorMain>
    </div>
  );
};

export default EditoMap;
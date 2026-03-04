import React from 'react';
import MainBlock from '../components/main/MainBlock';
import styles from './styleModules/main.module.css'
import EditoMap from './editorMap';
import EditorUnit from './editorUnit';
import ListServer from '../components/main/ListServer';
import CreateLobby from '../components/main/CreateLobby';

const Main: React.FC = () => {
  
  return (
    <div style={{display:"flex"}} >
    <MainBlock></MainBlock>
    <ListServer></ListServer>
    <CreateLobby></CreateLobby>
    </div>
  );
};

export default Main;
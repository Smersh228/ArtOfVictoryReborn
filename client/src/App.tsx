import React, { useEffect } from 'react';
import Main from './pages/Main';
import EditorUnit from './pages/editorUnit';
import EditorMap from './pages/editorMap';
import Lobby from './pages/Lobby';

import Battle from './pages/Battle';
import Manual from './pages/Manual';
const App: React.FC = () => {

  useEffect(() => {
   document.body.style.backgroundImage = `url(../src/img/backgrondImage/Menu.jpg)`
     
  },[])
  return (
    <div >
    <Manual></Manual>
    </div>
  );
};

export default App;
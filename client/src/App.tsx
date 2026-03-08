import React, { useEffect,useState } from 'react';
import Main from './pages/Main';
import EditorUnit from './pages/editorUnit';
import EditorMap from './pages/editorMap';
import Lobby from './pages/Lobby';

import Battle from './pages/Battle';
import Manual from './pages/Manual';
import Cells from './components/editorMap/Cells';


import { Cell } from './../../server/src/game/gameLogic/cells/cell';

const App: React.FC = () => {
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    document.body.style.backgroundImage = `url(../src/img/backgrondImage/Menu.jpg)`;
    

  }, []);

  return (
    <div>
     <EditorMap></EditorMap>
    </div>
  );
};


export default App;
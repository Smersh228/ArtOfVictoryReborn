import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Battle from './pages/Battle';
import EditorMap from './pages/editorMap';
import EditorUnit from './pages/editorUnit';
import Main from './pages/Main';
import Lobby from './pages/Lobby';
import Manual from './pages/Manual';
import Auth from './pages/Auth';
import BodyBackground from './components/BodyBackground';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/routing/RequireAuth';
import { RequireGuest } from './components/routing/RequireGuest';
import { RequireCatalogEditorAdmin } from './components/routing/RequireCatalogEditorAdmin';


const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BodyBackground />
        <Routes>
          <Route element={<RequireGuest />}>
            <Route path="/auth" element={<Auth />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/" element={<Navigate to="/main" replace />} />
            <Route path="/main" element={<Main />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/battle" element={<Battle />} />
            <Route path="/editor-map" element={<EditorMap />} />
            <Route path="/editor-unit" element={<RequireCatalogEditorAdmin />}>
              <Route index element={<EditorUnit />} />
            </Route>
            <Route path="/manual" element={<Manual />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
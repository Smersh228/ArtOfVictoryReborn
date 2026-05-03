import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isCatalogEditorAdmin } from '../../utils/catalogEditorAdmin';

export function RequireCatalogEditorAdmin() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="app-route-loading" role="status" aria-live="polite">
        Загрузка…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!isCatalogEditorAdmin(user.username)) {
    return <Navigate to="/main" replace />;
  }
  return <Outlet />;
}

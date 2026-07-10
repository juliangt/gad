import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { ExploreStub } from './pages/ExploreStub';
import { LoginStub } from './pages/LoginStub';
import { RegisterStub } from './pages/RegisterStub';
import { PublicShareStub } from './pages/PublicShareStub';

export const router = createBrowserRouter([
  // Públicas
  { path: '/login', element: <LoginStub /> },
  { path: '/register', element: <RegisterStub /> },
  { path: '/s/:token', element: <PublicShareStub /> },

  // Protegidas
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/explore" replace /> },
      { path: '/explore', element: <ExploreStub /> },
      // El resto de rutas protegidas se añaden en F1-F7.
    ],
  },

  // Admin (placeholder)
  {
    element: <RequireAdmin />,
    children: [
      { path: '/admin', element: <ExploreStub /> },
      { path: '/admin/*', element: <ExploreStub /> },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/explore" replace /> },
]);

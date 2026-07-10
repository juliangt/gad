import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { LoginPage } from './auth/pages/LoginPage';
import { RegisterPage } from './auth/pages/RegisterPage';
import { ForgotPasswordPage } from './auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/pages/ResetPasswordPage';
import { ChangePasswordPage } from './auth/pages/ChangePasswordPage';
import { ExploreStub } from './pages/ExploreStub';
import { PublicShareStub } from './pages/PublicShareStub';
import ProfilePage from './features/users/pages/ProfilePage';
import EditProfilePage from './features/users/pages/EditProfilePage';
import BlockedUsersPage from './features/users/pages/BlockedUsersPage';
import UserPublicPage from './features/users/pages/UserPublicPage';

export const router = createBrowserRouter([
  // Públicas (sin auth)
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/s/:token', element: <PublicShareStub /> },

  // Protegidas (RequireAuth)
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/explore" replace /> },
      { path: '/explore', element: <ExploreStub /> },
      { path: '/me', element: <ProfilePage /> },
      { path: '/me/edit', element: <EditProfilePage /> },
      { path: '/me/blocks', element: <BlockedUsersPage /> },
      { path: '/me/password', element: <ChangePasswordPage /> },
      { path: '/users/:userId', element: <UserPublicPage /> },
      // El resto de rutas protegidas se añaden en F2-F7.
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

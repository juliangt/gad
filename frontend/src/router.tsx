import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { LoginPage } from './auth/pages/LoginPage';
import { RegisterPage } from './auth/pages/RegisterPage';
import { ForgotPasswordPage } from './auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/pages/ResetPasswordPage';
import { ChangePasswordPage } from './auth/pages/ChangePasswordPage';
import { ExploreStub } from './pages/ExploreStub';
import { Spinner } from './components/ui/Spinner';
import ProfilePage from './features/users/pages/ProfilePage';
import EditProfilePage from './features/users/pages/EditProfilePage';
import BlockedUsersPage from './features/users/pages/BlockedUsersPage';
import UserPublicPage from './features/users/pages/UserPublicPage';

const ExplorePage = lazy(() => import('./features/plans/pages/ExplorePage'));
const CreatePlanPage = lazy(() => import('./features/plans/pages/CreatePlanPage'));
const PlanDetailPage = lazy(() => import('./features/plans/pages/PlanDetailPage'));
const ApplicationsPage = lazy(() => import('./features/matching/pages/ApplicationsPage'));
const MyApplicationsPage = lazy(() => import('./features/matching/pages/MyApplicationsPage'));
const MatchesPage = lazy(() => import('./features/matching/pages/MatchesPage'));
const MatchDetailPage = lazy(() => import('./features/matching/pages/MatchDetailPage'));
const TrustedContactsPage = lazy(() =>
  import('./features/safety/pages/TrustedContactsPage'),
);
const SafetyPage = lazy(() => import('./features/safety/pages/SafetyPage'));
const ShareLinkView = lazy(() => import('./features/safety/pages/ShareLinkView'));

function PageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // Públicas (sin auth)
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/s/:token', element: <PageSuspense><ShareLinkView /></PageSuspense> },

  // Protegidas (RequireAuth)
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/explore" replace /> },
      { path: '/explore', element: <PageSuspense><ExplorePage /></PageSuspense> },
      { path: '/plans/new', element: <PageSuspense><CreatePlanPage /></PageSuspense> },
      { path: '/plans/:planId/applications', element: <PageSuspense><ApplicationsPage /></PageSuspense> },
      { path: '/plans/:planId', element: <PageSuspense><PlanDetailPage /></PageSuspense> },
      { path: '/matches', element: <PageSuspense><MatchesPage /></PageSuspense> },
      { path: '/matches/:matchId', element: <PageSuspense><MatchDetailPage /></PageSuspense> },
      { path: '/matches/:matchId/safety', element: <PageSuspense><SafetyPage /></PageSuspense> },
      { path: '/me', element: <ProfilePage /> },
      { path: '/me/edit', element: <EditProfilePage /> },
      { path: '/me/blocks', element: <BlockedUsersPage /> },
      { path: '/me/trusted-contacts', element: <PageSuspense><TrustedContactsPage /></PageSuspense> },
      { path: '/me/applications', element: <PageSuspense><MyApplicationsPage /></PageSuspense> },
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

import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './auth/pages/LoginPage';
import { RegisterPage } from './auth/pages/RegisterPage';
import { ForgotPasswordPage } from './auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/pages/ResetPasswordPage';
import { ChangePasswordPage } from './auth/pages/ChangePasswordPage';
import { PageSuspense } from './components/layout/PageSuspense';
import { MainLayout } from './components/layout/MainLayout';
import ProfilePage from './features/users/pages/ProfilePage';
import EditProfilePage from './features/users/pages/EditProfilePage';
import BlockedUsersPage from './features/users/pages/BlockedUsersPage';
import UserPublicPage from './features/users/pages/UserPublicPage';
import { RequireAdminRoute } from './features/admin/RequireAdminRoute';

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

// F7 — Notifications
const NotificationsPage = lazy(() => import('./features/notifications/pages/NotificationsPage'));

// F7 — Admin
const DashboardPage = lazy(() => import('./features/admin/pages/DashboardPage'));
const ReportsAdminPage = lazy(() => import('./features/admin/pages/ReportsAdminPage'));
const UsersAdminPage = lazy(() => import('./features/admin/pages/UsersAdminPage'));
const ReviewsAdminPage = lazy(() => import('./features/admin/pages/ReviewsAdminPage'));

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
      {
        element: <MainLayout />,
        children: [
          { path: '/', element: <Navigate to="/explore" replace /> },
          { path: '/explore', element: <PageSuspense><ExplorePage /></PageSuspense> },
          { path: '/matches', element: <PageSuspense><MatchesPage /></PageSuspense> },
          { path: '/me', element: <ProfilePage /> },
        ],
      },
      { path: '/plans/new', element: <PageSuspense><CreatePlanPage /></PageSuspense> },
      { path: '/plans/:planId/applications', element: <PageSuspense><ApplicationsPage /></PageSuspense> },
      { path: '/plans/:planId', element: <PageSuspense><PlanDetailPage /></PageSuspense> },
      { path: '/matches/:matchId', element: <PageSuspense><MatchDetailPage /></PageSuspense> },
      { path: '/matches/:matchId/safety', element: <PageSuspense><SafetyPage /></PageSuspense> },
      { path: '/me/edit', element: <EditProfilePage /> },
      { path: '/me/blocks', element: <BlockedUsersPage /> },
      { path: '/me/trusted-contacts', element: <PageSuspense><TrustedContactsPage /></PageSuspense> },
      { path: '/me/applications', element: <PageSuspense><MyApplicationsPage /></PageSuspense> },
      { path: '/me/password', element: <ChangePasswordPage /> },
      { path: '/users/:userId', element: <UserPublicPage /> },
      // F7 — Notifications
      { path: '/notifications', element: <PageSuspense><NotificationsPage /></PageSuspense> },
    ],
  },

  // Admin (F7 — RequireAdminRoute verifica is_admin vía GET /me)
  {
    element: <RequireAdminRoute />,
    children: [
      { path: '/admin', element: <PageSuspense><DashboardPage /></PageSuspense> },
      { path: '/admin/reports', element: <PageSuspense><ReportsAdminPage /></PageSuspense> },
      { path: '/admin/users', element: <PageSuspense><UsersAdminPage /></PageSuspense> },
      { path: '/admin/reviews', element: <PageSuspense><ReviewsAdminPage /></PageSuspense> },
      { path: '/admin/*', element: <Navigate to="/admin" replace /> },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/explore" replace /> },
]);

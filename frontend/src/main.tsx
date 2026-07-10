import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const googleClientId = import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID;

const authedApp = (
  <AuthProvider>
    <App />
    <Toaster position="top-center" richColors closeButton />
  </AuthProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>{authedApp}</GoogleOAuthProvider>
      ) : (
        authedApp
      )}
    </QueryClientProvider>
  </StrictMode>,
);

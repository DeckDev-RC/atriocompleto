import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { ToastProvider } from './components/Toast';
import { DashboardLayout } from './components/DashboardLayout';

// ── Lazy-loaded pages (code splitting) ──────────────
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AgentPage = lazy(() => import('./pages/AgentPage').then(m => ({ default: m.AgentPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading, isMaster } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-body">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }} />
          <p className="text-[13px] text-muted">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="agente" element={<AgentPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          {isMaster && <Route path="admin" element={<AdminPage />} />}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AuthProvider>
          <UserPreferencesProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </UserPreferencesProvider>
        </AuthProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;

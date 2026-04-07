import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { ToastProvider } from './components/Toast';
import { DashboardLayout } from './components/DashboardLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TenantSetupGate } from './components/TenantSetupGate';

// ── Auto-reload handler for deployed chunks ─────────
const lazyWithRetry = (componentImport: () => Promise<{ default: ComponentType<any> }>) =>
  lazy(async () => {
    try {
      const component = await componentImport();
      window.sessionStorage.removeItem('chunk_load_retried');
      return component;
    } catch (error: any) {
      const isChunkError =
        error.name === 'ChunkLoadError' ||
        error.message?.includes('Failed to fetch dynamically') ||
        error.message?.includes('text/html');

      if (isChunkError) {
        const isRetried = window.sessionStorage.getItem('chunk_load_retried');
        if (!isRetried) {
          window.sessionStorage.setItem('chunk_load_retried', 'true');
          window.location.reload();
          return new Promise<{ default: ComponentType<any> }>(() => { }); // Wait for reload
        }
      }
      throw error;
    }
  });

// ── Lazy-loaded pages (code splitting) ──────────────
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AgentPage = lazyWithRetry(() => import('./pages/AgentPage').then(m => ({ default: m.AgentPage })));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const AdminPage = lazyWithRetry(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AccessRequestPage = lazyWithRetry(() => import('./pages/AccessRequestPage').then(m => ({ default: m.AccessRequestPage })));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazyWithRetry(() => import('./pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const InsightsHistoryPage = lazyWithRetry(() => import('./pages/InsightsHistoryPage'));
const PatternDiscoveryPage = lazyWithRetry(() => import('./pages/PatternDiscoveryPage'));
const StrategicReportPage = lazyWithRetry(() => import('./pages/StrategicReportPage'));
const ScheduledReportsPage = lazyWithRetry(() => import('./pages/ScheduledReportsPage'));
const CustomReportsPage = lazyWithRetry(() => import('./pages/CustomReportsPage'));
const CampaignRecommendationsPage = lazyWithRetry(() => import('./pages/CampaignRecommendationsPage'));
const BenchmarkingPage = lazyWithRetry(() => import('./pages/BenchmarkingPage'));
const WhatIfAnalysisPage = lazyWithRetry(() => import('./pages/Simulations/WhatIfAnalysis'));
const PriceCalculatorPage = lazyWithRetry(() => import('./pages/Simulations/PriceCalculator'));
const InventoryOptimizationPage = lazyWithRetry(() => import('./pages/Simulations/InventoryOptimization'));
const ProactiveSuggestionsPage = lazyWithRetry(() => import('./pages/ProactiveSuggestionsPage').then(m => ({ default: m.ProactiveSuggestionsPage })));

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/criar-conta" element={<RegisterPage />} />
          <Route path="/solicitar-acesso" element={<AccessRequestPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/redefinir-senha/:token" element={<ResetPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/verificar-email/:token" element={<VerifyEmailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Rotas de onboarding permitidas mesmo autenticado */}
        <Route path="/verificar-email/:token" element={<VerifyEmailPage />} />
        <Route path="/redefinir-senha/:token" element={<ResetPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        <Route element={<TenantSetupGate />}>
          <Route element={<DashboardLayout />}>
            <Route index element={
              <ProtectedRoute permission="visualizar_venda" featureKey="ecommerce">
                <ErrorBoundary name="Dashboard">
                  <DashboardPage />
                </ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="agente" element={
              <ProtectedRoute permission="acessar_agente" featureKey="optimus">
                <ErrorBoundary name="Agent">
                  <AgentPage />
                </ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="configuracoes" element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            } />
            <Route path="admin" element={
              <ProtectedRoute permission="gerenciar_feature_flags">
                <AdminPage />
              </ProtectedRoute>
            } />
            <Route path="insights" element={
              <ProtectedRoute permission="acessar_agente" featureKey="insights">
                <InsightsHistoryPage />
              </ProtectedRoute>
            } />
            <Route path="analytics/patterns" element={
              <ProtectedRoute permission="acessar_agente" featureKey="padroes">
                <PatternDiscoveryPage />
              </ProtectedRoute>
            } />
            <Route path="estrategia" element={
              <ProtectedRoute permission="acessar_agente" featureKey="estrategia">
                <StrategicReportPage />
              </ProtectedRoute>
            } />
            <Route path="relatorios" element={
              <ProtectedRoute permission="visualizar_relatorios" featureKey="relatorios">
                <ScheduledReportsPage />
              </ProtectedRoute>
            } />
            <Route path="relatorios/customizados" element={
              <ProtectedRoute permission="visualizar_relatorios" featureKey="relatorios">
                <CustomReportsPage />
              </ProtectedRoute>
            } />
            <Route path="campanhas" element={
              <ProtectedRoute permission="acessar_agente" featureKey="campanhas">
                <CampaignRecommendationsPage />
              </ProtectedRoute>
            } />
            <Route path="benchmarking" element={
              <ProtectedRoute permission="acessar_agente" featureKey="benchmarking">
                <BenchmarkingPage />
              </ProtectedRoute>
            } />
            <Route path="simulacoes" element={
              <ProtectedRoute permission="acessar_agente" featureKey="calculadora">
                <WhatIfAnalysisPage />
              </ProtectedRoute>
            } />
            <Route path="simulacoes/precos" element={
              <ProtectedRoute permission="acessar_agente" featureKey="calculadora_precos">
                <PriceCalculatorPage />
              </ProtectedRoute>
            } />
            <Route path="simulacoes/inventory" element={
              <ProtectedRoute permission="acessar_agente" featureKey="estoque_eoq">
                <InventoryOptimizationPage />
              </ProtectedRoute>
            } />
            <Route path="optimus/sugestoes" element={
              <ProtectedRoute permission="acessar_agente" featureKey="sugestoes">
                <ProactiveSuggestionsPage />
              </ProtectedRoute>
            } />
          </Route>
        </Route>

        {/* Fallback para usuários logados */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary name="Root">
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
    </ErrorBoundary>
  );
}

export default App;

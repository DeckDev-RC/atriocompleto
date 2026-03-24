import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { agentApi } from '../services/agentApi';
import type { AuthUser, LoginResult, AuthContextValue } from '../types/auth';
import { isFeatureEnabled } from '../constants/feature-flags';

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'atrio_access_token';
const REFRESH_KEY = 'atrio_refresh_token';
const USER_KEY = 'atrio_user';

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

function normalizeAuthUser(user: Partial<AuthUser> | null | undefined): AuthUser | null {
  if (!user || !user.id || !user.email || !user.full_name || !user.role) {
    return null;
  }

  return {
    ...user,
    tenant_id: user.tenant_id ?? null,
    tenant_name: user.tenant_name ?? null,
    avatar_url: user.avatar_url ?? null,
    permissions: user.permissions || {},
    enabled_features: user.enabled_features || {},
    two_factor_enabled: user.two_factor_enabled || false,
    needs_tenant_setup: user.needs_tenant_setup || false,
  } as AuthUser;
}

function parseStoredUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? normalizeAuthUser(JSON.parse(stored) as Partial<AuthUser>) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(parseStoredUser);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    agentApi.setToken(null);
  }, []);

  const persistSession = useCallback((payload: SessionPayload) => {
    const normalizedUser = normalizeAuthUser(payload.user);
    if (!normalizedUser) return;
    localStorage.setItem(TOKEN_KEY, payload.access_token);
    localStorage.setItem(REFRESH_KEY, payload.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
    agentApi.setToken(payload.access_token);
    setToken(payload.access_token);
    setUser(normalizedUser);
  }, []);

  // Effect for Auth Initialization and URL hash handling
  useEffect(() => {
    // 1. Check for token in URL hash (Supabase redirect)
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('refresh_token='))) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_KEY, refreshToken);
        agentApi.setToken(accessToken);
        setToken(accessToken);

        // Clean up URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    agentApi.setToken(token);
    agentApi.getMe().then((result: any) => {
      if (result.success && result.data) {
        const currentUser = normalizeAuthUser(result.data as Partial<AuthUser>);
        if (!currentUser) {
          clearAuth();
          setIsLoading(false);
          return;
        }
        setUser(currentUser);
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
        setIsLoading(false);
        return;
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        clearAuth();
        setIsLoading(false);
        return;
      }

      agentApi.refreshToken(refreshToken).then((refreshResult: any) => {
        if (!refreshResult.success || !refreshResult.data) {
          clearAuth();
          setIsLoading(false);
          return;
        }

        const refreshed = refreshResult.data as { access_token: string; refresh_token: string };
        localStorage.setItem(TOKEN_KEY, refreshed.access_token);
        localStorage.setItem(REFRESH_KEY, refreshed.refresh_token);
        agentApi.setToken(refreshed.access_token);
        setToken(refreshed.access_token);

        agentApi.getMe().then((meResult: any) => {
          if (meResult.success && meResult.data) {
            const meUser = normalizeAuthUser(meResult.data as Partial<AuthUser>);
            if (meUser) {
              setUser(meUser);
              localStorage.setItem(USER_KEY, JSON.stringify(meUser));
            } else {
              clearAuth();
            }
          } else {
            clearAuth();
          }
          setIsLoading(false);
        });
      });
    });
  }, [clearAuth]);

  // Effect for Global Session Expiration Listener
  useEffect(() => {
    const handleAuthExpired = () => {
      console.log('[AuthContext] Session expired event received');
      clearAuth();
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await agentApi.login(email, password);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Erro ao fazer login' };
    }

    const payload = result.data;
    if ('requires_2fa' in payload && payload.requires_2fa === true) {
      return {
        success: true,
        requires2FA: true,
        challengeId: String(payload.challenge_id || ''),
        email: String(payload.email || ''),
        expiresAt: String(payload.expires_at || ''),
        is_totp: !!payload.is_totp,
      };
    }

    if (
      'access_token' in payload
      && 'refresh_token' in payload
      && 'user' in payload
      && typeof payload.access_token === 'string'
      && typeof payload.refresh_token === 'string'
      && !!payload.user
    ) {
      persistSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        user: payload.user as AuthUser,
      });
      return { success: true, requires2FA: false };
    }

    return { success: false, error: 'Resposta inválida de autenticação' };
  }, [persistSession]);

  const verify2FA = useCallback(async (challengeId: string, code: string) => {
    const result = await agentApi.verify2FA(challengeId, code);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Código inválido' };
    }

    const payload = result.data as {
      access_token: string;
      refresh_token: string;
      user: AuthUser;
    };
    persistSession(payload);
    return { success: true };
  }, [persistSession]);

  const logout = useCallback(async () => {
    try {
      await agentApi.logout();
    } catch (err) {
      console.error('[AuthContext] Error during backend logout:', err);
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const isRefreshing = useRef(false);
  const refreshUser = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      const result = await agentApi.getMe();
      if (result.success && result.data) {
        const currentUser = normalizeAuthUser(result.data as Partial<AuthUser>);
        if (currentUser) {
          setUser(currentUser);
          localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
        }
      }
    } finally {
      isRefreshing.current = false;
    }
  }, []);

  // Keep permissions and feature flags synchronized for long-lived sessions.
  useEffect(() => {
    if (!user || !token) return;

    const apiUrl = import.meta.env.VITE_AGENT_API_URL || '';
    const sseUrl = `${apiUrl}/api/user/events?token=${encodeURIComponent(token)}`;

    let eventSource: EventSource | null = null;
    let sseRecoveryTimer: number | null = null;
    let lastForegroundRefreshAt = 0;

    const scheduleRefresh = (delayMs = 0) => {
      window.setTimeout(() => {
        void refreshUser();
      }, delayMs);
    };

    const scheduleSSERecovery = () => {
      if (sseRecoveryTimer !== null) return;

      sseRecoveryTimer = window.setTimeout(() => {
        sseRecoveryTimer = null;
        void refreshUser();
      }, 3000);
    };

    const clearSSERecovery = () => {
      if (sseRecoveryTimer === null) return;
      window.clearTimeout(sseRecoveryTimer);
      sseRecoveryTimer = null;
    };

    const refreshOnForeground = () => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (now - lastForegroundRefreshAt < 15_000) return;

      lastForegroundRefreshAt = now;
      void refreshUser();
    };

    const setupSSE = () => {
      try {

        eventSource = new EventSource(sseUrl);
        eventSource.addEventListener('connected', clearSSERecovery);

        eventSource.addEventListener('permissions:changed', () => {
          // console.log('[AuthContext] ⚡ EVENT RECEIVED:', e.data);
          // Wait 1 second before refreshing to allow DB consistency and backend cache clearing to settle
          clearSSERecovery();
          scheduleRefresh(1000);
        });



        eventSource.onmessage = () => {
          // generic messages ignored
        };

        eventSource.onerror = () => {
          // EventSource usually handles reconnections, but we log it.
          // Don't log if it was intentional closure
          if (eventSource?.readyState === EventSource.CLOSED) return;
          scheduleSSERecovery();
          console.warn('[AuthContext] ⚠️ SSE Connection status:', eventSource?.readyState);
        };
      } catch (err) {
        console.error('[AuthContext] ❌ SSE Setup Error:', err);
        scheduleSSERecovery();
      }
    };

    setupSSE();

    window.addEventListener('focus', refreshOnForeground);
    document.addEventListener('visibilitychange', refreshOnForeground);

    // Fallback polling every minute in case the browser loses the SSE stream.
    const interval = setInterval(() => {
      void refreshUser();
    }, 60_000);

    return () => {
      if (eventSource) {

        eventSource.close();
      }
      clearSSERecovery();
      window.removeEventListener('focus', refreshOnForeground);
      document.removeEventListener('visibilitychange', refreshOnForeground);
      clearInterval(interval);
    };
  }, [user?.id, token, refreshUser]);

  const hasPermission = useCallback((permission: string) => {
    if (user?.role === 'master') return true;
    return !!user?.permissions?.[permission];
  }, [user]);

  const hasFeature = useCallback((featureKey: string) => {
    if (user?.role === 'master') return true;
    return isFeatureEnabled(featureKey, user?.enabled_features);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    isMaster: user?.role === 'master',
    login,
    verify2FA,
    logout,
    refreshUser,
    hasPermission,
    hasFeature,
  }), [user, isLoading, login, verify2FA, logout, refreshUser, hasPermission, hasFeature]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

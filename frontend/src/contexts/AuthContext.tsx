import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { agentApi } from '../services/agentApi';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'master' | 'user';
  tenant_id: string | null;
  tenant_name: string | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMaster: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'atrio_access_token';
const REFRESH_KEY = 'atrio_refresh_token';
const USER_KEY = 'atrio_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      agentApi.setToken(token);
      // Validate token by calling /me
      agentApi.getMe().then((result) => {
        if (result.success && result.data) {
          const u = result.data as AuthUser;
          setUser(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        } else {
          // Token expired, try refresh
          const refreshToken = localStorage.getItem(REFRESH_KEY);
          if (refreshToken) {
            agentApi.refreshToken(refreshToken).then((r) => {
              if (r.success && r.data) {
                const d = r.data as { access_token: string; refresh_token: string };
                localStorage.setItem(TOKEN_KEY, d.access_token);
                localStorage.setItem(REFRESH_KEY, d.refresh_token);
                agentApi.setToken(d.access_token);
                // Retry /me
                agentApi.getMe().then((meResult) => {
                  if (meResult.success && meResult.data) {
                    setUser(meResult.data as AuthUser);
                    localStorage.setItem(USER_KEY, JSON.stringify(meResult.data));
                  } else {
                    clearAuth();
                  }
                  setIsLoading(false);
                });
              } else {
                clearAuth();
                setIsLoading(false);
              }
            });
            return;
          }
          clearAuth();
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    agentApi.setToken(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await agentApi.login(email, password);
    if (result.success && result.data) {
      const d = result.data as {
        access_token: string;
        refresh_token: string;
        user: AuthUser;
      };
      localStorage.setItem(TOKEN_KEY, d.access_token);
      localStorage.setItem(REFRESH_KEY, d.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      agentApi.setToken(d.access_token);
      setUser(d.user);
      return { success: true };
    }
    return { success: false, error: result.error || 'Erro ao fazer login' };
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);


  const refreshUser = useCallback(async () => {
    const result = await agentApi.getMe();
    if (result.success && result.data) {
      const u = result.data as AuthUser;
      setUser(u);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    isMaster: user?.role === 'master',
    login,
    logout,
    refreshUser,
  }), [user, isLoading, login, logout, refreshUser]);

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

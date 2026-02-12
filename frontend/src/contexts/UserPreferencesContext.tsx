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
import { useAuth } from './AuthContext';

// ── Types ────────────────────────────────────────────────
export interface UserPreferences {
  primary_color: string;
  font_family: string;
  number_locale: string;
  number_decimals: number;
  currency_symbol: string;
}

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  isLoading: boolean;
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

// ── Defaults ─────────────────────────────────────────────
const DEFAULT_PREFERENCES: UserPreferences = {
  primary_color: '#09CAFF',
  font_family: 'DM Sans',
  number_locale: 'pt-BR',
  number_decimals: 2,
  currency_symbol: 'R$',
};

const PREFS_STORAGE_KEY = 'agregar-user-preferences';

// ── Helpers ──────────────────────────────────────────────
function loadFromStorage(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFERENCES };
}

function saveToStorage(prefs: UserPreferences) {
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

/** Aplica as variáveis CSS globalmente */
function applyCSSVariables(prefs: UserPreferences) {
  const root = document.documentElement;
  root.style.setProperty('--color-brand-primary', prefs.primary_color);
  root.style.setProperty('--font-sans', `'${prefs.font_family}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);
}

/** Carrega a fonte do Google Fonts dinamicamente */
function loadGoogleFont(fontFamily: string) {
  const fontId = `google-font-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(fontId)) return; // já carregada

  const encodedFont = encodeURIComponent(fontFamily);
  const link = document.createElement('link');
  link.id = fontId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

// ── Context ──────────────────────────────────────────────
const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(loadFromStorage);
  const [isLoading, setIsLoading] = useState(false);

  // Aplica CSS sempre que preferências mudam
  useEffect(() => {
    applyCSSVariables(preferences);
    loadGoogleFont(preferences.font_family);
    saveToStorage(preferences);
  }, [preferences]);

  // Sincroniza do DB quando autenticado e auth terminou de carregar
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    setIsLoading(true);

    agentApi.getPreferences().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        const merged = { ...DEFAULT_PREFERENCES, ...result.data };
        setPreferences(merged);
        saveToStorage(merged);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [isAuthenticated, authLoading]);

  // Limpa preferências ao deslogar
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setPreferences({ ...DEFAULT_PREFERENCES });
      localStorage.removeItem(PREFS_STORAGE_KEY);
      applyCSSVariables(DEFAULT_PREFERENCES);
    }
  }, [isAuthenticated, authLoading]);

  const updatePreferences = useCallback(async (partial: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...partial };
      saveToStorage(updated);
      applyCSSVariables(updated);
      return updated;
    });

    // Sincroniza com o DB em background
    try {
      await agentApi.updatePreferences(partial);
    } catch (err) {
      console.error('[Preferences] Sync error:', err);
    }
  }, []);

  const resetToDefaults = useCallback(async () => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    saveToStorage(DEFAULT_PREFERENCES);
    applyCSSVariables(DEFAULT_PREFERENCES);

    try {
      await agentApi.updatePreferences(DEFAULT_PREFERENCES);
    } catch (err) {
      console.error('[Preferences] Reset error:', err);
    }
  }, []);

  const value = useMemo<UserPreferencesContextValue>(() => ({
    preferences,
    isLoading,
    updatePreferences,
    resetToDefaults,
  }), [preferences, isLoading, updatePreferences, resetToDefaults]);

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function usePreferences(): UserPreferencesContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('usePreferences deve ser usado dentro de <UserPreferencesProvider>');
  return ctx;
}

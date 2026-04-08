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
import {
  createDefaultPriceCalculatorManagementOverrides,
  normalizePriceCalculatorManagementOverrides,
  type PriceCalculatorManagementOverrides,
} from '../utils/priceCalculator';
import { useAuth } from './AuthContext';

// ── Types ────────────────────────────────────────────────
export interface UserPreferences {
  primary_color: string;
  font_family: string;
  number_locale: string;
  number_decimals: number;
  currency_symbol: string;
  price_calculator_management_overrides: PriceCalculatorManagementOverrides;
}

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  isLoading: boolean;
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}

// ── Defaults ─────────────────────────────────────────────
const DEFAULT_PREFERENCES: UserPreferences = {
  primary_color: '#09CAFF',
  font_family: 'Poppins',
  number_locale: 'pt-BR',
  number_decimals: 2,
  currency_symbol: 'R$',
  price_calculator_management_overrides: createDefaultPriceCalculatorManagementOverrides(),
};

const PREFS_STORAGE_KEY = 'agregar-user-preferences';

// ── Helpers ──────────────────────────────────────────────
function loadFromStorage(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        price_calculator_management_overrides: normalizePriceCalculatorManagementOverrides(
          parsed.price_calculator_management_overrides,
        ),
      };
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
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(loadFromStorage);
  const [isLoading, setIsLoading] = useState(false);

  // Aplica CSS sempre que preferências mudam
  useEffect(() => {
    const effectivePreferences = user?.resolved_branding?.primary_color
      ? { ...preferences, primary_color: user.resolved_branding.primary_color }
      : preferences;

    applyCSSVariables(effectivePreferences);
    loadGoogleFont(effectivePreferences.font_family);
    saveToStorage(preferences);
  }, [preferences, user?.resolved_branding?.primary_color]);

  // Sincroniza do DB quando autenticado e auth terminou de carregar
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    setIsLoading(true);

    agentApi.getPreferences().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        const merged = {
          ...DEFAULT_PREFERENCES,
          ...result.data,
          price_calculator_management_overrides: normalizePriceCalculatorManagementOverrides(
            result.data.price_calculator_management_overrides,
          ),
        };
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
      const updated = {
        ...prev,
        ...partial,
        price_calculator_management_overrides: partial.price_calculator_management_overrides
          ? normalizePriceCalculatorManagementOverrides(partial.price_calculator_management_overrides)
          : prev.price_calculator_management_overrides,
      };
      saveToStorage(updated);
      applyCSSVariables(updated);
      return updated;
    });

    // Sincroniza com o DB em background
    try {
      const result = await agentApi.updatePreferences({
        ...partial,
        price_calculator_management_overrides: partial.price_calculator_management_overrides
          ? normalizePriceCalculatorManagementOverrides(partial.price_calculator_management_overrides)
          : undefined,
      });
      return Boolean(result.success);
    } catch (err) {
      console.error('[Preferences] Sync error:', err);
      return false;
    }
  }, []);

  const resetToDefaults = useCallback(async () => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    saveToStorage(DEFAULT_PREFERENCES);
    applyCSSVariables(DEFAULT_PREFERENCES);

    try {
      const result = await agentApi.updatePreferences(DEFAULT_PREFERENCES);
      return Boolean(result.success);
    } catch (err) {
      console.error('[Preferences] Reset error:', err);
      return false;
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

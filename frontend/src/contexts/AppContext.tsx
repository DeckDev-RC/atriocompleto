import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

interface AppContextValue {
  /* Sidebar mobile */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;

  /* Sidebar collapse (desktop) */
  sidebarCollapsed: boolean;
  toggleSidebarCollapse: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  /* Theme */
  theme: Theme;
  toggleTheme: () => void;
  themeColor: 'blue' | 'pink';
  setThemeColor: (color: 'blue' | 'pink') => void;

  /* Loading */
  loading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const THEME_KEY = 'agregar-theme';
const COLLAPSED_KEY = 'agregar-sidebar-collapsed';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_KEY) === 'true';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialCollapsed);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [loading, setLoading] = useState(true);

  /* Aplica data-theme no <html> */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  /* Theme Color */
  const [themeColor, setThemeColor] = useState<'blue' | 'pink'>(() => {
    if (typeof window === 'undefined') return 'blue';
    return (localStorage.getItem('agregar-theme-color') as 'blue' | 'pink') || 'blue';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme-color', themeColor);
    localStorage.setItem('agregar-theme-color', themeColor);
  }, [themeColor]);

  /* Persiste collapsed */
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  /* Simula carregamento inicial */
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  /* Fecha sidebar overlay ao redimensionar para desktop */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((p) => !p), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebarCollapse = useCallback(
    () => setSidebarCollapsed((p) => !p),
    [],
  );
  const toggleTheme = useCallback(
    () => setTheme((p) => (p === 'light' ? 'dark' : 'light')),
    [],
  );

  const value = useMemo<AppContextValue>(() => ({
    sidebarOpen,
    toggleSidebar,
    closeSidebar,
    sidebarCollapsed,
    toggleSidebarCollapse,
    setSidebarCollapsed,
    theme,
    toggleTheme,
    themeColor,
    setThemeColor,
    loading,
  }), [sidebarOpen, sidebarCollapsed, theme, themeColor, loading, toggleSidebar, closeSidebar, toggleSidebarCollapse, setSidebarCollapsed, toggleTheme, setThemeColor]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de <AppProvider>');
  return ctx;
}

import { useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';

/**
 * Cores reativas para os gráficos baseadas no tema.
 * Light: undertone azul-frio. Dark: undertone azul profundo.
 */
export function useChartColors() {
  const { theme } = useApp();

  return useMemo(() => {
    const isDark = theme === 'dark';
    return {
      gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      mutedColor: isDark ? '#4a4c5e' : '#9498a8',
      secondaryColor: isDark ? '#8b8d9e' : '#545869',
      primaryColor: isDark ? '#e8e9ed' : '#1a1c24',
      darkBarColor: isDark ? '#4a4c5e' : '#3e5d6f',
      accentColor: isDark ? '#4bbdff' : '#38b6ff',
    };
  }, [theme]);
}

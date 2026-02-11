import { useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';

/**
 * Função helper para ler variável CSS de forma reativa
 */
function getCSSVariable(name: string, fallback: string = ''): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;
}

/**
 * Cores reativas para os gráficos baseadas no tema.
 * Light: undertone azul-frio. Dark: undertone azul profundo.
 * 
 * Nota: brandPrimaryColor é lida diretamente da variável CSS a cada render
 * para garantir que mudanças na variável sejam refletidas imediatamente.
 */
export function useChartColors() {
  const { theme } = useApp();

  return useMemo(() => {
    const isDark = theme === 'dark';
    // Ler a variável CSS diretamente (sem cache) para garantir que sempre use o valor atual
    const brandPrimaryColor = getCSSVariable('--color-brand-primary', '#0404A6');
    
    return {
      gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      mutedColor: isDark ? '#4a4c5e' : '#9498a8',
      secondaryColor: isDark ? '#8b8d9e' : '#545869',
      primaryColor: isDark ? '#e8e9ed' : '#1a1c24',
      darkBarColor: isDark ? '#8b8d9e' : '#3e5d6f', // Mais claro no dark mode para ser visível
      accentColor: isDark ? '#4bbdff' : '#38b6ff',
      brandPrimaryColor, // Cor azul principal da variável CSS global (lida a cada render)
      labelColor: isDark ? '#ffffff' : '#1a1c24', // Branco no dark mode, escuro no light mode
    };
  }, [theme]);
}

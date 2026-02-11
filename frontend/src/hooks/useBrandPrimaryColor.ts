import { useState, useEffect } from 'react';

/**
 * Hook para ler e observar mudanças na variável CSS --color-brand-primary
 * Retorna o valor atual da cor e atualiza automaticamente quando a variável muda
 */
export function useBrandPrimaryColor() {
  const getBrandPrimaryColor = (): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--color-brand-primary')
      .trim() || '';
  };

  const [brandPrimaryColor, setBrandPrimaryColor] = useState(() => {
    const initialColor = getBrandPrimaryColor();
    return initialColor || '';
  });

  useEffect(() => {
    const updateColor = () => {
      const color = getBrandPrimaryColor();
      if (color) {
        setBrandPrimaryColor(color);
      }
    };

    updateColor();

    const observer = new MutationObserver(() => {
      updateColor();
    });

    if (typeof window !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-theme'],
        subtree: false,
      });

      const interval = setInterval(updateColor, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, []);

  return brandPrimaryColor;
}

/**
 * Helper para converter cor em rgba com opacidade
 */
export function getBrandPrimaryWithOpacity(color: string, opacity: number): string {
  if (!color) return `rgba(0, 0, 0, ${opacity})`;
  
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`;
  }
  
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  if (color.startsWith('var(')) {
    if (typeof window !== 'undefined') {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(
        color.replace('var(', '').replace(')', '').trim()
      ).trim();
      return getBrandPrimaryWithOpacity(computed, opacity);
    }
  }
  
  return `rgba(0, 0, 0, ${opacity})`;
}

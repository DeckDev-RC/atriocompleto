import { useState, useEffect, useRef } from 'react';

/**
 * Hook para ler e observar mudanças na variável CSS --color-brand-primary.
 * Usa MutationObserver (sem polling) e guarda de igualdade para evitar re-renders.
 */
export function useBrandPrimaryColor() {
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(() => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--color-brand-primary')
      .trim() || '';
  });

  const prevRef = useRef(brandPrimaryColor);

  useEffect(() => {
    const readColor = () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-brand-primary')
        .trim() || '';

    const updateColor = () => {
      const color = readColor();
      if (color && color !== prevRef.current) {
        prevRef.current = color;
        setBrandPrimaryColor(color);
      }
    };

    updateColor();

    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
      subtree: false,
    });

    return () => observer.disconnect();
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

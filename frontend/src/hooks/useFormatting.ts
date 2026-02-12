import { useMemo } from 'react';
import { usePreferences } from '../contexts/UserPreferencesContext';
import {
  formatNumber as fmtNum,
  formatCurrency as fmtCur,
  formatPercent as fmtPct,
  formatInteger as fmtInt,
  type FormattingOptions,
} from '../utils/formatting';

/**
 * Hook que retorna funções de formatação vinculadas às preferências do usuário.
 * Uso: const { formatNumber, formatCurrency, formatPercent } = useFormatting();
 */
export function useFormatting() {
  const { preferences } = usePreferences();

  const opts: FormattingOptions = useMemo(() => ({
    locale: preferences.number_locale,
    decimals: preferences.number_decimals,
    currencySymbol: preferences.currency_symbol,
  }), [preferences.number_locale, preferences.number_decimals, preferences.currency_symbol]);

  return useMemo(() => ({
    formatNumber: (value: number) => fmtNum(value, opts),
    formatCurrency: (value: number) => fmtCur(value, opts),
    formatPercent: (value: number, decimals?: number) => fmtPct(value, { ...opts, decimals }),
    formatInteger: (value: number) => fmtInt(value, opts),
    opts,
  }), [opts]);
}

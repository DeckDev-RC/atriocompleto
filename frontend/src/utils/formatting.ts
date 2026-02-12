/**
 * Utilitários de formatação numérica centralizados.
 *
 * Estas funções usam os parâmetros de preferência do usuário.
 * Para uso dentro de componentes React, prefira o hook `useFormatting()`.
 */

export interface FormattingOptions {
  locale: string;
  decimals: number;
  currencySymbol: string;
}

/** Padrões usados quando não há contexto (ex: backend rendering, testes) */
export const DEFAULT_FORMATTING: FormattingOptions = {
  locale: 'pt-BR',
  decimals: 2,
  currencySymbol: 'R$',
};

/** Formata um número com locale e casas decimais */
export function formatNumber(
  value: number,
  opts: FormattingOptions = DEFAULT_FORMATTING,
): string {
  try {
    return value.toLocaleString(opts.locale, {
      minimumFractionDigits: opts.decimals,
      maximumFractionDigits: opts.decimals,
    });
  } catch {
    return value.toFixed(opts.decimals);
  }
}

/** Formata um valor monetário com símbolo e locale */
export function formatCurrency(
  value: number,
  opts: FormattingOptions = DEFAULT_FORMATTING,
): string {
  const formatted = formatNumber(value, opts);
  return `${opts.currencySymbol} ${formatted}`;
}

/** Formata percentual com locale e casas decimais */
export function formatPercent(
  value: number,
  opts?: Partial<FormattingOptions> & { decimals?: number },
): string {
  const mergedOpts = { ...DEFAULT_FORMATTING, ...opts };
  // Percentuais geralmente usam menos decimais
  const decimals = opts?.decimals ?? Math.min(mergedOpts.decimals, 1);
  const formatted = formatNumber(value, { ...mergedOpts, decimals });
  return `${formatted}%`;
}

/** Formata um inteiro (sem casas decimais) */
export function formatInteger(
  value: number,
  opts: FormattingOptions = DEFAULT_FORMATTING,
): string {
  return formatNumber(value, { ...opts, decimals: 0 });
}

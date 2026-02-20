import { usePreferences } from '../../contexts/UserPreferencesContext';

const LOCALE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)', example: '1.234,56' },
  { value: 'en-US', label: 'English (US)', example: '1,234.56' },
  { value: 'es-ES', label: 'Español (España)', example: '1.234,56' },
];

const DECIMAL_OPTIONS = [0, 1, 2, 3, 4];

const CURRENCY_SUGGESTIONS = ['R$', '$', 'US$', 'EUR', '€', '£'];

export function FormattingSection() {
  const { preferences, updatePreferences } = usePreferences();

  // Gera preview com as configurações atuais
  const formatPreview = (value: number) => {
    try {
      return value.toLocaleString(preferences.number_locale, {
        minimumFractionDigits: preferences.number_decimals,
        maximumFractionDigits: preferences.number_decimals,
      });
    } catch {
      return value.toFixed(preferences.number_decimals);
    }
  };

  const currencyPreview = `${preferences.currency_symbol} ${formatPreview(1234567.89)}`;
  const numberPreview = formatPreview(9876543.21);
  const percentPreview = `${formatPreview(85.7)}%`;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Locale ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Formato regional</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Define o separador de milhar e decimal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {LOCALE_OPTIONS.map((locale) => {
            const isSelected = preferences.number_locale === locale.value;
            return (
              <button
                key={locale.value}
                onClick={() => updatePreferences({ number_locale: locale.value })}
                className={`flex flex-col items-start rounded-xl border px-4 py-2.5 transition-all duration-200 text-left ${isSelected
                    ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5'
                    : 'border-border hover:border-border-strong hover:bg-card'
                  }`}
              >
                <p className="text-[13px] font-medium text-primary">{locale.label}</p>
                <p className="text-[11px] text-muted font-mono">{locale.example}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Casas decimais ─────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Casas decimais</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Quantidade de dígitos após o separador decimal.
          </p>
        </div>
        <div className="flex gap-2">
          {DECIMAL_OPTIONS.map((dec) => {
            const isSelected = preferences.number_decimals === dec;
            return (
              <button
                key={dec}
                onClick={() => updatePreferences({ number_decimals: dec })}
                className={`flex items-center justify-center h-10 w-12 rounded-xl border text-[13px] font-medium transition-all duration-200 ${isSelected
                    ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5 text-(--color-brand-primary)'
                    : 'border-border text-secondary hover:border-border-strong hover:bg-card'
                  }`}
              >
                {dec}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Símbolo de moeda ───────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Símbolo de moeda</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Prefixo usado na exibição de valores monetários.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={preferences.currency_symbol}
            onChange={(e) => updatePreferences({ currency_symbol: e.target.value })}
            maxLength={5}
            className="h-10 w-20 rounded-xl border border-border bg-card px-3 text-[13px] text-center font-medium text-primary focus:border-(--color-brand-primary) focus:outline-none transition-colors duration-200"
          />
          <div className="flex gap-1.5">
            {CURRENCY_SUGGESTIONS.map((symbol) => (
              <button
                key={symbol}
                onClick={() => updatePreferences({ currency_symbol: symbol })}
                className={`h-8 px-3 rounded-lg border text-[12px] font-medium transition-all duration-200 ${preferences.currency_symbol === symbol
                    ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5 text-(--color-brand-primary)'
                    : 'border-border text-muted hover:text-primary hover:bg-card'
                  }`}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Preview ────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h4 className="text-[13.5px] font-semibold text-primary">Preview</h4>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted uppercase tracking-wider font-medium">Moeda</span>
              <span className="text-[16px] font-semibold text-primary font-mono">{currencyPreview}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted uppercase tracking-wider font-medium">Número</span>
              <span className="text-[16px] font-semibold text-primary font-mono">{numberPreview}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted uppercase tracking-wider font-medium">Percentual</span>
              <span className="text-[16px] font-semibold text-primary font-mono">{percentPreview}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

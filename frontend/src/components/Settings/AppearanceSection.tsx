import { Moon, Sun, Check } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { usePreferences } from '../../contexts/UserPreferencesContext';
import { ColorPicker } from './ColorPicker';

const FONT_OPTIONS = [
  { value: 'Poppins', label: 'Poppins', description: 'Padrão — Geométrico e amigável' },
  { value: 'DM Sans', label: 'DM Sans', description: 'Moderno e limpo' },
  { value: 'Inter', label: 'Inter', description: 'Ótimo para dashboards' },
  { value: 'Nunito', label: 'Nunito', description: 'Arredondado e acessível' },
  { value: 'Source Sans 3', label: 'Source Sans 3', description: 'Profissional da Adobe' },
];

export function AppearanceSection() {
  const { theme, toggleTheme } = useApp();
  const { preferences, updatePreferences } = usePreferences();

  return (
    <div className="flex flex-col gap-8">
      {/* ── Cor principal ──────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Cor principal</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Define a cor de destaque do sistema. Use as cores predefinidas, selecione manualmente ou use o conta-gotas.
          </p>
        </div>
        <ColorPicker
          value={preferences.primary_color}
          onChange={(color) => updatePreferences({ primary_color: color })}
        />
      </div>

      {/* ── Tema claro/escuro ──────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Tema</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Alterne entre os modos claro e escuro.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { if (theme === 'dark') toggleTheme(); }}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 ${theme === 'light'
                ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5'
                : 'border-border hover:border-border-strong hover:bg-card'
              }`}
          >
            <Sun size={18} strokeWidth={2} className={theme === 'light' ? 'text-(--color-brand-primary)' : 'text-muted'} />
            <div className="text-left">
              <p className="text-[13px] font-medium text-primary">Claro</p>
              <p className="text-[11px] text-muted">Modo diurno</p>
            </div>
            {theme === 'light' && (
              <Check size={16} className="ml-auto" style={{ color: 'var(--color-brand-primary)' }} />
            )}
          </button>

          <button
            onClick={() => { if (theme === 'light') toggleTheme(); }}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 ${theme === 'dark'
                ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5'
                : 'border-border hover:border-border-strong hover:bg-card'
              }`}
          >
            <Moon size={18} strokeWidth={2} className={theme === 'dark' ? 'text-(--color-brand-primary)' : 'text-muted'} />
            <div className="text-left">
              <p className="text-[13px] font-medium text-primary">Escuro</p>
              <p className="text-[11px] text-muted">Modo noturno</p>
            </div>
            {theme === 'dark' && (
              <Check size={16} className="ml-auto" style={{ color: 'var(--color-brand-primary)' }} />
            )}
          </button>
        </div>
      </div>

      {/* ── Fonte ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-primary">Fonte</h4>
          <p className="text-[12px] text-muted mt-0.5">
            Escolha a família tipográfica usada em todo o sistema.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {FONT_OPTIONS.map((font) => {
            const isSelected = preferences.font_family === font.value;
            return (
              <button
                key={font.value}
                onClick={() => updatePreferences({ font_family: font.value })}
                className={`relative flex flex-col items-start rounded-xl border px-4 py-3 transition-all duration-200 text-left ${isSelected
                    ? 'border-(--color-brand-primary) bg-(--color-brand-primary)/5'
                    : 'border-border hover:border-border-strong hover:bg-card'
                  }`}
              >
                <p
                  className="text-[15px] font-semibold text-primary"
                  style={{ fontFamily: `'${font.value}', sans-serif` }}
                >
                  {font.label}
                </p>
                <p className="text-[11px] text-muted mt-0.5">{font.description}</p>
                <p
                  className="text-[12px] text-secondary/70 mt-2"
                  style={{ fontFamily: `'${font.value}', sans-serif` }}
                >
                  AaBbCc 123.456
                </p>
                {isSelected && (
                  <Check
                    size={16}
                    className="absolute top-3 right-3"
                    style={{ color: 'var(--color-brand-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

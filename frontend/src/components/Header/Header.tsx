import { Menu, Moon, Sun, Bell, Palette } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Header({
  title = 'Dashboard',
  subtitle = 'Visão geral da sua operação',
  children,
}: HeaderProps) {
  const { toggleSidebar, theme, toggleTheme, themeColor, setThemeColor } = useApp();
  const brandPrimaryColor = useBrandPrimaryColor();

  return (
    <header className="flex h-[56px] items-center justify-between mb-8">
      {/* Left */}
      <div className="flex items-center gap-5">
        <button
          className="hidden max-md:flex items-center justify-center rounded-xl p-2 text-secondary transition-all duration-200 hover:bg-border hover:text-primary active:scale-90"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>

        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-primary leading-tight">
            {title}
          </h1>
          <p className="text-[13px] text-muted font-normal tracking-[-0.01em]">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Children (e.g. Filters) - movido do centro */}
        {children && (
          <div className="flex items-center">
            {children}
          </div>
        )}

        {/* Notification bell */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95">
          <Bell size={18} strokeWidth={2} />
          <span 
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-body" 
            style={{ backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)' }}
          />
        </button>

        {/* Palette toggle */}
        <button
          onClick={() => setThemeColor(themeColor === 'blue' ? 'pink' : 'blue')}
          aria-label="Alternar paleta de cores"
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-300 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95"
          title={themeColor === 'blue' ? 'Usar tema Rosa' : 'Usar tema Azul'}
        >
          <Palette
            size={18}
            strokeWidth={2}
            style={themeColor === 'pink' ? { color: brandPrimaryColor || 'var(--color-brand-primary)' } : undefined}
          />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-300 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95"
        >
          {theme === 'light' ? (
            <Moon size={18} strokeWidth={2} />
          ) : (
            <Sun size={18} strokeWidth={2} />
          )}
        </button>
      </div>
    </header>
  );
}

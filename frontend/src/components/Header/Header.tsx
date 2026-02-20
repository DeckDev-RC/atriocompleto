import { Menu, Moon, Sun, Bell, LogOut } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { useState } from 'react';

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
  const { toggleSidebar, theme, toggleTheme } = useApp();
  const { logout } = useAuth();
  const brandPrimaryColor = useBrandPrimaryColor();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Deseja realmente sair?')) {
      setIsLoggingOut(true);
      await logout();
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex flex-col gap-4 mb-6 md:mb-8 max-sm:gap-3">
      <div className="flex h-[56px] min-h-[56px] items-center justify-between gap-3 shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            className="hidden max-md:flex shrink-0 items-center justify-center rounded-xl p-2 text-secondary transition-all duration-200 hover:bg-border hover:text-primary active:scale-90"
            onClick={toggleSidebar}
            aria-label="Abrir menu"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div className="min-w-0">
            <h1 className="text-xl md:text-[26px] font-bold tracking-[-0.03em] text-primary leading-tight truncate">
              {title}
            </h1>
            <p className="text-[12px] md:text-[13px] text-muted font-normal tracking-[-0.01em] truncate">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: filtros no desktop; no mobile só ícones */}
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          {children && (
            <div className="hidden md:flex items-center gap-2 md:gap-3">
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

          {/* Logout button */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sair do sistema"
            className="flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-200 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:opacity-50"
          >
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Filtros em linha separada no mobile/tablet */}
      {children && (
        <div className="flex flex-wrap items-center gap-2 md:hidden min-w-0">
          {children}
        </div>
      )}
    </header>
  );
}

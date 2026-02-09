import { Search, Menu, Moon, Sun, Bell } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const { toggleSidebar, theme, toggleTheme } = useApp();

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
            Dashboard
          </h1>
          <p className="text-[13px] text-muted font-normal tracking-[-0.01em]">
            Visão geral da sua operação
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Slot for extra controls (e.g. PeriodFilter) */}
        {children}

        {/* Search */}
        <div className="relative max-sm:hidden">
          <Search
            size={15}
            strokeWidth={2.2}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-52 rounded-full border border-border bg-body/60 backdrop-blur-sm py-2 pl-10 pr-4 text-[13px] text-primary tracking-[-0.01em] transition-all duration-300 outline-none placeholder:text-muted focus:w-64 focus:border-accent/30 focus:bg-card focus:ring-4 focus:ring-accent/8 focus:shadow-[0_0_20px_rgba(56,182,255,0.06)]"
          />
        </div>

        {/* Notification bell */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95">
          <Bell size={18} strokeWidth={2} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-body" />
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

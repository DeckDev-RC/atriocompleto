import { useState } from 'react';
import { Search, Menu, Moon, Sun, Bell, Palette, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

      {/* Middle — Children (e.g. Filters) */}
      <div className="flex-1 flex justify-center px-4">
        {children}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          {/* Mobile Search Toggle */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="hidden max-sm:flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-200 hover:bg-card hover:text-primary active:scale-95"
            aria-label={isSearchOpen ? "Fechar pesquisa" : "Abrir pesquisa"}
            aria-expanded={isSearchOpen}
          >
            {isSearchOpen ? <X size={18} /> : <Search size={18} />}
          </button>

          {/* Search Input Container */}
          <div
            className={`
            relative
            max-sm:absolute max-sm:right-0 max-sm:top-12 max-sm:w-[calc(100vw-40px)] max-sm:origin-top-right
            transition-all duration-300 ease-in-out
            ${isSearchOpen
                ? 'max-sm:opacity-100 max-sm:scale-100 max-sm:visible'
                : 'max-sm:opacity-0 max-sm:scale-95 max-sm:invisible max-sm:pointer-events-none'
              }
            max-sm:shadow-lg max-sm:rounded-2xl max-sm:bg-card/95 max-sm:backdrop-blur-md max-sm:border max-sm:border-border max-sm:p-1
          `}
          >
            <Search
              size={15}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Pesquisar..."
              className="w-52 max-sm:w-full rounded-full border border-border bg-body/60 backdrop-blur-sm py-2 pl-10 pr-4 text-[13px] text-primary tracking-[-0.01em] transition-all duration-300 outline-none placeholder:text-muted focus:w-64 max-sm:focus:w-full focus:border-accent/30 focus:bg-card focus:ring-4 focus:ring-accent/8 focus:shadow-[0_0_20px_rgba(56,182,255,0.06)]"
            />
          </div>
        </div>

        {/* Notification bell */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95">
          <Bell size={18} strokeWidth={2} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-body" />
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
            className={themeColor === 'pink' ? 'text-accent' : ''}
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

import {
  ShoppingCart,
  Brain,
  Settings,
  LogOut,
  X,
  ChevronLeft,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import logoLight from '../../assets/logo-whitemode.png';
import logoDark from '../../assets/logo-darkmode.png';

const AVATAR_URL =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces&q=80';

const menuItems = [
  {
    section: 'Home',
    items: [
      { icon: ShoppingCart, label: 'E-Commerce', path: '/' },
    ],
  },
  {
    section: 'IA',
    items: [{ icon: Brain, label: 'Optimus', path: '/agente' }],
  },
];

/** Larguras em px */
const SIDEBAR_W = 232;
const SIDEBAR_COLLAPSED_W = 68;

export { SIDEBAR_W, SIDEBAR_COLLAPSED_W };

export function Sidebar() {
  const {
    sidebarOpen,
    closeSidebar,
    sidebarCollapsed: collapsed,
    toggleSidebarCollapse,
    theme,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const logoSrc = theme === 'dark' ? logoDark : logoLight;

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Backdrop overlay — mobile only */}
      <div
        className={`
          fixed inset-0 z-[199] transition-opacity duration-400
          hidden max-md:block
          ${sidebarOpen
            ? 'bg-overlay opacity-100 pointer-events-auto backdrop-blur-[2px]'
            : 'opacity-0 pointer-events-none'}
        `}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <aside
        className={`
          fixed left-0 top-0 z-200 flex h-screen flex-col justify-between
          bg-white/80 backdrop-blur-xl border-r border-border
          dark:bg-[#0f1015]/95 dark:backdrop-blur-xl dark:border-[rgba(255,255,255,0.06)]
          py-5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${collapsed ? 'px-2' : 'px-4'}
          max-md:-translate-x-full max-md:w-[232px] max-md:px-4
          ${sidebarOpen ? 'max-md:translate-x-0' : ''}
        `}
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W }}
      >
        {/* Collapse toggle — desktop only */}
        <button
          onClick={toggleSidebarCollapse}
          className="absolute -right-3 top-7 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted shadow-sm transition-all duration-200 hover:text-primary hover:shadow-md md:flex"
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          <ChevronLeft
            size={14}
            strokeWidth={2.5}
            className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Top section */}
        <div className="flex flex-col overflow-hidden">
          {/* Logo area */}
          <div className="flex items-center justify-center mb-1">
            {collapsed ? (
              <div className="flex w-full justify-center">
                <BrandIcon />
              </div>
            ) : (
              <div className="flex w-full justify-center min-w-0">
                <img
                  src={logoSrc}
                  alt="Agregar Negócios"
                  className="h-12 w-auto max-w-[200px] object-contain"
                />
              </div>
            )}

            {/* Close btn — mobile only */}
            <button
              className="hidden max-md:flex shrink-0 items-center justify-center rounded-full p-1.5 text-secondary transition-all duration-200 hover:bg-border hover:text-primary active:scale-90"
              onClick={closeSidebar}
              aria-label="Fechar menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-7 flex flex-col gap-7">
            {menuItems.map((section) => (
              <div key={section.section} className="flex flex-col gap-0.5">
                {!collapsed && (
                  <span className="mb-2 px-3 text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">
                    {section.section}
                  </span>
                )}
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        navigate(item.path);
                        closeSidebar();
                      }}
                      title={collapsed ? item.label : undefined}
                      className={`
                        group relative flex w-full items-center gap-3 rounded-xl
                        text-[13px] font-medium text-left
                        transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
                        ${collapsed
                          ? 'justify-center px-0 py-2.5'
                          : 'px-3 py-2.5'}
                        ${active
                          ? 'bg-accent/10 text-accent'
                          : 'text-secondary hover:bg-border/60 hover:text-primary'}
                      `}
                    >
                      <item.icon
                        size={18}
                        strokeWidth={active ? 2.2 : 1.8}
                        className="shrink-0 transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
                      />
                      {!collapsed && (
                        <span className="truncate tracking-[-0.01em]">
                          {item.label}
                        </span>
                      )}
                      {active && !collapsed && (
                        <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* User area */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <div className="h-px w-full bg-border" />

          {collapsed ? (
            <div className="flex justify-center">
              <img
                src={AVATAR_URL}
                alt="Avatar"
                className="h-9 w-9 rounded-full object-cover ring-2 ring-border transition-transform duration-200 hover:scale-105"
                title="Renato Costa"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-1">
                <img
                  src={AVATAR_URL}
                  alt="Avatar"
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-border"
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-primary tracking-[-0.01em]">
                    Renato Costa
                  </p>
                  <p className="text-[11px] text-muted">Admin</p>
                </div>
              </div>
              <div className="flex gap-1 px-1">
                <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-all duration-200 hover:bg-border/60 hover:text-primary active:scale-95">
                  <Settings size={13} strokeWidth={2} />
                  <span>Configurações</span>
                </button>
                <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-all duration-200 hover:bg-border/60 hover:text-primary active:scale-95">
                  <LogOut size={13} strokeWidth={2} />
                  <span>Sair</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function BrandIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-secondary"
        />
        <path
          d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
          stroke="#38b6ff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

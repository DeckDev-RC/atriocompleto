import {
  ShoppingCart,
  Brain,
  LogOut,
  X,
  ChevronLeft,
  Shield,
  Settings,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';
import logoLight from '../../assets/logo-whitemode.png';
import logoDark from '../../assets/logo-darkmode.png';
import logoAtrio from '../../assets/logo-atrio-azul.png';
import logoAtrioBranca from '../../assets/logo-atrio-branca.png';
import logotipoAtrioPng from '../../assets/logotipo-atrio.png';
import sidebarLogoWhite from '../../assets/sidebar-negativa-white.png';
import sidebarLogoDark from '../../assets/sidebar-negativa-dark.png';

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
  const { user, isMaster, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const logoSrc = theme === 'dark' ? logoDark : logoLight;

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Build menu items dynamically
  const menuSections = [
    ...(user?.tenant_id
      ? [
        {
          section: 'Home',
          items: [{ icon: ShoppingCart, label: 'E-Commerce', path: '/' }],
        },
        {
          section: "APPS",
          items: [{ icon: Brain, label: 'Optimus', path: '/agente' }],
        },
      ]
      : []),
    ...(isMaster
      ? [
        {
          section: 'Sistema',
          items: [{ icon: Shield, label: 'Administração', path: '/admin' }],
        },
      ]
      : []),
  ];

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '??';

  return (
    <>
      {/* Backdrop overlay — mobile */}
      <div
        className={`
          fixed inset-0 z-199 transition-opacity duration-400
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
          py-5 transition-[width,padding,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${collapsed ? 'px-2' : 'px-4'}
          max-md:-translate-x-full max-md:w-[232px] max-md:px-4
          ${sidebarOpen ? 'max-md:translate-x-0' : ''}
        `}
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W, willChange: 'width' }}
      >
        {/* Collapse toggle — desktop */}
        <button
          onClick={toggleSidebarCollapse}
          className="absolute -right-3 top-7 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted shadow-sm transition-[color,box-shadow] duration-150 hover:text-primary hover:shadow-md md:flex"
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
          {/* Logo / título */}
          <div className="flex items-center justify-center mb-1">
            {collapsed ? (
              <div className="flex w-full justify-center">
                <BrandIcon />
              </div>
            ) : (
              <div className="flex w-full flex-col items-center justify-center min-w-0 py-4">
                <img
                  src={theme === 'dark' ? logoAtrioBranca : logoAtrio}
                  alt="Átrio"
                  className="h-20 w-auto object-contain"
                />
                {/* Logo da Agregar movida para a área inferior, abaixo do botão Sair */}
              </div>
            )}

            {/* Close btn — mobile */}
            <button
              className="hidden max-md:flex shrink-0 items-center justify-center rounded-full p-1.5 text-secondary transition-[background-color,color] duration-150 hover:bg-border hover:text-primary active:scale-90"
              onClick={closeSidebar}
              aria-label="Fechar menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-8 flex flex-col gap-6" aria-label="Menu principal">
            {menuSections.map((section) => (
              <div key={section.section} className="flex flex-col gap-1" role="group" aria-label={section.section}>
                {!collapsed && (
                  <span className="mb-2 px-4 text-[10.5px] font-semibold tracking-widest uppercase text-[#6f7383] dark:text-[#adb3c4]" aria-hidden="true">
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
                      aria-current={active ? 'page' : undefined}
                      className={`
                        group relative flex w-full items-center gap-3 rounded-xl
                        text-[13.5px] font-medium text-left
                        transition-[background-color,color] duration-150
                        ${collapsed
                          ? 'justify-center px-0 py-3'
                          : 'px-4 py-2.5'}
                        ${active
                          ? 'bg-gray-50 dark:bg-primary/5'
                          : 'text-secondary/80 hover:bg-border/40 hover:text-primary'}
                        active:scale-[0.98]
                      `}
                      style={active ? { color: 'var(--color-brand-primary)' } : undefined}
                    >
                      <item.icon
                        size={19}
                        strokeWidth={active ? 2.2 : 1.8}
                        className="shrink-0"
                        style={active ? { color: 'var(--color-brand-primary)' } : undefined}
                      />
                      {!collapsed && (
                        <span
                          className="truncate tracking-[-0.01em]"
                          style={active ? { color: 'var(--color-brand-primary)' } : undefined}
                        >
                          {item.label}
                        </span>
                      )}
                      {active && !collapsed && (
                        <div className="absolute left-0 h-5 w-1 rounded-r-full" style={{ backgroundColor: 'var(--color-brand-primary)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* User area */}
        <div className="flex flex-col gap-4 overflow-hidden mt-auto">
          <div className="h-px w-full bg-border/40 mx-2" />

          {collapsed ? (
            <div className="px-2 pb-4">
              <div className="flex justify-center pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden bg-primary/5 text-[12px] font-bold text-primary border border-border/60">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 mt-1">
                <button
                  onClick={() => { navigate('/configuracoes'); closeSidebar(); }}
                  title="Configurações"
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-[background-color,color] duration-150 active:scale-95 ${
                    isActive('/configuracoes')
                      ? 'bg-primary/5'
                      : 'text-secondary/60 hover:bg-border/40 hover:text-primary'
                  }`}
                  style={isActive('/configuracoes') ? { color: 'var(--color-brand-primary)' } : undefined}
                >
                  <Settings size={14} strokeWidth={isActive('/configuracoes') ? 2.2 : 2} />
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium text-secondary/60 transition-[background-color,color] duration-150 hover:bg-danger/5 hover:text-danger active:scale-95"
                >
                  <LogOut size={14} strokeWidth={2} />
                  <span>Sair</span>
                </button>
              </div>
              <div className="mt-4 flex justify-center px-1">
                <img
                  src={theme === 'dark' ? sidebarLogoDark : sidebarLogoWhite}
                  alt="Agregar Negócios"
                  className="w-full max-h-12 object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="px-2 pb-4">
              <div className="flex items-center gap-3 px-2 py-2 rounded-2xl transition-colors duration-150">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/5 text-[11px] font-bold text-primary border border-border/60">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-primary tracking-tight">
                    {user?.full_name || 'Usuário'}
                  </p>
                  <p className="text-[11px] text-muted/60 truncate uppercase tracking-wider font-medium">
                    {user?.role === 'master' ? 'Master' : 'Usuário'}
                  </p>
                </div>
              </div>
              <div className="flex items-center mt-1 px-2 gap-1">
                <button
                  onClick={() => { navigate('/configuracoes'); closeSidebar(); }}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-[background-color,color] duration-150 active:scale-95 ${
                    isActive('/configuracoes')
                      ? 'bg-primary/5'
                      : 'text-secondary/60 hover:bg-border/40 hover:text-primary'
                  }`}
                  title="Configurações"
                  style={isActive('/configuracoes') ? { color: 'var(--color-brand-primary)' } : undefined}
                >
                  <Settings size={14} strokeWidth={isActive('/configuracoes') ? 2.2 : 2} />
                  <span>Configurações</span>
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium text-secondary/60 transition-[background-color,color] duration-150 hover:bg-danger/5 hover:text-danger active:scale-95"
                >
                  <LogOut size={14} strokeWidth={2} />
                  <span>Sair</span>
                </button>
              </div>
              {/* Logo da Agregar abaixo da caixa com o botão Sair */}
              <div className="mt-4 flex justify-center">
                <img
                  src={logoSrc}
                  alt="Agregar Negócios"
                  className="h-6 w-auto object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function BrandIcon() {
  const brandPrimaryColor = useBrandPrimaryColor();

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden"
      style={{
        backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
      }}
    >
      <img src={logotipoAtrioPng} alt="Átrio" className="w-full h-full object-contain p-1.5" />
    </div>
  );
}

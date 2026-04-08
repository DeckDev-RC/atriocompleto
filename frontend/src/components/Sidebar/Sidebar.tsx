import type { LucideIcon } from 'lucide-react';
import {
  BadgeDollarSign,
  ShoppingCart,
  LogOut,
  X,
  ChevronLeft,
  Shield,
  Settings,
  Search,
  Sparkles,
  Target,
  Megaphone,
  BarChart3,
  Calculator,
  Package,
  FileText,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';
import { OptimizedImage } from '../OptimizedImage';
import logoLight from '../../assets/logo-whitemode.png';
import logoLightWebp from '../../assets/logo-whitemode.webp';
import logoDark from '../../assets/logo-darkmode.png';
import logoDarkWebp from '../../assets/logo-darkmode.webp';
import logoAtrio from '../../assets/logo-atrio-azul.png';
import logoAtrioWebp from '../../assets/logo-atrio-azul.webp';
import logoAtrioBranca from '../../assets/logo-atrio-branca.png';
import logoAtrioBrancaWebp from '../../assets/logo-atrio-branca.webp';
import logotipoAtrioPng from '../../assets/logotipo-atrio.png';
import logotipoAtrioWebp from '../../assets/logotipo-atrio.webp';
import sidebarLogoWhite from '../../assets/sidebar-negativa-white.png';
import sidebarLogoWhiteWebp from '../../assets/sidebar-negativa-white.webp';
import sidebarLogoDark from '../../assets/sidebar-negativa-dark.png';
import sidebarLogoDarkWebp from '../../assets/sidebar-negativa-dark.webp';
import optimusSidebarIcon from '../../assets/channels/optimus-sidebar.png';

/** Item do menu: ícone Lucide ou imagem (imageSrc) */
interface SidebarMenuItem {
  label: string;
  path: string;
  icon: LucideIcon | null;
  imageSrc?: string;
  featureKey?: string;
}

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
  const { user, isMaster, logout, hasPermission, hasFeature } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const logoSrc = theme === 'dark' ? logoDark : logoLight;
  const brandPrimaryColor = useBrandPrimaryColor();
  const resolvedBranding = user?.resolved_branding;
  const mainLogoSrc = theme === 'dark'
    ? (resolvedBranding?.sidebar_logo_dark_url || resolvedBranding?.sidebar_logo_light_url || logoAtrioBranca)
    : (resolvedBranding?.sidebar_logo_light_url || resolvedBranding?.sidebar_logo_dark_url || logoAtrio);
  const footerLogoSrc = resolvedBranding?.footer_logo_url || logoSrc;
  const collapsedFooterLogoSrc = resolvedBranding?.footer_logo_url || (theme === 'dark' ? sidebarLogoDark : sidebarLogoWhite);
  const brandName = resolvedBranding?.partner_name || 'Atrio';
  const footerBrandName = resolvedBranding?.partner_name || 'Agregar Negocios';

  // Build menu items dynamically
  const menuSections: { section: string; items: (SidebarMenuItem & { permission?: string })[] }[] = [
    ...(user?.tenant_id
      ? [
        {
          section: 'Home',
          items: [{ icon: ShoppingCart, label: 'Vendas', path: '/', permission: 'visualizar_venda', featureKey: 'ecommerce' }],
        },
        {
          section: 'APPS',
          items: [
            { icon: Sparkles, label: 'Insights', path: '/insights', permission: 'acessar_agente', featureKey: 'insights' },
            { icon: null, imageSrc: optimusSidebarIcon, label: 'Optimus', path: '/agente', permission: 'acessar_agente', featureKey: 'optimus' },
            { icon: Sparkles, label: 'Sugestões', path: '/optimus/sugestoes', permission: 'acessar_agente', featureKey: 'sugestoes' },
            { icon: Search, label: 'Padrões', path: '/analytics/patterns', permission: 'acessar_agente', featureKey: 'padroes' },
            { icon: Target, label: 'Estratégia', path: '/estrategia', permission: 'acessar_agente', featureKey: 'estrategia' },
            { icon: FileText, label: 'Relatórios', path: '/relatorios', permission: 'visualizar_relatorios', featureKey: 'relatorios' },
            { icon: Megaphone, label: 'Campanhas', path: '/campanhas', permission: 'acessar_agente', featureKey: 'campanhas' },
            { icon: BarChart3, label: 'Benchmarking', path: '/benchmarking', permission: 'acessar_agente', featureKey: 'benchmarking' },
            { icon: Calculator, label: 'Calculadora de Taxa', path: '/simulacoes', permission: 'acessar_agente', featureKey: 'calculadora' },
            { icon: BadgeDollarSign, label: 'Calculadora de Preços', path: '/simulacoes/precos', permission: 'acessar_agente', featureKey: 'calculadora_precos' },
            { icon: Package, label: 'Estoque EOQ', path: '/simulacoes/inventory', permission: 'acessar_agente', featureKey: 'estoque_eoq' },
          ],
        },
      ]
      : []),
    {
      section: 'Sistema',
      items: [
        ...((isMaster || hasPermission('gerenciar_feature_flags')) ? [{ icon: Shield, label: 'Administração', path: '/admin' }] : []),
      ],
    },
  ];

  const filteredSections = menuSections.map(section => ({
    ...section,
    items: section.items.filter(item =>
      (!item.permission || hasPermission(item.permission)) &&
      (!item.featureKey || hasFeature(item.featureKey))
    )
  })).filter(section => section.items.length > 0);

  const activePath = filteredSections
    .flatMap((section) => section.items)
    .map((item) => item.path)
    .filter((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
  const settingsActive = location.pathname === '/configuracoes' || location.pathname.startsWith('/configuracoes/');

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
          max-md:-translate-x-full max-md:w-[85vw] max-md:max-w-[280px] max-md:px-4
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
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Logo / título */}
          <div className="flex items-center justify-center mb-1">
            {collapsed ? (
              <div className="flex w-full justify-center">
                <BrandIcon />
              </div>
            ) : (
              <div className="flex w-full flex-col items-center justify-center min-w-0 py-4">
                <OptimizedImage
                  fallbackSrc={mainLogoSrc}
                  webpSrc={
                    mainLogoSrc === logoAtrio
                      ? logoAtrioWebp
                      : mainLogoSrc === logoAtrioBranca
                        ? logoAtrioBrancaWebp
                        : undefined
                  }
                  alt={brandName}
                  className="h-14 max-sm:h-10 w-auto object-contain"
                  width={480}
                  height={289}
                  loading="eager"
                  decoding="async"
                />
                {/* Logo da Agregar movida para a área inferior, abaixo do botão Sair */}
              </div>
            )}

            {/* Close btn — mobile */}
            <button
              className="hidden max-md:flex shrink-0 items-center justify-center rounded-full p-3 text-secondary transition-[background-color,color] duration-150 hover:bg-border hover:text-primary active:scale-90"
              onClick={closeSidebar}
              aria-label="Fechar menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-5 flex flex-col flex-1 min-h-0 gap-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Menu principal">
            {filteredSections.map((section) => (
              <div key={section.section} className="flex flex-col gap-1" role="group" aria-label={section.section}>
                {!collapsed && (
                  <span className="mb-2 px-4 text-[10.5px] font-semibold tracking-widest uppercase text-muted dark:text-[#adb3c4]" aria-hidden="true">
                    {section.section}
                  </span>
                )}
                {section.items.map((item) => {
                  const active = item.path === activePath;
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
                        text-[13px] font-medium text-left
                        transition-[background-color,color] duration-150
                        ${collapsed
                          ? 'justify-center px-0 py-2.5'
                          : 'px-4 py-2 max-md:py-3'}
                        ${active
                          ? 'bg-gray-50 dark:bg-primary/5'
                          : 'text-secondary/80 hover:bg-border/40 hover:text-primary'}
                        active:scale-[0.98]
                      `}
                      style={active ? { color: 'var(--color-brand-primary)' } : undefined}
                    >
                      {item.imageSrc ? (
                        <div
                          className="shrink-0 h-[19px] w-[19px]"
                          style={{
                            backgroundColor: active ? (brandPrimaryColor || 'var(--color-brand-primary)') : 'currentColor',
                            maskImage: `url(${item.imageSrc})`,
                            maskSize: 'contain',
                            maskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskImage: `url(${item.imageSrc})`,
                            WebkitMaskSize: 'contain',
                            WebkitMaskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'center',
                          }}
                          role="img"
                          aria-label={item.label}
                        />
                      ) : item.icon ? (
                        <item.icon
                          size={19}
                          strokeWidth={active ? 2.2 : 1.8}
                          className="shrink-0"
                          style={active ? { color: 'var(--color-brand-primary)' } : undefined}
                        />
                      ) : null}
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
        <div className="flex flex-col gap-4 overflow-hidden mt-auto shrink-0 pt-2">
          <div className="h-px w-full bg-border/40" />

          {collapsed ? (
            <div className="px-2 pb-4">
              <div className="flex justify-center pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden bg-primary/5 text-[12px] font-bold text-primary border border-border/60">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" width={40} height={40} loading="lazy" decoding="async" />
                  ) : (
                    initials
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 mt-1">
                <button
                  onClick={() => { navigate('/configuracoes'); closeSidebar(); }}
                  title="Configurações"
                  className={`flex min-w-[110px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-[background-color,color] duration-150 active:scale-95 ${settingsActive
                    ? 'bg-primary/5'
                    : 'text-secondary/60 hover:bg-border/40 hover:text-primary'
                    }`}
                  style={settingsActive ? { color: 'var(--color-brand-primary)' } : undefined}
                >
                  <Settings size={14} strokeWidth={settingsActive ? 2.2 : 2} />
                </button>
                <button
                  onClick={logout}
                  className="flex min-w-[86px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium text-secondary/60 transition-[background-color,color] duration-150 hover:bg-danger/5 hover:text-danger active:scale-95"
                >
                  <LogOut size={14} strokeWidth={2} />
                  <span>Sair</span>
                </button>
              </div>
              <div className="mt-4 flex justify-center px-1">
                <OptimizedImage
                  fallbackSrc={collapsedFooterLogoSrc}
                  webpSrc={
                    collapsedFooterLogoSrc === sidebarLogoDark
                      ? sidebarLogoDarkWebp
                      : collapsedFooterLogoSrc === sidebarLogoWhite
                        ? sidebarLogoWhiteWebp
                        : undefined
                  }
                  alt={footerBrandName}
                  className="w-full max-h-12 object-contain"
                  width={420}
                  height={336}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          ) : (
            <div className="px-2 pb-4">
              <div className="mx-auto flex max-w-[176px] items-center gap-3 px-2 py-2 rounded-2xl transition-colors duration-150">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/5 text-[11px] font-bold text-primary border border-border/60">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" width={40} height={40} loading="lazy" decoding="async" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-primary tracking-tight">
                    {user?.full_name || 'Usuário'}
                  </p>
                  <p className="text-[11px] text-muted/60 truncate uppercase tracking-wider font-medium">
                    {user?.role === 'master' ? 'Master' : hasPermission('gerenciar_feature_flags') ? 'Gestor da Marca' : 'Usuário'}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  onClick={() => { navigate('/configuracoes'); closeSidebar(); }}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-[background-color,color] duration-150 active:scale-95 ${settingsActive
                    ? 'bg-primary/5'
                    : 'text-secondary/60 hover:bg-border/40 hover:text-primary'
                    }`}
                  title="Configurações"
                  style={settingsActive ? { color: 'var(--color-brand-primary)' } : undefined}
                >
                  <Settings size={14} strokeWidth={settingsActive ? 2.2 : 2} />
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
                <OptimizedImage
                  fallbackSrc={footerLogoSrc}
                  webpSrc={
                    footerLogoSrc === logoLight
                      ? logoLightWebp
                      : footerLogoSrc === logoDark
                        ? logoDarkWebp
                        : undefined
                  }
                  alt={footerBrandName}
                  className="h-6 w-auto object-contain"
                  width={960}
                  height={260}
                  loading="lazy"
                  decoding="async"
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
  const { user } = useAuth();
  const iconLogoSrc = user?.resolved_branding?.icon_logo_url || logotipoAtrioPng;
  const brandName = user?.resolved_branding?.partner_name || 'Atrio';

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden"
      style={{
        backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
      }}
    >
      <OptimizedImage
        fallbackSrc={iconLogoSrc}
        webpSrc={iconLogoSrc === logotipoAtrioPng ? logotipoAtrioWebp : undefined}
        alt={brandName}
        className="w-full h-full object-contain p-1.5"
        width={384}
        height={410}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

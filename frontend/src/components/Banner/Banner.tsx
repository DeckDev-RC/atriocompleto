import { MarketplaceIcon } from './MarketplaceIcon';
import type { DashboardChannel } from '../../hooks/useDashboard';
import { useApp } from '../../contexts/AppContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';
import { useFormatting } from '../../hooks/useFormatting';
import aguaImg from '../../assets/img-agua.jpg';

// ── Props ──────────────────────────────────────────

interface BannerProps {
  totalRevenue: number;
  channels: DashboardChannel[];
}

export function Banner({ totalRevenue, channels }: BannerProps) {
  const { theme } = useApp();
  const isDark = theme === 'dark';
  const brandPrimaryColor = useBrandPrimaryColor();
  const { formatCurrency } = useFormatting();

  return (
    <div className="group relative mb-16 w-full overflow-visible rounded-2xl max-md:mb-20 max-sm:mb-4 transition-all duration-300">
      {/* Image background */}
      <div
        className="absolute inset-0 rounded-[22px] transition-all duration-300"
        style={{
          backgroundImage: `url(${aguaImg})`,
          backgroundSize: 'cover',
          backgroundPosition: '100% 10%',
          backgroundRepeat: 'no-repeat',
          backgroundColor: isDark ? 'transparent' : 'lightgray',
        }}
      />
      {/* Dark overlay - mais escuro no hover */}
      <div className="absolute inset-0 rounded-[22px] bg-black/30 dark:bg-black/20 group-hover:bg-black/50 dark:group-hover:bg-black/40 transition-all duration-300" />
      {/* Glow accents */}
      <div 
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-[70px]" 
        style={{ 
          backgroundColor: brandPrimaryColor 
            ? getBrandPrimaryWithOpacity(brandPrimaryColor, isDark ? 0.3 : 0.2)
            : isDark 
              ? 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)'
              : 'color-mix(in srgb, var(--color-brand-primary) 20%, transparent)',
        }}
      />
      <div 
        className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full blur-[50px]" 
        style={{ 
          backgroundColor: brandPrimaryColor 
            ? getBrandPrimaryWithOpacity(brandPrimaryColor, isDark ? 0.15 : 0.2)
            : isDark 
              ? 'color-mix(in srgb, var(--color-brand-primary) 15%, transparent)'
              : 'color-mix(in srgb, var(--color-brand-primary) 20%, transparent)',
        }}
      />

      <div className="relative flex min-h-[190px] flex-col p-7 px-8 max-md:min-h-[160px] max-md:p-5">
        {/* Text */}
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-white leading-tight">
            Distribuição de Vendas
          </h2>
        </div>

        {/* Metric cards — grid responsivo: 1 col (mobile) → 2 col (sm) → 3 col (lg) → 6 col (xl) */}
        <div className="mt-auto grid translate-y-1/2 gap-3 gap-y-4 max-sm:translate-y-0 max-sm:mt-5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          {/* Total — destaque em mobile (largura total) */}
          <div className="min-w-0 rounded-2xl bg-card p-4 px-5 border border-border shadow-float dark:shadow-dark-float transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5 sm:p-5 sm:px-6">
            <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-1">
              Faturamento (Pagos)
            </p>
            <p className="text-[22px] font-bold tracking-[-0.03em] text-primary leading-none truncate sm:text-[26px]">
              {formatCurrency(totalRevenue)}
            </p>
          </div>

          {channels.map((ch) => (
            <div
              key={ch.id}
              className="min-w-0 rounded-2xl bg-card p-4 px-5 border border-border shadow-float dark:shadow-dark-float transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5 sm:p-5 sm:px-6"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-1">
                    {ch.label}
                  </p>
                  <p className="text-[18px] font-bold tracking-[-0.03em] text-primary leading-none truncate sm:text-[20px]">
                    {formatCurrency(ch.value)}
                  </p>
                  <span className="mt-1 inline-block text-[11px] font-medium text-secondary">
                    {ch.percentage.toFixed(1)}% do total
                  </span>
                </div>
                <div className="-mt-3 -mr-3 shrink-0">
                  <MarketplaceIcon type={ch.iconType} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

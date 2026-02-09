import { MarketplaceIcon } from './MarketplaceIcon';
import type { DashboardChannel } from '../../hooks/useDashboard';

// ── Formatação ─────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `R$${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1_000) {
    return `R$${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  }
  return `R$${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

// ── Props ──────────────────────────────────────────

interface BannerProps {
  totalRevenue: number;
  channels: DashboardChannel[];
}

export function Banner({ totalRevenue, channels }: BannerProps) {
  return (
    <div className="relative mb-16 w-full overflow-visible rounded-2xl max-md:mb-20 max-sm:mb-4">
      {/* Gradient background */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #1c2a33 0%, #3e5d6f 35%, #3a81aa 70%, #38b6ff 100%)',
        }}
      />
      {/* Glow accents */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 dark:bg-accent/30 blur-[70px]" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-accent-muted/20 dark:bg-accent/15 blur-[50px]" />

      <div className="relative flex min-h-[190px] flex-col p-7 px-8 max-md:min-h-[160px] max-md:p-5">
        {/* Text */}
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-white leading-tight">
            Distribuição de Vendas
          </h2>
          <p className="mt-1 text-[13px] font-normal text-white/50">
            Visão consolidada de todas as plataformas
          </p>
        </div>

        {/* Metric cards */}
        <div className="mt-auto flex translate-y-1/2 gap-4 max-lg:flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-2 max-sm:translate-y-0 max-sm:mt-5 max-sm:flex-col">
          {/* Total */}
          <div className="flex-[1.35] rounded-2xl bg-card p-5 px-6 border border-border shadow-float dark:shadow-dark-float transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5 max-lg:flex-[1_1_calc(33%-12px)] max-lg:min-w-[155px] max-md:min-w-[175px] max-md:flex-none max-sm:min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-1">
              Faturamento (Pagos)
            </p>
            <p className="text-[26px] font-bold tracking-[-0.03em] text-primary leading-none">
              {formatCurrency(totalRevenue)}
            </p>
          </div>

          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex-1 rounded-2xl bg-card p-5 px-6 border border-border shadow-float dark:shadow-dark-float transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5 max-lg:flex-[1_1_calc(33%-12px)] max-lg:min-w-[155px] max-md:min-w-[175px] max-md:flex-none max-sm:min-w-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-1">
                    {ch.label}
                  </p>
                  <p className="text-[20px] font-bold tracking-[-0.03em] text-primary leading-none">
                    {formatCompact(ch.value)}
                  </p>
                  <span className="mt-1 inline-block text-[11px] font-medium text-secondary">
                    {ch.percentage.toFixed(1)}% do total
                  </span>
                </div>
                <MarketplaceIcon type={ch.iconType} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

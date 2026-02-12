import { memo } from 'react';
import {
  Package,
  DollarSign,
  XCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Banner } from '../components/Banner';
import { PeriodFilter } from '../components/PeriodFilter';
import { StatusFilter } from '../components/StatusFilter';
import { OrderDistributionChart, MonthlyRevenueChart } from '../components/Charts';
import { SkeletonBanner, SkeletonCard } from '../components/Skeleton';
import { useDashboard } from '../hooks/useDashboard';
import { useAuth } from '../contexts/AuthContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../hooks/useBrandPrimaryColor';
import { useFormatting } from '../hooks/useFormatting';

// ── Page ───────────────────────────────────────────

export function DashboardPage() {
  const { data, loading, error, period, setPeriod, customStart, customEnd, setDateRange, status, setStatus } =
    useDashboard();
  const { user } = useAuth();
  const hasTenant = !!user?.tenant_id;
  const { formatNumber: fmtNumber, formatCurrency: fmtCurrency, formatPercent: fmtPct } = useFormatting();
  const brandPrimaryColor = useBrandPrimaryColor();

  return (
    <div className="p-7 max-md:p-5 max-sm:p-4">
      <Header>
        <PeriodFilter
          value={period}
          startDate={customStart}
          endDate={customEnd}
          onChange={setPeriod}
          onDateRangeChange={setDateRange}
        />
        <StatusFilter value={status} onChange={setStatus} />
      </Header>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-shopee/10 px-4 py-3 text-[13px] text-shopee">
          <AlertCircle size={16} strokeWidth={2} />
          {error}
        </div>
      )}

      <div style={{ animation: 'fade-in 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        {loading ? (
          <>
            <SkeletonBanner />
            <section className="mb-6 grid grid-cols-[1fr_2fr] gap-5 max-lg:grid-cols-1">
              <SkeletonCard minHeight="220px" />
              <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </section>
            <section className="mb-6 grid grid-cols-[2fr_1fr] gap-5 max-lg:grid-cols-1">
              <SkeletonCard minHeight="300px" />
              <SkeletonCard />
            </section>
          </>
        ) : !hasTenant ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: brandPrimaryColor ? `color-mix(in srgb, ${brandPrimaryColor} 10%, transparent)` : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                color: brandPrimaryColor || 'var(--color-brand-primary)',
              }}
            >
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-primary mb-2">Configure sua Empresa</h2>
            <p className="text-muted max-w-md mx-auto">
              Seu perfil ainda não está vinculado a nenhuma empresa.
              Vincule uma empresa na seção de Administração para visualizar seus dados de venda aqui.
            </p>
          </div>
        ) : data ? (
          <>
            <Banner
              totalRevenue={data.banner.totalRevenue}
              channels={data.banner.channels}
            />

            {/* Grid 2×2: Distribuição de Pedidos e bloco de cards com mesma altura visual */}
            <section className="mb-6 grid grid-cols-[2fr_1.2fr] gap-x-5 gap-y-5 max-xl:grid-cols-1 items-stretch">
              {/* Célula esquerda (linha 1): gráfico ocupa toda a altura da linha */}
              <div className="min-w-0 flex h-full flex-col">
                <div className="flex-1">
                  <OrderDistributionChart data={data.orderDistribution} />
                </div>
              </div>

              {/* Célula direita (linha 1): bloco com 4 cards, mesma altura da célula esquerda */}
              <div className="min-w-0 flex h-full flex-col">
                <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-4 max-sm:grid-cols-1 max-sm:grid-rows-none min-h-[200px]">
                  <MiniStatCard
                    title="Total de Pedidos"
                    value={fmtNumber(data.stats.totalOrders.value)}
                    change={data.stats.totalOrders.change}
                    comparedMonths={data.comparedMonths}
                    icon={Package}
                  />
                  <MiniStatCard
                    title="Ticket Médio"
                    value={fmtCurrency(data.stats.avgTicket.value)}
                    change={data.stats.avgTicket.change}
                    comparedMonths={data.comparedMonths}
                    icon={DollarSign}
                  />
                  <MiniStatCard
                    title="Taxa de Cancelamento"
                    value={fmtPct(data.stats.cancellationRate.value)}
                    change={data.stats.cancellationRate.change}
                    comparedMonths={data.comparedMonths}
                    icon={XCircle}
                    invertTrend
                  />
                  <MiniStatCard
                    title="Pedidos Pagos"
                    value={fmtPct(data.insights.paidPct)}
                    change={null}
                    comparedMonths={null}
                    icon={CheckCircle}
                    subtitle={`${fmtNumber(
                      Math.round((data.stats.totalOrders.value * data.insights.paidPct) / 100),
                    )} pedidos`}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <MonthlyRevenueChart data={data.monthlyRevenue} />
              </div>
              <div className="min-w-0">
                <QuickInsights
                  avgTicket={data.insights.avgTicket}
                  cancellationRate={data.insights.cancellationRate}
                  paidPct={data.insights.paidPct}
                  momTrend={data.insights.momTrend}
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  return `${MONTH_LABELS[month] || month}/${year?.slice(2)}`;
}

// ── Mini Stat Card (compacto, 2×2 grid) ────────────

interface MiniStatCardProps {
  title: string;
  value: string;
  change: number | null;
  comparedMonths: { current: string; previous: string } | null;
  icon: React.ElementType;
  invertTrend?: boolean;
  subtitle?: string;
}

const MiniStatCard = memo(function MiniStatCard({ title, value, change, comparedMonths, icon: Icon, invertTrend, subtitle }: MiniStatCardProps) {
  const hasChange = change !== null && change !== 0;
  const isPositiveChange = change !== null && change > 0;
  const isGood = invertTrend ? !isPositiveChange : isPositiveChange;

  const tooltipText = comparedMonths
    ? `${formatMonthLabel(comparedMonths.current)} vs ${formatMonthLabel(comparedMonths.previous)}`
    : 'vs mês anterior';

  return (
    <div className="group h-full min-h-[100px] flex flex-col rounded-2xl bg-card p-5 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundColor: 'rgba(4, 4, 166, 0.1)' }}
        >
          <Icon size={16} style={{ color: 'var(--color-brand-primary)' }} strokeWidth={2} />
        </div>
        {hasChange && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold cursor-default ${isGood ? 'bg-success/10 text-success' : 'bg-shopee/10 text-shopee'
              }`}
            title={tooltipText}
          >
            {isPositiveChange ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {change > 0 ? '+' : ''}
            {change.toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-0.5 shrink-0">
        {title}
      </p>
      <p className="text-[22px] font-bold tracking-[-0.04em] text-primary leading-none shrink-0">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1.5 text-[11px] font-medium text-secondary tracking-[-0.01em] shrink-0">
          {subtitle}
        </p>
      )}
      {hasChange && comparedMonths && (
        <p className="mt-1.5 text-[10px] text-muted/50 tracking-[-0.01em] shrink-0">
          vs {formatMonthLabel(comparedMonths.previous)}
        </p>
      )}
    </div>
  );
});

// ── Quick Insights ─────────────────────────────────

interface QuickInsightsProps {
  avgTicket: number;
  cancellationRate: number;
  paidPct: number;
  momTrend: number | null;
}

const QuickInsights = memo(function QuickInsights({ avgTicket, cancellationRate, paidPct, momTrend }: QuickInsightsProps) {
  const brandPrimaryColor = useBrandPrimaryColor();
  const { formatCurrency, formatPercent } = useFormatting();
  const items = [
    {
      label: 'Ticket Médio',
      value: formatCurrency(avgTicket),
      bar: Math.min((avgTicket / 500) * 100, 100),
    },
    {
      label: '% Pedidos Pagos',
      value: formatPercent(paidPct),
      bar: paidPct,
    },
    {
      label: 'Taxa de Cancelamento',
      value: formatPercent(cancellationRate),
      bar: cancellationRate,
    },
    {
      label: 'Tendência MoM',
      value: momTrend !== null ? `${momTrend >= 0 ? '+' : ''}${momTrend.toFixed(1)}%` : '—',
      bar: momTrend !== null ? Math.min(Math.abs(momTrend), 100) : 0,
    },
  ];

  return (
    <div className="rounded-2xl bg-card p-6 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-soft-hover dark:hover:shadow-dark-hover min-h-[220px]">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-primary">
          Indicadores
        </h2>
        <span className="text-[11px] font-medium text-muted">Resumo</span>
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium text-secondary tracking-[-0.01em]">
                {item.label}
              </span>
              <span className="text-[13px] font-semibold text-primary tracking-[-0.02em]">
                {item.value}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  width: `${item.bar}%`,
                  background: `linear-gradient(to right, ${brandPrimaryColor || 'var(--color-brand-primary)'}, ${brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.7) : 'color-mix(in srgb, var(--color-brand-primary) 70%, transparent)'})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

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
import { OrderDistributionChart, MonthlyRevenueChart } from '../components/Charts';
import { SkeletonBanner, SkeletonCard } from '../components/Skeleton';
import { useDashboard } from '../hooks/useDashboard';

// ── Formatação ─────────────────────────────────────

function fmtNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ── Page ───────────────────────────────────────────

export function DashboardPage() {
  const { data, loading, error, period, setPeriod, customStart, customEnd, setDateRange } =
    useDashboard();

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
        ) : data ? (
          <>
            <Banner
              totalRevenue={data.banner.totalRevenue}
              channels={data.banner.channels}
            />

            {/* Chart + 4 stat cards (2×2) */}
            <section className="mb-6 grid grid-cols-[1fr_2fr] gap-5 max-lg:grid-cols-1">
              <OrderDistributionChart data={data.orderDistribution} />

              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <MiniStatCard
                  title="Total de Pedidos"
                  value={fmtNumber(data.stats.totalOrders.value)}
                  change={data.stats.totalOrders.change}
                  icon={Package}
                />
                <MiniStatCard
                  title="Ticket Médio"
                  value={fmtCurrency(data.stats.avgTicket.value)}
                  change={data.stats.avgTicket.change}
                  icon={DollarSign}
                />
                <MiniStatCard
                  title="Taxa de Cancelamento"
                  value={fmtPct(data.stats.cancellationRate.value)}
                  change={data.stats.cancellationRate.change}
                  icon={XCircle}
                  invertTrend
                />
                <MiniStatCard
                  title="Pedidos Pagos"
                  value={fmtPct(data.insights.paidPct)}
                  change={null}
                  icon={CheckCircle}
                  subtitle={`${fmtNumber(Math.round(data.stats.totalOrders.value * data.insights.paidPct / 100))} pedidos`}
                />
              </div>
            </section>

            <section className="mb-6 grid grid-cols-[2fr_1fr] gap-5 max-lg:grid-cols-1">
              <MonthlyRevenueChart data={data.monthlyRevenue} />
              <QuickInsights
                avgTicket={data.insights.avgTicket}
                cancellationRate={data.insights.cancellationRate}
                paidPct={data.insights.paidPct}
                momTrend={data.insights.momTrend}
              />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Mini Stat Card (compacto, 2×2 grid) ────────────

interface MiniStatCardProps {
  title: string;
  value: string;
  change: number | null;
  icon: React.ElementType;
  invertTrend?: boolean;
  subtitle?: string;
}

function MiniStatCard({ title, value, change, icon: Icon, invertTrend, subtitle }: MiniStatCardProps) {
  const hasChange = change !== null && change !== 0;
  const isPositiveChange = change !== null && change > 0;
  const isGood = invertTrend ? !isPositiveChange : isPositiveChange;

  return (
    <div className="group rounded-2xl bg-card p-5 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 dark:bg-accent/[0.07] transition-transform duration-300 group-hover:scale-105">
          <Icon size={16} className="text-accent" strokeWidth={2} />
        </div>
        {hasChange && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isGood ? 'bg-success/10 text-success' : 'bg-shopee/10 text-shopee'
            }`}
          >
            {isPositiveChange ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {change > 0 ? '+' : ''}
            {change.toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted mb-0.5">
        {title}
      </p>
      <p className="text-[22px] font-bold tracking-[-0.04em] text-primary leading-none">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1.5 text-[11px] font-medium text-secondary tracking-[-0.01em]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ── Quick Insights ─────────────────────────────────

interface QuickInsightsProps {
  avgTicket: number;
  cancellationRate: number;
  paidPct: number;
  momTrend: number | null;
}

function QuickInsights({ avgTicket, cancellationRate, paidPct, momTrend }: QuickInsightsProps) {
  const items = [
    {
      label: 'Ticket Médio',
      value: fmtCurrency(avgTicket),
      bar: Math.min((avgTicket / 500) * 100, 100),
    },
    {
      label: '% Pedidos Pagos',
      value: fmtPct(paidPct),
      bar: paidPct,
    },
    {
      label: 'Taxa de Cancelamento',
      value: fmtPct(cancellationRate),
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
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${item.bar}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

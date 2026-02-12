import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
  LabelList,
} from 'recharts';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useChartColors } from './useChartColors';
import { useFormatting } from '../../hooks/useFormatting';

/** Canais ocultos na visualização (clicar na legenda alterna) */
function useHiddenChannels(initialData: DistributionItem[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const visibleData = initialData.filter((d) => !hidden.has(d.name));
  const isHidden = (name: string) => hidden.has(name);
  return { visibleData, isHidden, toggle, hasAnyHidden: hidden.size > 0 };
}

// ── Types ──────────────────────────────────────────

interface DistributionItem {
  name: string;
  value: number;
  color: string;
}

interface OrderDistributionChartProps {
  data: DistributionItem[];
}

// ── Tooltip (module-level, estável) ─────────────────

function DistributionTooltip({ active, payload, formatter }: {
  active?: boolean;
  payload?: Array<{ payload: DistributionItem }>;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl bg-card px-4 py-2.5 shadow-soft text-[12px] border border-border">
      <p className="font-semibold text-primary">{d.name}</p>
      <p className="text-secondary mt-0.5">
        {formatter ? formatter(d.value) : d.value} pedidos
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────

const FALLBACK_CHART_HEIGHT = 220;

export function OrderDistributionChart({ data }: OrderDistributionChartProps) {
  const { formatInteger } = useFormatting();
  const { visibleData, isHidden, toggle, hasAnyHidden } = useHiddenChannels(data);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = useCallback((props: any) => (
    <DistributionTooltip {...props} formatter={formatInteger} />
  ), [formatInteger]);

  const { gridColor, labelColor } = useChartColors();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(FALLBACK_CHART_HEIGHT);

  // Medir a altura do container e passar em pixels ao Recharts (height="100%" em flex não funciona)
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;
    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      setChartHeight((prev) => (height > 0 ? Math.round(height) : prev));
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-[220px] flex-col rounded-2xl bg-card p-6 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover">
      <div className="mb-5 flex shrink-0 items-baseline justify-between">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-primary">
          Distribuição de Pedidos
        </h2>
        <span className="text-[11px] font-medium text-muted">Por canal</span>
      </div>
      <div className="flex min-h-0 flex-1 items-start gap-6 max-sm:flex-col">
        <div ref={chartWrapperRef} className="min-h-[200px] min-w-0 flex-1 w-full">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={visibleData.length > 0 ? visibleData : data}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <YAxis hide />
              <XAxis hide />
              <Tooltip
                content={renderTooltip}
                cursor={{ fill: 'rgba(0,0,0,0.02)', radius: 6 }}
              />
              <Bar dataKey="value" radius={[8, 8, 4, 4]} barSize={32}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => typeof v === 'number' ? formatInteger(v) : String(v)}
                  style={{ fontSize: 10, fontWeight: 600, fill: labelColor }}
                />
                {(visibleData.length > 0 ? visibleData : data).map((entry) => (
                  <Cell 
                    key={entry.name} 
                    fill={entry.color} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 pt-3 max-sm:flex-row max-sm:flex-wrap max-sm:gap-3 max-sm:pt-0">
          {data.map((item) => {
            const hidden = isHidden(item.name);
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => toggle(item.name)}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1 -mx-2 text-left transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${hidden ? 'opacity-50' : 'opacity-100'}`}
                title={hasAnyHidden ? 'Clique para exibir ou ocultar no gráfico' : 'Clique para filtrar o gráfico'}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                  style={{ background: item.color }}
                />
                <span className="whitespace-nowrap text-[12px] font-medium text-primary tracking-[-0.01em]">
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

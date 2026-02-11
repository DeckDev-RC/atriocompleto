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
import { useState, useEffect, useRef } from 'react';
import { useChartColors } from './useChartColors';

// ── Types ──────────────────────────────────────────

interface DistributionItem {
  name: string;
  value: number;
  color: string;
}

interface OrderDistributionChartProps {
  data: DistributionItem[];
}

// ── Tooltip ────────────────────────────────────────

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: DistributionItem }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl bg-card px-4 py-2.5 shadow-soft text-[12px] border border-border">
      <p className="font-semibold text-primary">{d.name}</p>
      <p className="text-secondary mt-0.5">
        {d.value.toLocaleString('pt-BR')} pedidos
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────

const FALLBACK_CHART_HEIGHT = 220;

export function OrderDistributionChart({ data }: OrderDistributionChartProps) {
  const { gridColor, labelColor } = useChartColors();
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('#0404A6');
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

  // Atualizar a cor quando a variável CSS mudar
  useEffect(() => {
    const updateColor = () => {
      if (typeof window !== 'undefined') {
        const color = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-brand-primary')
          .trim() || '#0404A6';
        setBrandPrimaryColor(color);
      }
    };

    // Atualizar imediatamente
    updateColor();

    // Observar mudanças no documento (incluindo mudanças de tema)
    const observer = new MutationObserver(() => {
      updateColor();
    });

    if (typeof window !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-theme'],
        subtree: false,
      });

      // Também verificar periodicamente durante desenvolvimento (quando CSS é recarregado)
      const interval = setInterval(updateColor, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, []);

  // Encontrar o maior valor para aplicar a cor azul principal
  const maxValue = Math.max(...data.map(item => item.value));

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
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <YAxis hide />
              <XAxis hide />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(0,0,0,0.02)', radius: 6 }}
              />
              <Bar dataKey="value" radius={[8, 8, 4, 4]} barSize={32}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v)}
                  style={{ fontSize: 10, fontWeight: 600, fill: labelColor }}
                />
                {data.map((entry) => (
                  <Cell 
                    key={entry.name} 
                    fill={entry.value === maxValue ? brandPrimaryColor : entry.color} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 pt-3 max-sm:flex-row max-sm:flex-wrap max-sm:gap-3 max-sm:pt-0">
          {data.map((item) => {
            const itemColor = item.value === maxValue ? brandPrimaryColor : item.color;
            return (
              <div key={item.name} className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                  style={{ background: itemColor }}
                />
                <span className="whitespace-nowrap text-[12px] font-medium text-secondary tracking-[-0.01em]">
                  {item.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts';
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

export function OrderDistributionChart({ data }: OrderDistributionChartProps) {
  const { gridColor, mutedColor } = useChartColors();

  // Compute dynamic Y-axis ticks
  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const ceiling = Math.ceil(maxVal / 100) * 100 + 100;
  const step = Math.max(Math.round(ceiling / 5 / 100) * 100, 100);
  const ticks = Array.from({ length: 6 }, (_, i) => i * step).filter((t) => t <= ceiling);

  return (
    <div className="rounded-2xl bg-card p-6 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover min-h-[220px]">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-primary">
          Distribuição de Pedidos
        </h2>
        <span className="text-[11px] font-medium text-muted">Por canal</span>
      </div>
      <div className="flex items-start gap-6 max-sm:flex-col">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <YAxis
                tick={{ fontSize: 11, fill: mutedColor }}
                axisLine={false}
                tickLine={false}
                ticks={ticks}
                domain={[0, ceiling]}
              />
              <XAxis hide />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(0,0,0,0.02)', radius: 6 }}
              />
              <Bar dataKey="value" radius={[8, 8, 4, 4]} barSize={32}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 pt-3 max-sm:flex-row max-sm:flex-wrap max-sm:gap-3 max-sm:pt-0">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                style={{ background: item.color }}
              />
              <span className="whitespace-nowrap text-[12px] font-medium text-secondary tracking-[-0.01em]">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  Tooltip,
} from 'recharts';
import { useChartColors } from './useChartColors';

// ── Types ──────────────────────────────────────────

interface MonthlyItem {
  month: string;
  paid: number;
  cancelled: number;
}

interface MonthlyRevenueChartProps {
  data: MonthlyItem[];
}

// ── Helpers ────────────────────────────────────────

// ── Helpers ────────────────────────────────────────

function formatValue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface CustomLabelProps {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  fill?: string;
}

function createTopLabel(labelColor: string) {
  return function TopLabel({ x = 0, y = 0, width = 0, value = 0 }: CustomLabelProps) {
    if (!value) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={labelColor}
        letterSpacing="-0.02em"
      >
        {formatValue(value)}
      </text>
    );
  };
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-card px-4 py-2.5 shadow-soft text-[12px] border border-border">
      <p className="font-semibold text-primary capitalize">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-secondary mt-0.5">
          {p.dataKey === 'paid' ? 'Pagos' : 'Cancelados'}: {p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────

export function MonthlyRevenueChart({ data }: MonthlyRevenueChartProps) {
  const { gridColor, secondaryColor, labelColor, darkBarColor, accentColor } = useChartColors();
  const TopLabelComponent = createTopLabel(labelColor);

  return (
    <div className="rounded-2xl bg-card p-6 border border-border shadow-soft dark:shadow-dark-card transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover min-h-[220px]">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-primary">
          Análise Mensal de Faturamento
        </h2>
        <span className="text-[11px] font-medium text-muted">Pagos vs Cancelados</span>
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            margin={{ top: 24, right: 8, bottom: 0, left: -16 }}
            barGap={3}
            barCategoryGap={20}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: secondaryColor }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(0,0,0,0.02)', radius: 4 }}
            />
            <Bar dataKey="cancelled" fill={darkBarColor} radius={[6, 6, 2, 2]} barSize={18}>
              <LabelList dataKey="cancelled" content={<TopLabelComponent />} />
            </Bar>
            <Bar dataKey="paid" fill={accentColor} radius={[6, 6, 2, 2]} barSize={18}>
              <LabelList dataKey="paid" content={<TopLabelComponent />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="mt-4 flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: darkBarColor }} />
          <span className="text-[11px] font-medium text-secondary">Cancelados</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-accent" />
          <span className="text-[11px] font-medium text-secondary">Pagos</span>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../../contexts/AppContext';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { useFormatting } from '../../hooks/useFormatting';
import { getMarketplaceColor } from '../../utils/marketplaceColors';
import type { ChartData } from './chartUtils';

const FIXED_COLORS = [
  '#34C759',
  '#FF9F0A',
  '#FF453A',
  '#3a81aa',
  '#2DD4BF',
  '#FB923C',
  '#A78BFA',
  '#3e5d6f',
  '#F472B6',
];

interface RechartsPayloadRow {
  label: string;
  index: number;
  [key: string]: string | number;
}

interface PieRow {
  name: string;
  value: number;
  fill: string;
  index: number;
}

interface ClickableDotProps {
  cx?: number;
  cy?: number;
  payload?: RechartsPayloadRow;
  stroke?: string;
  dataKey?: string;
  onPointClick?: (payload: RechartsPayloadRow, dataKey: string) => void;
}

function ClickableDot({ cx, cy, payload, stroke, dataKey, onPointClick }: ClickableDotProps) {
  if (cx === undefined || cy === undefined || !payload || !dataKey) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={stroke || '#09CAFF'}
      stroke="var(--color-card)"
      strokeWidth={2}
      style={{ cursor: onPointClick ? 'pointer' : 'default' }}
      onClick={() => onPointClick?.(payload, dataKey)}
    />
  );
}

function formatCompactValue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toFixed(2);
}

function buildCartesianRows(data: ChartData): RechartsPayloadRow[] {
  return data.labels.map((label, index) => {
    const row: RechartsPayloadRow = { label, index };
    data.datasets.forEach((dataset) => {
      row[dataset.label] = dataset.data[index] ?? 0;
    });
    return row;
  });
}

function buildPieRows(data: ChartData, colors: string[]): PieRow[] {
  const dataset = data.datasets[0];
  if (!dataset) return [];

  return data.labels.map((label, index) => ({
    name: label,
    value: dataset.data[index] ?? 0,
    fill: getMarketplaceColor(label) || colors[index % colors.length],
    index,
  }));
}

function extractNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value || 0);
}

function resolveSeriesColor(color: string | undefined, fallback: string) {
  return color || fallback;
}

function AgentChartTooltip({
  active,
  payload,
  label,
  formatter,
  isPie,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: PieRow | RechartsPayloadRow }>;
  label?: string;
  formatter: (value: number) => string;
  isPie: boolean;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-[12px] shadow-soft dark:shadow-dark-card">
      <p className="font-semibold text-primary">{isPie ? payload[0]?.name : label}</p>
      <div className="mt-1 space-y-1">
        {payload.map((item, index) => (
          <p key={`${item.name}-${index}`} className="text-secondary">
            {item.name}: {formatter(extractNumber(item.value))}
          </p>
        ))}
      </div>
    </div>
  );
}

export function AgentChart({
  data,
  onElementClick,
}: {
  data: ChartData;
  onElementClick?: (label: string, value: number, chartTitle?: string) => void;
}) {
  const { theme } = useApp();
  const brandPrimaryColor = useBrandPrimaryColor();
  const { formatCurrency, formatPercent, formatInteger } = useFormatting();
  const isDark = theme === 'dark';
  const isPie = data.type === 'pie' || data.type === 'doughnut';
  const isHorizontal = data.type === 'horizontalBar';
  const textColor = isDark ? '#eaebf0' : '#1a1c24';
  const legendAndAxisColor = isDark ? '#b4b6c4' : '#9498a8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const colors = useMemo(
    () => [brandPrimaryColor || '#38b6ff', ...FIXED_COLORS],
    [brandPrimaryColor],
  );

  const chartRows = useMemo(() => buildCartesianRows(data), [data]);
  const pieRows = useMemo(() => buildPieRows(data, colors), [data, colors]);

  const formatter = useMemo(() => {
    return (value: number) => {
      if (data.options?.currency) return formatCurrency(value);
      if (data.options?.percentage) return formatPercent(value);
      return formatInteger(value);
    };
  }, [data.options?.currency, data.options?.percentage, formatCurrency, formatInteger, formatPercent]);

  const handleCartesianClick = (payload: RechartsPayloadRow, dataKey: string) => {
    if (!onElementClick) return;
    onElementClick(payload.label, extractNumber(payload[dataKey]), data.title);
  };

  const handlePieClick = (payload: PieRow) => {
    if (!onElementClick) return;
    onElementClick(payload.name, payload.value, data.title);
  };

  const renderBarChart = () => (
    <BarChart
      data={chartRows}
      layout={isHorizontal ? 'vertical' : 'horizontal'}
      margin={{ top: 16, right: 16, left: 4, bottom: 8 }}
      barCategoryGap={isHorizontal ? 14 : 18}
    >
      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={!isHorizontal} />
      <XAxis
        type={isHorizontal ? 'number' : 'category'}
        dataKey={isHorizontal ? undefined : 'label'}
        stroke={legendAndAxisColor}
        tick={{ fill: legendAndAxisColor, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        type={isHorizontal ? 'category' : 'number'}
        dataKey={isHorizontal ? 'label' : undefined}
        stroke={legendAndAxisColor}
        tick={{ fill: legendAndAxisColor, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={isHorizontal ? 96 : 48}
      />
      <RechartsTooltip content={<AgentChartTooltip formatter={formatter} isPie={false} />} />
      {data.options?.showLegend !== false && data.datasets.length > 1 ? (
        <Legend wrapperStyle={{ color: textColor, fontSize: 12 }} />
      ) : null}
      {data.datasets.map((dataset, datasetIndex) => {
        const seriesColor = resolveSeriesColor(dataset.color, colors[datasetIndex % colors.length]);
        const singleSeries = data.datasets.length === 1;

        return (
          <Bar
            key={dataset.label}
            dataKey={dataset.label}
            name={dataset.label}
            fill={seriesColor}
            stackId={data.options?.stacked ? 'stack' : undefined}
            radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 2, 2]}
            onClick={(entry) => {
              const payload = (entry as { payload?: RechartsPayloadRow })?.payload;
              if (payload) {
                handleCartesianClick(payload, dataset.label);
              }
            }}
          >
            {singleSeries
              ? chartRows.map((row, index) => (
                  <Cell
                    key={`${dataset.label}-${row.label}`}
                    fill={getMarketplaceColor(row.label) || colors[index % colors.length]}
                  />
                ))
              : null}
          </Bar>
        );
      })}
    </BarChart>
  );

  const renderLineChart = () => (
    <LineChart data={chartRows} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
      <XAxis
        dataKey="label"
        stroke={legendAndAxisColor}
        tick={{ fill: legendAndAxisColor, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        stroke={legendAndAxisColor}
        tick={{ fill: legendAndAxisColor, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <RechartsTooltip content={<AgentChartTooltip formatter={formatter} isPie={false} />} />
      {data.options?.showLegend !== false && data.datasets.length > 1 ? (
        <Legend wrapperStyle={{ color: textColor, fontSize: 12 }} />
      ) : null}
      {data.datasets.map((dataset, datasetIndex) => {
        const seriesColor = resolveSeriesColor(dataset.color, colors[datasetIndex % colors.length]);

        return (
          <Line
            key={dataset.label}
            type="monotone"
            dataKey={dataset.label}
            name={dataset.label}
            stroke={seriesColor}
            strokeWidth={3}
            dot={(dotProps) => (
              <ClickableDot
                {...dotProps}
                dataKey={dataset.label}
                stroke={seriesColor}
                onPointClick={handleCartesianClick}
              />
            )}
            activeDot={{ r: 6 }}
          />
        );
      })}
    </LineChart>
  );

  const renderPieChart = () => (
    <PieChart>
      <RechartsTooltip content={<AgentChartTooltip formatter={formatter} isPie />} />
      {data.options?.showLegend !== false ? (
        <Legend wrapperStyle={{ color: textColor, fontSize: 12 }} />
      ) : null}
      <Pie
        data={pieRows}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        innerRadius={data.type === 'doughnut' ? '42%' : 0}
        outerRadius="78%"
        paddingAngle={2}
        onClick={(payload) => handlePieClick(payload as PieRow)}
      >
        {pieRows.map((entry) => (
          <Cell key={entry.name} fill={entry.fill} />
        ))}
      </Pie>
    </PieChart>
  );

  const height = isPie ? 280 : 300;

  return (
    <div
      className="my-3 rounded-2xl border border-border bg-body/50 p-5 dark:bg-[rgba(255,255,255,0.02)]"
      style={{ height: `${height}px`, position: 'relative' }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {data.type === 'line' ? renderLineChart() : isPie ? renderPieChart() : renderBarChart()}
      </ResponsiveContainer>
      {data.title ? (
        <div className="pointer-events-none absolute left-5 top-4 text-[12px] font-semibold text-primary">
          {data.title}
        </div>
      ) : null}
      {!isPie ? (
        <div className="pointer-events-none absolute right-5 top-4 text-[10px] font-medium text-muted">
          {data.options?.stacked ? 'Modo empilhado' : 'Comparativo'}
        </div>
      ) : null}
      {isPie && pieRows.length > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-0 w-full text-center text-[10px] font-medium text-muted">
          Clique em um setor para detalhar no chat
        </div>
      ) : null}
      {!isPie && data.datasets.length > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-0 w-full text-center text-[10px] font-medium text-muted">
          Valores: {chartRows.length > 0 ? formatCompactValue(extractNumber(chartRows[0][data.datasets[0].label])) : '0'}
        </div>
      ) : null}
    </div>
  );
}

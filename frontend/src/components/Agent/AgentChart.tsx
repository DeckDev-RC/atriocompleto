import { useRef, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';
import { useApp } from '../../contexts/AppContext';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { useFormatting } from '../../hooks/useFormatting';
import { getMarketplaceColor } from '../../utils/marketplaceColors';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// Cores fixas para gráficos de linha / quando não há label de marketplace
const FIXED_COLORS = [
  '#34C759', // success
  '#FF9F0A', // warning
  '#FF453A', // danger
  '#3a81aa', // accent-deep
  '#2DD4BF', // teal
  '#FB923C', // orange
  '#A78BFA', // violet
  '#3e5d6f', // accent-muted
  '#F472B6', // pink
];

export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'horizontalBar';
  title?: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
  options?: {
    currency?: boolean;
    percentage?: boolean;
    stacked?: boolean;
    showLegend?: boolean;
  };
}

export function extractCharts(content: string): { text: string; charts: ChartData[] } {
  const charts: ChartData[] = [];
  const chartRegex = /```chart\n([\s\S]*?)```/g;

  const text = content.replace(chartRegex, (_match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr.trim());
      charts.push(parsed);
      return `%%CHART_${charts.length - 1}%%`;
    } catch (e) {
      console.warn('Failed to parse chart JSON:', e);
      return _match;
    }
  });

  return { text, charts };
}

export function AgentChart({ data }: { data: ChartData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const { theme } = useApp();
  const isDark = theme === 'dark';
  const brandPrimaryColor = useBrandPrimaryColor();
  const { formatCurrency, formatPercent, formatInteger } = useFormatting();

  // Array de cores dinâmico: primeira cor vem da variável global, resto são fixas
  const COLORS = useMemo(() => {
    const primary = brandPrimaryColor || '#38b6ff'; // Fallback para a cor original
    return [primary, ...FIXED_COLORS];
  }, [brandPrimaryColor]);

  const COLORS_ALPHA = useMemo(() => {
    return COLORS.map((c) => {
      // Se a cor já tem formato rgba, ajustar alpha
      if (c.startsWith('rgba')) {
        return c.replace(/,\s*[\d.]+\)$/, ', 0.25)');
      }
      // Para variáveis CSS, usar color-mix (Chart.js não suporta diretamente, então vamos ler o valor)
      if (c.startsWith('var(')) {
        // Ler o valor computado da variável CSS
        if (typeof window !== 'undefined') {
          const computed = getComputedStyle(document.documentElement)
            .getPropertyValue(c.replace('var(', '').replace(')', '').trim())
            .trim();
          if (computed) {
            // Se for hex, adicionar alpha
            if (computed.startsWith('#')) {
              return computed + '40';
            }
            // Se for rgba, ajustar alpha
            if (computed.startsWith('rgba')) {
              return computed.replace(/,\s*[\d.]+\)$/, ', 0.25)');
            }
          }
        }
        // Fallback: usar color-mix (pode não funcionar em todos os browsers)
        return `color-mix(in srgb, ${c} 25%, transparent)`;
      }
      // Para hex, adicionar alpha
      return c + '40';
    });
  }, [COLORS]);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const existingChart = ChartJS.getChart(canvasRef.current);
    if (existingChart) existingChart.destroy();

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const isCurrency = data.options?.currency;
    const isPercentage = data.options?.percentage;
    const isHorizontal = data.type === 'horizontalBar';
    const isPie = data.type === 'pie' || data.type === 'doughnut';

    const textColor = isDark ? '#eaebf0' : '#1a1c24';
    const mutedColor = isDark ? '#484a5c' : '#9498a8';
    const legendAndAxisColor = isDark ? '#b4b6c4' : '#9498a8';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    const tooltipBg = isDark ? '#181a22' : '#ffffff';
    const tooltipBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    const formatValue = (value: number) => {
      if (isCurrency) return formatCurrency(value);
      if (isPercentage) return formatPercent(value);
      return formatInteger(value);
    };

    /** Cor por índice: mesmas cores do dashboard (marketplaces/canais) */
    const getBarColorForLabelIndex = (labelIndex: number): string => {
      const label = data.labels[labelIndex];
      return getMarketplaceColor(typeof label === 'string' ? label : String(label ?? ''));
    };

    const datasets = data.datasets.map((ds, i) => {
      const color = ds.color || COLORS[i % COLORS.length];
      const alphaColor = COLORS_ALPHA[i % COLORS_ALPHA.length];

      if (isPie) {
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.data.map((_, j) => getBarColorForLabelIndex(j)),
          borderColor: ds.data.map((_, j) => getBarColorForLabelIndex(j)),
          borderWidth: 2,
          hoverOffset: 8,
        };
      }

      const isBarOrHorizontal = data.type === 'bar' || isHorizontal;
      const barBackgroundColor = isBarOrHorizontal
        ? ds.data.map((_, j) => getBarColorForLabelIndex(j))
        : (data.type === 'line' ? alphaColor : color);

      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: barBackgroundColor,
        borderColor: color,
        borderWidth: data.type === 'line' ? 3 : 0,
        borderRadius: isBarOrHorizontal ? 8 : 0,
        fill: data.type === 'line',
        tension: 0.4,
        pointRadius: data.type === 'line' ? 4 : 0,
        pointHoverRadius: data.type === 'line' ? 7 : 0,
        pointBackgroundColor: color,
        pointBorderColor: isDark ? '#111318' : '#ffffff',
        pointBorderWidth: 2,
      };
    });

    const config: ChartConfiguration = {
      type: isHorizontal ? 'bar' : (isPie ? data.type : data.type) as ChartConfiguration['type'],
      data: {
        labels: data.labels,
        datasets: datasets as ChartConfiguration['data']['datasets'],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizontal ? 'y' : 'x',
        plugins: {
          legend: {
            display: data.options?.showLegend !== false && (data.datasets.length > 1 || isPie),
            position: isPie ? 'bottom' : 'top',
            labels: {
              color: legendAndAxisColor,
              font: { family: "'SF Pro Display', -apple-system, sans-serif", size: 12 },
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          title: {
            display: !!data.title,
            text: data.title || '',
            color: textColor,
            font: { family: "'SF Pro Display', -apple-system, sans-serif", size: 15, weight: 'bold' as const },
            padding: { bottom: 16 },
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: textColor,
            bodyColor: mutedColor,
            borderColor: tooltipBorder,
            borderWidth: 1,
            cornerRadius: 12,
            padding: 14,
            titleFont: { family: "'SF Pro Display', -apple-system, sans-serif", weight: 'bold' as const },
            bodyFont: { family: "'SF Pro Display', -apple-system, sans-serif" },
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label || '';
                const value = ctx.parsed?.y ?? ctx.parsed ?? 0;
                return label + ': ' + formatValue(typeof value === 'number' ? value : 0);
              },
            },
          },
        },
        scales: isPie ? {} : {
          x: {
            grid: { color: gridColor, lineWidth: 0.5 },
            ticks: {
              color: legendAndAxisColor,
              font: { family: "'SF Pro Display', -apple-system, sans-serif", size: 11 },
              maxRotation: 45,
            },
            stacked: data.options?.stacked,
          },
          y: {
            grid: { color: gridColor, lineWidth: 0.5 },
            ticks: {
              color: legendAndAxisColor,
              font: { family: "'SF Pro Display', -apple-system, sans-serif", size: 11 },
              callback: (value) => formatValue(Number(value)),
            },
            stacked: data.options?.stacked,
          },
        },
        animation: {
          duration: 800,
          easing: 'easeOutQuart',
        },
      },
    };

    chartRef.current = new ChartJS(ctx, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, isDark, COLORS, COLORS_ALPHA, formatCurrency, formatPercent, formatInteger]);

  const height = (data.type === 'pie' || data.type === 'doughnut') ? 260 : 280;

  return (
    <div
      className="rounded-2xl bg-body/50 dark:bg-[rgba(255,255,255,0.02)] border border-border p-5 my-3"
      style={{ height: height + 'px', position: 'relative' }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

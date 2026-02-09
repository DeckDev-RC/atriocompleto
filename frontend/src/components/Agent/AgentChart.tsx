import { useRef, useEffect } from 'react';
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

const COLORS = [
  '#38b6ff', // accent
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

const COLORS_ALPHA = COLORS.map((c) => c + '40');

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
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    const tooltipBg = isDark ? '#181a22' : '#ffffff';
    const tooltipBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    const formatValue = (value: number) => {
      if (isCurrency) return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      if (isPercentage) return value.toFixed(1) + '%';
      return value.toLocaleString('pt-BR');
    };

    const datasets = data.datasets.map((ds, i) => {
      const color = ds.color || COLORS[i % COLORS.length];
      const alphaColor = COLORS_ALPHA[i % COLORS_ALPHA.length];

      if (isPie) {
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.data.map((_, j) => COLORS[j % COLORS.length]),
          borderColor: ds.data.map((_, j) => COLORS[j % COLORS.length]),
          borderWidth: 2,
          hoverOffset: 8,
        };
      }

      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: data.type === 'line' ? alphaColor : color,
        borderColor: color,
        borderWidth: data.type === 'line' ? 3 : 0,
        borderRadius: data.type === 'bar' || isHorizontal ? 8 : 0,
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
              color: mutedColor,
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
              color: mutedColor,
              font: { family: "'SF Pro Display', -apple-system, sans-serif", size: 11 },
              maxRotation: 45,
            },
            stacked: data.options?.stacked,
          },
          y: {
            grid: { color: gridColor, lineWidth: 0.5 },
            ticks: {
              color: mutedColor,
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
  }, [data, isDark]);

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

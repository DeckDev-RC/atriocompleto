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
    } catch (error) {
      console.warn('Failed to parse chart JSON:', error);
      return _match;
    }
  });

  return { text, charts };
}

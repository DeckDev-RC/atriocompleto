import { useState, useEffect, useCallback } from 'react';
import { agentApi } from '../services/agentApi';

// ── Types ──────────────────────────────────────────

export type DashboardPeriod = 'all' | 'current_month' | '30d' | '90d' | 'custom';

export interface DashboardChannel {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
  iconType: string;
}

export interface DashboardData {
  banner: {
    totalRevenue: number;
    trendPct: number | null;
    channels: DashboardChannel[];
  };
  orderDistribution: Array<{ name: string; value: number; color: string }>;
  monthlyRevenue: Array<{ month: string; paid: number; cancelled: number }>;
  stats: {
    totalOrders: { value: number; change: number | null };
    avgTicket: { value: number; change: number | null };
    cancellationRate: { value: number; change: number | null };
  };
  insights: {
    avgTicket: number;
    cancellationRate: number;
    paidPct: number;
    momTrend: number | null;
  };
}

// ── Hook ───────────────────────────────────────────

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  /** Aplica um período personalizado (start + end). */
  const setDateRange = useCallback((start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPeriod('custom');
  }, []);

  const fetchDashboard = useCallback(async () => {
    // Não buscar enquanto datas custom não estiverem completas
    if (period === 'custom' && (!customStart || !customEnd)) return;

    setLoading(true);
    setError(null);
    try {
      const response = await agentApi.getDashboardSummary(
        period,
        period === 'custom' ? customStart : undefined,
        period === 'custom' ? customEnd : undefined,
      );
      if (response.success && response.data) {
        setData(response.data as DashboardData);
      } else {
        setError(response.error || 'Erro ao carregar dashboard');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    data,
    loading,
    error,
    period,
    setPeriod,
    customStart,
    customEnd,
    setDateRange,
    refetch: fetchDashboard,
  };
}

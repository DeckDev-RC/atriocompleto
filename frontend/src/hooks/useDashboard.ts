import { useState, useEffect, useCallback, useRef } from 'react';
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
  comparedMonths: { current: string; previous: string } | null;
}

// ── Filter persistence (sessionStorage) ────────────

const FILTERS_KEY = 'dashboard-filters';

interface StoredFilters {
  period: DashboardPeriod;
  status: string;
  customStart: string;
  customEnd: string;
}

function loadFilters(): StoredFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    if (raw) return { ...defaultFilters, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultFilters };
}

function saveFilters(filters: StoredFilters) {
  sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
}

const defaultFilters: StoredFilters = {
  period: 'all',
  status: 'all',
  customStart: '',
  customEnd: '',
};

// ── Hook ───────────────────────────────────────────

export function useDashboard() {
  const stored = useRef(loadFilters()).current;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>(stored.period);
  const [status, setStatus] = useState<string>(stored.status);
  const [customStart, setCustomStart] = useState(stored.customStart);
  const [customEnd, setCustomEnd] = useState(stored.customEnd);

  // Persiste filtros no sessionStorage sempre que mudam
  useEffect(() => {
    saveFilters({ period, status, customStart, customEnd });
  }, [period, status, customStart, customEnd]);

  /** Aplica um período personalizado (start + end). */
  const setDateRange = useCallback((start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPeriod('custom');
  }, []);

  // AbortController para cancelar request anterior quando filtros mudam
  const abortRef = useRef<AbortController | null>(null);

  const fetchDashboard = useCallback(async () => {
    // Não buscar enquanto datas custom não estiverem completas
    if (period === 'custom' && (!customStart || !customEnd)) return;

    // Cancela fetch anterior (se existir)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const response = await agentApi.getDashboardSummary(
        period,
        period === 'custom' ? customStart : undefined,
        period === 'custom' ? customEnd : undefined,
        status,
        controller.signal,
      );

      // Ignora resposta se foi cancelada
      if (controller.signal.aborted) return;

      if (response.success && response.data) {
        setData(response.data as DashboardData);
      } else if (response.error !== 'Request cancelled') {
        setError(response.error || 'Erro ao carregar dashboard');
      }
    } catch {
      if (!controller.signal.aborted) {
        setError('Erro de conexão com o servidor');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [period, customStart, customEnd, status]);

  useEffect(() => {
    fetchDashboard();
    return () => { abortRef.current?.abort(); };
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
    status,
    setStatus,
  };
}

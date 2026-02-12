/**
 * Dashboard Service — Queries SQL otimizadas com agregação no banco.
 *
 * ANTES: 3 query functions × fetchAllRows (40 páginas cada) = ~120 HTTP requests, ~120k rows
 * AGORA: 3 queries SQL com GROUP BY = 3 HTTP requests, ~100 rows
 *
 * + Cache in-memory com TTL de 60s para evitar reconsultas.
 */

import { supabase } from "../config/supabase";

// ── Types ──────────────────────────────────────────

export interface DashboardParams {
  all_time?: boolean;
  start_date?: string;
  end_date?: string;
  period_days?: number;
  status?: string;
}

interface OverviewRow {
  total_orders: number;
  total_revenue: number;
  avg_ticket: number;
  paid_orders: number;
  paid_revenue: number;
  cancelled_orders: number;
  cancelled_revenue: number;
}

interface MktStatusRow {
  marketplace: string;
  status: string;
  order_count: number;
  revenue: number;
}

interface MonthlyRow {
  month: string;
  status: string;
  order_count: number;
  revenue: number;
  avg_ticket: number;
}

export interface DashboardAggregated {
  overview: OverviewRow;
  paidByMkt: Record<string, number>;
  allByMkt: Record<string, number>;
  months: Array<{
    month: string;
    paid: number;
    cancelled: number;
    count: number;
    avgTicket: number;
    cancelledCount: number;
  }>;
  trends: {
    momTrend: number | null;
    ordersChange: number | null;
    avgTicketChange: number | null;
    cancellationChange: number | null;
    comparedMonths: { current: string; previous: string } | null;
  };
}

// ── SQL Helpers ────────────────────────────────────

function sanitizeDate(d: string): string {
  const clean = d.replace(/[^0-9-]/g, "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error("Formato de data inválido");
  }
  return clean;
}

function buildDateWhere(params: DashboardParams): string {
  if (params.all_time) return "";
  if (params.start_date && params.end_date) {
    const s = sanitizeDate(params.start_date);
    const e = sanitizeDate(params.end_date);
    return `AND order_date >= '${s}T00:00:00-03:00' AND order_date <= '${e}T23:59:59-03:00'`;
  }
  if (params.period_days) {
    const n = Math.abs(Math.round(Number(params.period_days)));
    return `AND order_date >= NOW() - INTERVAL '${n} days'`;
  }
  return "";
}

async function runSQL<T>(sql: string): Promise<T[]> {
  // trim() remove \n e espaços que a função PG não remove com TRIM()
  const { data, error } = await supabase.rpc("execute_readonly_query", {
    query_text: sql.trim(),
  });
  if (error) throw new Error(`SQL: ${error.message}`);
  if (!data) return [];
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(parsed) ? parsed : [];
}

// ── Cache ──────────────────────────────────────────

const cache = new Map<string, { data: DashboardAggregated; ts: number }>();
const CACHE_TTL = 60_000; // 1 minuto

function getCached(key: string): DashboardAggregated | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

// ── Main ───────────────────────────────────────────

export async function fetchDashboardAggregated(
  params: DashboardParams,
  tenantId?: string,
): Promise<DashboardAggregated> {
  const cacheKey = JSON.stringify({ ...params, tenantId });
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const dw = buildDateWhere(params);
  const tw = tenantId ? `AND tenant_id = '${tenantId}'` : "";
  const sw = params.status ? `AND LOWER(status) = '${params.status.toLowerCase().replace(/'/g, "''")}'` : "";

  // 3 queries agregadas em paralelo (~100 rows total)
  const [overviewRows, mktRows, monthlyRows] = await Promise.all([
    // 1. Totais gerais (1 row)
    runSQL<OverviewRow>(`
      SELECT
        COUNT(*)::int                                                    AS total_orders,
        COALESCE(SUM(total_amount), 0)::float                           AS total_revenue,
        COALESCE(AVG(total_amount), 0)::float                           AS avg_ticket,
        COUNT(*)      FILTER (WHERE LOWER(status) = 'paid')::int        AS paid_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'paid'), 0)::float     AS paid_revenue,
        COUNT(*)      FILTER (WHERE LOWER(status) = 'cancelled')::int   AS cancelled_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'cancelled'), 0)::float AS cancelled_revenue
      FROM orders
      WHERE 1=1 ${dw} ${tw} ${sw}
    `),

    // 2. Marketplace × Status (~20 rows)
    runSQL<MktStatusRow>(`
      SELECT
        marketplace,
        LOWER(status) AS status,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_amount), 0)::float AS revenue
      FROM orders
      WHERE 1=1 ${dw} ${tw} ${sw}
      GROUP BY marketplace, LOWER(status)
      ORDER BY revenue DESC
    `),

    // 3. Mês × Status (~50-100 rows)
    runSQL<MonthlyRow>(`
      SELECT
        TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
        LOWER(status) AS status,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_amount), 0)::float AS revenue,
        COALESCE(AVG(total_amount), 0)::float AS avg_ticket
      FROM orders
      WHERE 1=1 ${dw} ${tw} ${sw}
      GROUP BY month, LOWER(status)
      ORDER BY month, LOWER(status)
    `),
  ]);

  const result = processResults(overviewRows, mktRows, monthlyRows);
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ── Process ────────────────────────────────────────

function processResults(
  overviewRows: OverviewRow[],
  mktRows: MktStatusRow[],
  monthlyRows: MonthlyRow[],
): DashboardAggregated {
  const ov: OverviewRow = overviewRows[0] || {
    total_orders: 0,
    total_revenue: 0,
    avg_ticket: 0,
    paid_orders: 0,
    paid_revenue: 0,
    cancelled_orders: 0,
    cancelled_revenue: 0,
  };

  // ── Marketplace aggregation ──────────────────────
  const paidByMkt: Record<string, number> = {};
  const allByMkt: Record<string, number> = {};

  for (const row of mktRows) {
    const m = row.marketplace || "unknown";
    allByMkt[m] = (allByMkt[m] || 0) + row.order_count;
    if (row.status === "paid") {
      paidByMkt[m] = (paidByMkt[m] || 0) + row.revenue;
    }
  }

  // ── Monthly aggregation ──────────────────────────
  const monthMap: Record<
    string,
    { paid: number; cancelled: number; count: number; avgTicket: number; cancelledCount: number }
  > = {};

  for (const row of monthlyRows) {
    if (!monthMap[row.month]) {
      monthMap[row.month] = { paid: 0, cancelled: 0, count: 0, avgTicket: 0, cancelledCount: 0 };
    }
    monthMap[row.month].count += row.order_count;
    if (row.status === "paid") {
      monthMap[row.month].paid = row.revenue;
      monthMap[row.month].avgTicket = row.avg_ticket;
    }
    if (row.status === "cancelled") {
      monthMap[row.month].cancelled = row.revenue;
      monthMap[row.month].cancelledCount = row.order_count;
    }
  }

  const sortedMonths = Object.keys(monthMap).sort();

  // ── MoM trends ───────────────────────────────────
  let momTrend: number | null = null;
  let ordersChange: number | null = null;
  let avgTicketChange: number | null = null;
  let cancellationChange: number | null = null;
  let comparedMonths: { current: string; previous: string } | null = null;

  if (sortedMonths.length >= 2) {
    const lastKey = sortedMonths[sortedMonths.length - 1];
    const prevKey = sortedMonths[sortedMonths.length - 2];
    const last = monthMap[lastKey];
    const prev = monthMap[prevKey];

    comparedMonths = { current: lastKey, previous: prevKey };

    if (prev.paid > 0) {
      momTrend = Math.round(((last.paid - prev.paid) / prev.paid) * 10000) / 100;
    }
    if (prev.count > 0) {
      ordersChange = Math.round(((last.count - prev.count) / prev.count) * 10000) / 100;
    }
    if (prev.avgTicket > 0) {
      avgTicketChange =
        Math.round(((last.avgTicket - prev.avgTicket) / prev.avgTicket) * 10000) / 100;
    }
    const lastCRate = last.count > 0 ? (last.cancelledCount / last.count) * 100 : 0;
    const prevCRate = prev.count > 0 ? (prev.cancelledCount / prev.count) * 100 : 0;
    cancellationChange = Math.round((lastCRate - prevCRate) * 100) / 100;
  }

  return {
    overview: ov,
    paidByMkt,
    allByMkt,
    months: sortedMonths.map((m) => ({ month: m, ...monthMap[m] })),
    trends: { momTrend, ordersChange, avgTicketChange, cancellationChange, comparedMonths },
  };
}

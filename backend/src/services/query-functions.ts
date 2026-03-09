import { supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";

// ── Redis Cache Helper ──────────────────────────────────
const CACHE_TTL_SECONDS = 3600; // 1 hour

async function withCache<T>(key: string, fn: () => Promise<T>, ttl = CACHE_TTL_SECONDS): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      console.log(`[Cache] HIT ${key}`);
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    console.warn(`[Cache] Read error for ${key}:`, err);
  }

  console.log(`[Cache] MISS ${key}`);
  const result = await fn();

  try {
    await redis.set(key, JSON.stringify(result), "EX", ttl);
  } catch (err) {
    console.warn(`[Cache] Write error for ${key}:`, err);
  }

  return result;
}

/**
 * Query Functions — SQL-Aggregated Analytics for E-Commerce
 *
 * BEFORE: fetchAllRows pulled ~40k rows via paginated REST API (40+ HTTP requests)
 *         then aggregated in Node.js memory
 * NOW:    1-3 SQL queries with GROUP BY per function (~10-100 rows returned)
 *         ~50x fewer HTTP requests, ~100x less memory, ~10x faster
 *
 * FUNCTIONS (23):
 *  1. countOrders          — Count orders
 *  2. totalSales           — Total revenue
 *  3. avgTicket            — Average ticket
 *  4. ordersByStatus       — Distribution by status
 *  5. ordersByMarketplace  — Sales by marketplace
 *  6. salesByMonth         — Monthly evolution
 *  7. salesByDayOfWeek     — Performance by day of week
 *  8. topDays              — Best/worst sales days
 *  9. cancellationRate     — Cancellation rate
 * 10. compareMarketplaces  — Detailed marketplace comparison
 * 11. comparePeriods       — Period-over-period comparison
 * 12. salesByHour          — Distribution by hour
 * 13. salesForecast        — Revenue forecast
 * 14. executiveSummary     — Complete executive summary
 * 15. marketplaceGrowth    — Monthly evolution per marketplace
 * 16. cancellationByMonth  — Monthly cancellation evolution
 * 17. yearOverYear         — Year-over-year comparison
 * 18. seasonalityAnalysis  — Seasonality patterns
 * 19. healthCheck          — Smart diagnostic with alerts
 * 20. getRFMAnalysis       — RFM customer segmentation
 * 21. marketBasketLite     — Market basket analysis (cross-sell)
 * 22. getMetricCorrelation — Metric correlation analysis
 * 23. getSmartSegments     — Smart customer segmentation (churn/upsell)
 */

// ── Types ───────────────────────────────────────────────
export interface QueryParams {
  status?: string;
  marketplace?: string;
  start_date?: string;
  end_date?: string;
  period_days?: number;
  all_time?: boolean;
  limit?: number;
  order?: "best" | "worst";
  compare_start_date?: string;
  compare_end_date?: string;
  group_by?: string;
  _tenant_id?: string | null;
}

// ── SQL Helpers ─────────────────────────────────────────

/**
 * Executes a SELECT query via supabase.rpc('execute_readonly_query').
 * Passes tenant_id to the function for automatic tenant filtering.
 */
async function runSQL<T>(sql: string, tenantId?: string | null): Promise<T[]> {
  const params: Record<string, unknown> = { query_text: sql.trim() };
  if (tenantId) params.p_tenant_id = tenantId;

  const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", params);
  if (error) throw new Error(`SQL error: ${error.message}`);
  if (!data) return [];
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Validates a YYYY-MM-DD string. If the date is invalid (e.g. 2026-02-29),
 * clamps the day to the last valid day of that month.
 */
function safeDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  // Get last valid day of the month (month is 1-indexed, Date uses 0-indexed)
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);

  return `${yearStr}-${monthStr}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Escapes a string value for safe use in SQL literals.
 * - Escapes single quotes (SQL injection)
 * - Escapes backslashes (PostgreSQL)
 * - Strips LIKE wildcards (% and _) when used in LIKE clauses
 */
function escapeSQL(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function escapeLike(value: string): string {
  return escapeSQL(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Validates that a string only contains safe alphanumeric/space/accent characters.
 * Rejects input with SQL meta-characters that shouldn't appear in status/marketplace names.
 */
function isSafeIdentifier(value: string): boolean {
  // Allow letters (including accented), digits, spaces, hyphens, underscores, dots
  return /^[\p{L}\p{N}\s\-_.,()]+$/u.test(value) && value.length <= 100;
}

/**
 * Builds WHERE clause fragments from params.
 * tenant_id is handled by the RPC function, not here.
 */
function buildWhere(params: QueryParams, opts: { includeStatus?: boolean; includeMarketplace?: boolean } = {}): string {
  const { includeStatus = true, includeMarketplace = true } = opts;
  const clauses: string[] = ["1=1"];

  // Date filter (already validated by safeDate)
  if (params.start_date && params.end_date) {
    const s = safeDate(params.start_date.replace(/[^0-9-]/g, "").substring(0, 10));
    const e = safeDate(params.end_date.replace(/[^0-9-]/g, "").substring(0, 10));
    clauses.push(`order_date >= '${s}T00:00:00-03:00' AND order_date <= '${e}T23:59:59-03:00'`);
  } else if (params.period_days) {
    const n = Math.abs(Math.round(Number(params.period_days)));
    clauses.push(`order_date >= NOW() - INTERVAL '${n} days'`);
  }

  // Status filter — validated + escaped
  if (includeStatus && params.status) {
    if (!isSafeIdentifier(params.status)) {
      throw new Error("Valor de status inválido");
    }
    clauses.push(`LOWER(status) = LOWER('${escapeSQL(params.status)}')`);
  }

  // Marketplace filter — validated + escaped (including LIKE wildcards)
  if (includeMarketplace && params.marketplace) {
    if (!isSafeIdentifier(params.marketplace)) {
      throw new Error("Valor de marketplace inválido");
    }
    clauses.push(`LOWER(marketplace) LIKE LOWER('%${escapeLike(params.marketplace)}%')`);
  }

  return clauses.join(" AND ");
}

function fmtPeriod(params: QueryParams) {
  if (params.all_time) return "todos os periodos";
  if (params.start_date && params.end_date) return { start: params.start_date, end: params.end_date };
  if (params.period_days) return { start: `últimos ${params.period_days} dias`, end: "hoje" };
  return "todos os periodos";
}

function rnd(n: number, dec = 2): number {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

// ── Metadata ────────────────────────────────────────────
export async function getDistinctValues(tenantId?: string | null) {
  try {
    const rpcParams: Record<string, unknown> = {};
    if (tenantId) rpcParams.p_tenant_id = tenantId;
    const { data, error } = await supabaseAdmin.rpc("get_orders_metadata", rpcParams);
    if (!error && data) {
      const meta = typeof data === "string" ? JSON.parse(data) : data;
      const statuses = Array.isArray(meta.statuses) ? meta.statuses.filter(Boolean).sort() : [];
      const marketplaces = Array.isArray(meta.marketplaces) ? meta.marketplaces.filter(Boolean).sort() : [];
      if (statuses.length > 0) return { statuses, marketplaces };
    }
  } catch (err) {
    console.warn("[getDistinctValues] fallback:", err);
  }

  // Fallback: single SQL query
  const tid = tenantId;
  const rows = await runSQL<{ statuses: string[]; marketplaces: string[] }>(`
    SELECT
      array_agg(DISTINCT status ORDER BY status) FILTER (WHERE status IS NOT NULL) AS statuses,
      array_agg(DISTINCT marketplace ORDER BY marketplace) FILTER (WHERE marketplace IS NOT NULL) AS marketplaces
    FROM orders
  `, tid);

  if (rows[0]) {
    return {
      statuses: (rows[0].statuses || []).filter(Boolean),
      marketplaces: (rows[0].marketplaces || []).filter(Boolean),
    };
  }
  return { statuses: [], marketplaces: [] };
}

// ═══════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════

// ── 1. countOrders ──────────────────────────────────────
export async function countOrders(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:countOrders:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      // Single query: total + breakdown by status
      const rows = await runSQL<{ status: string; cnt: number }>(`
        SELECT LOWER(status) AS status, COUNT(*)::int AS cnt
        FROM orders WHERE ${w}
        GROUP BY LOWER(status)
      `, tid);

      const total = rows.reduce((s, r) => s + r.cnt, 0);
      const byStatus: Record<string, number> | undefined = !params.status
        ? Object.fromEntries(rows.map(r => [r.status || "unknown", r.cnt]))
        : undefined;

      return {
        total,
        by_status: byStatus,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 2. totalSales ───────────────────────────────────────
export async function totalSales(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:totalSales:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ status: string; cnt: number; total: number }>(`
        SELECT LOWER(status) AS status, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY LOWER(status)
      `, tid);

      const grandTotal = rows.reduce((s, r) => s + r.total, 0);
      const grandCount = rows.reduce((s, r) => s + r.cnt, 0);

      let byStatus: Record<string, { count: number; total: number }> | undefined;
      if (!params.status) {
        byStatus = {};
        rows.forEach(r => { byStatus![r.status || "unknown"] = { count: r.cnt, total: rnd(r.total) }; });
      }

      return {
        total_sales: rnd(grandTotal),
        order_count: grandCount,
        by_status: byStatus,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 3. avgTicket ────────────────────────────────────────
export async function avgTicket(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:avgTicket:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ cnt: number; total: number; avg: number }>(`
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total,
               COALESCE(AVG(total_amount), 0)::float AS avg
        FROM orders WHERE ${w}
      `, tid);

      const r = rows[0] || { cnt: 0, total: 0, avg: 0 };
      return {
        avg_ticket: rnd(r.avg),
        order_count: r.cnt,
        total_sales: rnd(r.total),
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 4. ordersByStatus ───────────────────────────────────
export async function ordersByStatus(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:ordersByStatus:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeStatus: false });
      const tid = params._tenant_id;

      const rows = await runSQL<{ status: string; cnt: number; total: number }>(`
        SELECT LOWER(status) AS status, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY LOWER(status) ORDER BY cnt DESC
      `, tid);

      const grand = rows.reduce((s, r) => s + r.cnt, 0);
      const statuses = Object.fromEntries(rows.map(r => [
        r.status || "unknown",
        { count: r.cnt, total: rnd(r.total), pct: grand > 0 ? rnd((r.cnt / grand) * 100) : 0 },
      ]));

      return {
        statuses,
        total_orders: grand,
        filters: { marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 5. ordersByMarketplace ──────────────────────────────
export async function ordersByMarketplace(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:ordersByMarketplace:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeMarketplace: false });
      const tid = params._tenant_id;

      // Marketplace × Status aggregation
      const rows = await runSQL<{ marketplace: string; status: string; cnt: number; total: number }>(`
        SELECT marketplace, LOWER(status) AS status, COUNT(*)::int AS cnt,
               COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY marketplace, LOWER(status)
        ORDER BY marketplace
      `, tid);

      const grouped: Record<string, { count: number; total: number; by_status: Record<string, { count: number; total: number }> }> = {};
      rows.forEach(r => {
        const m = r.marketplace || "desconhecido";
        if (!grouped[m]) grouped[m] = { count: 0, total: 0, by_status: {} };
        grouped[m].count += r.cnt;
        grouped[m].total += r.total;
        if (!params.status) {
          grouped[m].by_status[r.status || "unknown"] = { count: r.cnt, total: rnd(r.total) };
        }
      });

      for (const k of Object.keys(grouped)) grouped[k].total = rnd(grouped[k].total);

      let globalByStatus: Record<string, { count: number; total: number }> | undefined;
      if (!params.status) {
        globalByStatus = {};
        rows.forEach(r => {
          const s = r.status || "unknown";
          if (!globalByStatus![s]) globalByStatus![s] = { count: 0, total: 0 };
          globalByStatus![s].count += r.cnt;
          globalByStatus![s].total += r.total;
        });
        for (const s of Object.keys(globalByStatus)) globalByStatus[s].total = rnd(globalByStatus[s].total);
      }

      const totalOrders = Object.values(grouped).reduce((s, g) => s + g.count, 0);
      return {
        marketplaces: grouped,
        total_orders: totalOrders,
        by_status: globalByStatus,
        filters: { status: params.status, period: fmtPeriod(params) },
      };
  });
}

// ── 6. salesByMonth ─────────────────────────────────────
export async function salesByMonth(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:salesByMonth:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      // status breakdown per month if no status filter
      const statusCol = !params.status ? ", LOWER(status) AS status" : "";
      const statusGroup = !params.status ? ", LOWER(status)" : "";

      const rows = await runSQL<{ month: string; status?: string; cnt: number; total: number; avg: number }>(`
        SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month
               ${statusCol},
               COUNT(*)::int AS cnt,
               COALESCE(SUM(total_amount), 0)::float AS total,
               COALESCE(AVG(total_amount), 0)::float AS avg
        FROM orders WHERE ${w}
        GROUP BY month ${statusGroup}
        ORDER BY month
      `, tid);

      // Aggregate into months
      const monthMap: Record<string, {
        count: number; total: number; avgTicket: number;
        by_status?: Record<string, { count: number; total: number }>;
      }> = {};

      rows.forEach(r => {
        if (!monthMap[r.month]) monthMap[r.month] = { count: 0, total: 0, avgTicket: 0, by_status: !params.status ? {} : undefined };
        monthMap[r.month].count += r.cnt;
        monthMap[r.month].total += r.total;
        if (!params.status && r.status) {
          monthMap[r.month].by_status![r.status] = { count: r.cnt, total: rnd(r.total) };
        }
      });

      // Calculate avgTicket per month
      for (const m of Object.values(monthMap)) {
        m.avgTicket = m.count > 0 ? rnd(m.total / m.count) : 0;
        m.total = rnd(m.total);
      }

      const sortedKeys = Object.keys(monthMap).sort();
      const months = sortedKeys.map((month, i) => ({
        month,
        count: monthMap[month].count,
        total: monthMap[month].total,
        avg_ticket: monthMap[month].avgTicket,
        by_status: monthMap[month].by_status,
        growth_pct: i > 0 && monthMap[sortedKeys[i - 1]].total > 0
          ? rnd(((monthMap[month].total - monthMap[sortedKeys[i - 1]].total) / monthMap[sortedKeys[i - 1]].total) * 100)
          : null,
      }));

      const grandTotal = months.reduce((s, m) => s + m.total, 0);
      const grandCount = months.reduce((s, m) => s + m.count, 0);

      // Global by_status
      let globalByStatus: Record<string, { count: number; total: number }> | undefined;
      if (!params.status) {
        globalByStatus = {};
        rows.forEach(r => {
          const s = r.status || "unknown";
          if (!globalByStatus![s]) globalByStatus![s] = { count: 0, total: 0 };
          globalByStatus![s].count += r.cnt;
          globalByStatus![s].total += r.total;
        });
        for (const s of Object.keys(globalByStatus)) globalByStatus[s].total = rnd(globalByStatus[s].total);
      }

      return {
        months,
        grand_total: rnd(grandTotal),
        grand_count: grandCount,
        by_status: globalByStatus,
        best_month: months.length > 0 ? months.reduce((b, m) => m.total > b.total ? m : b, months[0]) : null,
        worst_month: months.length > 0 ? months.reduce((w, m) => m.total < w.total ? m : w, months[0]) : null,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 7. salesByDayOfWeek ─────────────────────────────────
export async function salesByDayOfWeek(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:salesByDayOfWeek:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ dow: number; cnt: number; total: number }>(`
        SELECT EXTRACT(DOW FROM order_date AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY dow ORDER BY dow
      `, tid);

      const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
      const days = Array.from({ length: 7 }, (_, i) => {
        const r = rows.find(r => r.dow === i);
        return {
          name: dayNames[i],
          count: r?.cnt || 0,
          total: rnd(r?.total || 0),
          avg_ticket: r && r.cnt > 0 ? rnd(r.total / r.cnt) : 0,
        };
      });

      const totalOrders = days.reduce((s, d) => s + d.count, 0);
      return {
        days,
        best_day: days.reduce((b, d) => d.total > b.total ? d : b, days[0]),
        worst_day: days.reduce((w, d) => d.total < w.total ? d : w, days[0]),
        total_orders: totalOrders,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 8. topDays ──────────────────────────────────────────
export async function topDays(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:topDays:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;
      const limit = params.limit || 10;
      const isWorst = params.order === "worst";

      const [byRevenue, byVolume] = await Promise.all([
        runSQL<{ day: string; cnt: number; total: number }>(`
          SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
          FROM orders WHERE ${w}
          GROUP BY day ORDER BY total ${isWorst ? 'ASC' : 'DESC'} LIMIT ${limit}
        `, tid),
        runSQL<{ day: string; cnt: number; total: number }>(`
          SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
          FROM orders WHERE ${w}
          GROUP BY day ORDER BY cnt ${isWorst ? 'ASC' : 'DESC'} LIMIT ${limit}
        `, tid),
      ]);

      return {
        by_revenue: byRevenue.map(r => ({ date: r.day, count: r.cnt, total: rnd(r.total) })),
        by_volume: byVolume.map(r => ({ date: r.day, count: r.cnt, total: rnd(r.total) })),
        type: isWorst ? "piores" : "melhores",
        limit,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 9. cancellationRate ─────────────────────────────────
export async function cancellationRate(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:cancellationRate:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeStatus: false });
      const tid = params._tenant_id;

      // Overall + by marketplace in one query
      const rows = await runSQL<{ marketplace: string; status: string; cnt: number; total: number }>(`
        SELECT marketplace, LOWER(status) AS status, COUNT(*)::int AS cnt,
               COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY marketplace, LOWER(status)
      `, tid);

      let grandTotal = 0, cancelledOrders = 0, cancelledAmount = 0, paidOrders = 0, paidAmount = 0;
      const byMkt: Record<string, { total: number; cancelled: number; rate: number }> = {};

      rows.forEach(r => {
        const m = r.marketplace || "desconhecido";
        if (!byMkt[m]) byMkt[m] = { total: 0, cancelled: 0, rate: 0 };
        byMkt[m].total += r.cnt;
        grandTotal += r.cnt;

        if (r.status === "cancelled") { cancelledOrders += r.cnt; cancelledAmount += r.total; byMkt[m].cancelled += r.cnt; }
        if (r.status === "paid") { paidOrders += r.cnt; paidAmount += r.total; }
      });

      for (const k of Object.keys(byMkt)) {
        byMkt[k].rate = byMkt[k].total > 0 ? rnd((byMkt[k].cancelled / byMkt[k].total) * 100) : 0;
      }

      return {
        total_orders: grandTotal,
        cancelled_orders: cancelledOrders,
        cancellation_rate: grandTotal > 0 ? rnd((cancelledOrders / grandTotal) * 100) : 0,
        cancelled_amount: rnd(cancelledAmount),
        paid_orders: paidOrders,
        paid_amount: rnd(paidAmount),
        by_marketplace: byMkt,
        filters: { marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 10. compareMarketplaces ─────────────────────────────
export async function compareMarketplaces(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:compareMarketplaces:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeMarketplace: false, includeStatus: false });
      const tid = params._tenant_id;

      const rows = await runSQL<{ marketplace: string; status: string; cnt: number; total: number }>(`
        SELECT marketplace, LOWER(status) AS status, COUNT(*)::int AS cnt,
               COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY marketplace, LOWER(status)
      `, tid);

      const mktData: Record<string, { count: number; total: number; paid: number; cancelled: number; paid_amount: number }> = {};
      rows.forEach(r => {
        const m = r.marketplace || "desconhecido";
        if (!mktData[m]) mktData[m] = { count: 0, total: 0, paid: 0, cancelled: 0, paid_amount: 0 };
        mktData[m].count += r.cnt;
        mktData[m].total += r.total;
        if (r.status === "paid") { mktData[m].paid += r.cnt; mktData[m].paid_amount += r.total; }
        if (r.status === "cancelled") mktData[m].cancelled += r.cnt;
      });

      const grandTotal = Object.values(mktData).reduce((s, d) => s + d.total, 0);
      const comparison = Object.entries(mktData)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([name, d]) => ({
          marketplace: name,
          orders: d.count,
          revenue: rnd(d.total),
          revenue_share: grandTotal > 0 ? rnd((d.total / grandTotal) * 100) : 0,
          avg_ticket: d.count > 0 ? rnd(d.total / d.count) : 0,
          paid_orders: d.paid,
          cancelled_orders: d.cancelled,
          cancellation_rate: d.count > 0 ? rnd((d.cancelled / d.count) * 100) : 0,
          conversion_rate: d.count > 0 ? rnd((d.paid / d.count) * 100) : 0,
        }));

      return {
        comparison,
        total_orders: Object.values(mktData).reduce((s, d) => s + d.count, 0),
        total_revenue: rnd(grandTotal),
        filters: { period: fmtPeriod(params) },
      };
  });
}

// ── 11. comparePeriods ──────────────────────────────────
export async function comparePeriods(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:comparePeriods:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    if (!params.start_date || !params.end_date) {
        if (!params.period_days) return { error: "Especifique um periodo para comparacao (start_date/end_date ou period_days)" };
      }

      const tid = params._tenant_id;
      const wCurrent = buildWhere(params);

      // Calculate previous period
      let prevStart: string, prevEnd: string;
      if (params.start_date && params.end_date) {
        const s = new Date(params.start_date);
        const e = new Date(params.end_date);
        const diffMs = e.getTime() - s.getTime();
        const pe = new Date(s.getTime() - 86400000); // day before current start
        const ps = new Date(pe.getTime() - diffMs);
        prevStart = ps.toISOString().substring(0, 10);
        prevEnd = pe.toISOString().substring(0, 10);
      } else {
        const days = params.period_days!;
        prevStart = `NOW() - INTERVAL '${days * 2} days'`;
        prevEnd = `NOW() - INTERVAL '${days} days'`;
      }

      const statusFilter = params.status ? `AND LOWER(status) = LOWER('${params.status.replace(/'/g, "''")}')` : "";
      const mktFilter = params.marketplace ? `AND LOWER(marketplace) LIKE LOWER('%${params.marketplace.replace(/'/g, "''")}%')` : "";

      const wPrev = params.start_date
        ? `order_date >= '${prevStart}T00:00:00-03:00' AND order_date <= '${prevEnd}T23:59:59-03:00' ${statusFilter} ${mktFilter}`
        : `order_date >= ${prevStart} AND order_date < ${prevEnd} ${statusFilter} ${mktFilter}`;

      const metricsSQL = (where: string) => `
        SELECT COUNT(*)::int AS orders,
               COALESCE(SUM(total_amount), 0)::float AS revenue,
               COALESCE(AVG(total_amount), 0)::float AS avg_ticket,
               COUNT(*) FILTER (WHERE LOWER(status) = 'paid')::int AS paid_orders,
               COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'paid'), 0)::float AS paid_revenue
        FROM orders WHERE ${where}
      `;

      const [currentRows, prevRows] = await Promise.all([
        runSQL<{ orders: number; revenue: number; avg_ticket: number; paid_orders: number; paid_revenue: number }>(metricsSQL(wCurrent), tid),
        runSQL<{ orders: number; revenue: number; avg_ticket: number; paid_orders: number; paid_revenue: number }>(metricsSQL(`1=1 AND ${wPrev}`), tid),
      ]);

      const current = currentRows[0] || { orders: 0, revenue: 0, avg_ticket: 0, paid_orders: 0, paid_revenue: 0 };
      const previous = prevRows[0] || { orders: 0, revenue: 0, avg_ticket: 0, paid_orders: 0, paid_revenue: 0 };

      const pctChange = (curr: number, prev: number) => prev > 0 ? rnd(((curr - prev) / prev) * 100) : null;

      return {
        current_period: { start: params.start_date || "", end: params.end_date || "", ...{ orders: current.orders, revenue: rnd(current.revenue), avg_ticket: rnd(current.avg_ticket), paid_orders: current.paid_orders, paid_revenue: rnd(current.paid_revenue) } },
        previous_period: { start: prevStart, end: prevEnd, ...{ orders: previous.orders, revenue: rnd(previous.revenue), avg_ticket: rnd(previous.avg_ticket), paid_orders: previous.paid_orders, paid_revenue: rnd(previous.paid_revenue) } },
        changes: {
          orders: pctChange(current.orders, previous.orders),
          revenue: pctChange(current.revenue, previous.revenue),
          avg_ticket: pctChange(current.avg_ticket, previous.avg_ticket),
          paid_orders: pctChange(current.paid_orders, previous.paid_orders),
        },
        filters: { status: params.status, marketplace: params.marketplace },
      };
  });
}

// ── 12. salesByHour ─────────────────────────────────────
export async function salesByHour(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:salesByHour:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ hour: number; cnt: number; total: number }>(`
        SELECT EXTRACT(HOUR FROM order_date AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY hour ORDER BY hour
      `, tid);

      const hours = Array.from({ length: 24 }, (_, i) => {
        const r = rows.find(r => r.hour === i);
        return {
          hour: i,
          label: `${String(i).padStart(2, "0")}:00`,
          count: r?.cnt || 0,
          total: rnd(r?.total || 0),
          avg_ticket: r && r.cnt > 0 ? rnd(r.total / r.cnt) : 0,
        };
      });

      const peak = hours.reduce((b, h) => h.count > b.count ? h : b, hours[0]);
      return {
        hours,
        peak_hour: peak,
        total_orders: hours.reduce((s, h) => s + h.count, 0),
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 13. salesForecast ───────────────────────────────────
export async function salesForecast(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:salesForecast:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeStatus: false });
      const tid = params._tenant_id;

      const rows = await runSQL<{ month: string; cnt: number; total: number }>(`
        SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY month ORDER BY month
      `, tid);

      if (rows.length < 3) return { error: "Dados insuficientes para previsao. Necessario pelo menos 3 meses." };

      const months = rows.map((r, i) => ({ month: r.month, index: i, revenue: r.total, orders: r.cnt }));
      const n = months.length;

      // Moving average (3 months)
      const movingAvg3 = (months[n - 1].revenue + months[n - 2].revenue + months[n - 3].revenue) / 3;

      // Linear regression
      const sumX = months.reduce((s, m) => s + m.index, 0);
      const sumY = months.reduce((s, m) => s + m.revenue, 0);
      const sumXY = months.reduce((s, m) => s + m.index * m.revenue, 0);
      const sumX2 = months.reduce((s, m) => s + m.index * m.index, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const linearForecast = intercept + slope * n;
      const forecast = movingAvg3 * 0.7 + linearForecast * 0.3;

      const avgRevenue = sumY / n;
      const trend = slope > avgRevenue * 0.02 ? "crescimento" : slope < -avgRevenue * 0.02 ? "queda" : "estavel";

      // Current month projection
      const now = new Date();
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const curMonth = rows.find(r => r.month === curKey);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysPassed = now.getDate();

      return {
        forecast_next_month: rnd(forecast),
        moving_avg_3m: rnd(movingAvg3),
        linear_trend_forecast: rnd(linearForecast),
        current_month: curMonth ? {
          month: curKey,
          actual_so_far: rnd(curMonth.total),
          orders_so_far: curMonth.cnt,
          days_passed: daysPassed,
          days_in_month: daysInMonth,
          projected_total: rnd((curMonth.total / daysPassed) * daysInMonth),
        } : null,
        last_complete_month: { month: months[n - 1].month, revenue: rnd(months[n - 1].revenue), orders: months[n - 1].orders },
        trend,
        avg_monthly_revenue: rnd(avgRevenue),
        months_analyzed: n,
        strong_months: months.filter(m => m.revenue > avgRevenue).map(m => m.month),
        weak_months: months.filter(m => m.revenue < avgRevenue).map(m => m.month),
        filters: { status: params.status, marketplace: params.marketplace },
      };
  });
}

// ── 14. executiveSummary ────────────────────────────────
export async function executiveSummary(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:executiveSummary:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeStatus: false });
      const tid = params._tenant_id;

      // 3 aggregated queries in parallel
      const [overviewRows, mktRows, monthlyRows] = await Promise.all([
        runSQL<{ total_orders: number; total_revenue: number; avg_ticket: number; paid_orders: number; paid_revenue: number; cancelled_orders: number; cancelled_revenue: number }>(`
          SELECT COUNT(*)::int AS total_orders,
                 COALESCE(SUM(total_amount), 0)::float AS total_revenue,
                 COALESCE(AVG(total_amount), 0)::float AS avg_ticket,
                 COUNT(*) FILTER (WHERE LOWER(status) = 'paid')::int AS paid_orders,
                 COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'paid'), 0)::float AS paid_revenue,
                 COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::int AS cancelled_orders,
                 COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'cancelled'), 0)::float AS cancelled_revenue
          FROM orders WHERE ${w}
        `, tid),
        runSQL<{ marketplace: string; cnt: number; total: number }>(`
          SELECT marketplace, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
          FROM orders WHERE ${w}
          GROUP BY marketplace ORDER BY total DESC
        `, tid),
        runSQL<{ month: string; cnt: number; total: number }>(`
          SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
                 COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
          FROM orders WHERE ${w}
          GROUP BY month ORDER BY month
        `, tid),
      ]);

      // Also get status breakdown
      const statusRows = await runSQL<{ status: string; cnt: number; total: number }>(`
        SELECT LOWER(status) AS status, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY LOWER(status) ORDER BY cnt DESC
      `, tid);

      const ov = overviewRows[0] || { total_orders: 0, total_revenue: 0, avg_ticket: 0, paid_orders: 0, paid_revenue: 0, cancelled_orders: 0, cancelled_revenue: 0 };

      let monthTrend = null;
      if (monthlyRows.length >= 2) {
        const last = monthlyRows[monthlyRows.length - 1].total;
        const prev = monthlyRows[monthlyRows.length - 2].total;
        monthTrend = prev > 0 ? rnd(((last - prev) / prev) * 100) : null;
      }

      const bestMonth = monthlyRows.length > 0 ? monthlyRows.reduce((b, m) => m.total > b.total ? m : b) : null;
      const worstMonth = monthlyRows.length > 0 ? monthlyRows.reduce((w, m) => m.total < w.total ? m : w) : null;

      return {
        overview: {
          total_orders: ov.total_orders,
          total_revenue: rnd(ov.total_revenue),
          avg_ticket: rnd(ov.avg_ticket),
          period: fmtPeriod(params),
        },
        health: {
          paid_orders: ov.paid_orders,
          paid_revenue: rnd(ov.paid_revenue),
          paid_pct: ov.total_orders > 0 ? rnd((ov.paid_orders / ov.total_orders) * 100) : 0,
          cancelled_orders: ov.cancelled_orders,
          cancelled_revenue: rnd(ov.cancelled_revenue),
          cancellation_rate: ov.total_orders > 0 ? rnd((ov.cancelled_orders / ov.total_orders) * 100) : 0,
        },
        channels: mktRows.map(r => ({
          marketplace: r.marketplace,
          revenue: rnd(r.total),
          share: ov.total_revenue > 0 ? rnd((r.total / ov.total_revenue) * 100) : 0,
          orders: r.cnt,
          avg_ticket: r.cnt > 0 ? rnd(r.total / r.cnt) : 0,
        })),
        timeline: {
          months_count: monthlyRows.length,
          best_month: bestMonth ? { month: bestMonth.month, revenue: rnd(bestMonth.total) } : null,
          worst_month: worstMonth ? { month: worstMonth.month, revenue: rnd(worstMonth.total) } : null,
          latest_month_trend: monthTrend,
        },
        status_breakdown: statusRows.map(r => ({
          status: r.status,
          count: r.cnt,
          pct: ov.total_orders > 0 ? rnd((r.cnt / ov.total_orders) * 100) : 0,
          revenue: rnd(r.total),
        })),
      };
  });
}

// ── 15. marketplaceGrowth ───────────────────────────────
export async function marketplaceGrowth(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:marketplaceGrowth:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ marketplace: string; month: string; cnt: number; total: number }>(`
        SELECT marketplace,
               TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY marketplace, month ORDER BY marketplace, month
      `, tid);

      const mktMonths: Record<string, Array<{ month: string; orders: number; revenue: number; growth_pct: number | null }>> = {};
      const mktMap: Record<string, Record<string, { cnt: number; total: number }>> = {};

      rows.forEach(r => {
        const m = r.marketplace || "desconhecido";
        if (!mktMap[m]) mktMap[m] = {};
        mktMap[m][r.month] = { cnt: r.cnt, total: r.total };
      });

      for (const [mkt, monthData] of Object.entries(mktMap)) {
        const sorted = Object.entries(monthData).sort(([a], [b]) => a.localeCompare(b));
        mktMonths[mkt] = sorted.map(([month, d], i) => ({
          month,
          orders: d.cnt,
          revenue: rnd(d.total),
          growth_pct: i > 0 && sorted[i - 1][1].total > 0
            ? rnd(((d.total - sorted[i - 1][1].total) / sorted[i - 1][1].total) * 100)
            : null,
        }));
      }

      return {
        marketplaces: mktMonths,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 16. cancellationByMonth ─────────────────────────────
export async function cancellationByMonth(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:cancellationByMonth:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params, { includeStatus: false });
      const tid = params._tenant_id;

      const rows = await runSQL<{ month: string; status: string; cnt: number; total: number }>(`
        SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
               LOWER(status) AS status, COUNT(*)::int AS cnt,
               COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY month, LOWER(status) ORDER BY month
      `, tid);

      const monthMap: Record<string, { total: number; cancelled: number; cancelledAmount: number; totalOrders: number }> = {};
      rows.forEach(r => {
        if (!monthMap[r.month]) monthMap[r.month] = { total: 0, cancelled: 0, cancelledAmount: 0, totalOrders: 0 };
        monthMap[r.month].totalOrders += r.cnt;
        monthMap[r.month].total += r.total;
        if (r.status === "cancelled") { monthMap[r.month].cancelled += r.cnt; monthMap[r.month].cancelledAmount += r.total; }
      });

      const months = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({
          month,
          total_orders: d.totalOrders,
          cancelled_orders: d.cancelled,
          cancellation_rate: d.totalOrders > 0 ? rnd((d.cancelled / d.totalOrders) * 100) : 0,
          cancelled_amount: rnd(d.cancelledAmount),
        }));

      const avgRate = months.length > 0 ? rnd(months.reduce((s, m) => s + m.cancellation_rate, 0) / months.length) : 0;
      return {
        months,
        avg_cancellation_rate: avgRate,
        filters: { marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

// ── 17. yearOverYear ────────────────────────────────────
export async function yearOverYear(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:yearOverYear:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      // Annual totals
      const rows = await runSQL<{ year: string; cnt: number; total: number; avg: number }>(`
        SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY') AS year,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total,
               COALESCE(AVG(total_amount), 0)::float AS avg
        FROM orders WHERE ${w}
        GROUP BY year ORDER BY year
      `, tid);

      const years = rows.map((r, i) => ({
        year: r.year,
        orders: r.cnt,
        revenue: rnd(r.total),
        avg_ticket: rnd(r.avg),
        growth_pct: i > 0 && rows[i - 1].total > 0 ? rnd(((r.total - rows[i - 1].total) / rows[i - 1].total) * 100) : null,
      }));

      // Monthly breakdown across years (e.g. Jan 2025 vs Jan 2026)
      const monthRows = await runSQL<{ year: string; month: string; cnt: number; total: number; avg: number }>(`
        SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY') AS year,
               TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'MM') AS month,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total,
               COALESCE(AVG(total_amount), 0)::float AS avg
        FROM orders WHERE ${w}
        GROUP BY year, month ORDER BY month, year
      `, tid);

      // Group by month for cross-year comparison
      const monthMap: Record<string, Array<{ year: string; orders: number; revenue: number; avg_ticket: number }>> = {};
      monthRows.forEach(r => {
        if (!monthMap[r.month]) monthMap[r.month] = [];
        monthMap[r.month].push({ year: r.year, orders: r.cnt, revenue: rnd(r.total), avg_ticket: rnd(r.avg) });
      });

      const monthlyComparison = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, yearData]) => {
          const sorted = yearData.sort((a, b) => a.year.localeCompare(b.year));
          const lastTwo = sorted.length >= 2 ? sorted.slice(-2) : sorted;
          const growthPct = lastTwo.length === 2 && lastTwo[0].revenue > 0
            ? rnd(((lastTwo[1].revenue - lastTwo[0].revenue) / lastTwo[0].revenue) * 100)
            : null;
          return { month, years: sorted, growth_pct: growthPct };
        });

      return {
        years,
        monthly_comparison: monthlyComparison,
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}


// ── 18. seasonalityAnalysis ─────────────────────────────
export async function seasonalityAnalysis(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:seasonalityAnalysis:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const w = buildWhere(params);
      const tid = params._tenant_id;

      const rows = await runSQL<{ month_num: number; cnt: number; total: number }>(`
        SELECT EXTRACT(MONTH FROM order_date AT TIME ZONE 'America/Sao_Paulo')::int AS month_num,
               COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
        FROM orders WHERE ${w}
        GROUP BY month_num ORDER BY month_num
      `, tid);

      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const months = Array.from({ length: 12 }, (_, i) => {
        const r = rows.find(r => r.month_num === i + 1);
        return {
          month: i + 1,
          name: monthNames[i],
          orders: r?.cnt || 0,
          revenue: rnd(r?.total || 0),
          avg_ticket: r && r.cnt > 0 ? rnd(r.total / r.cnt) : 0,
        };
      });

      const withData = months.filter(m => m.orders > 0);
      const avgRevenue = withData.length > 0 ? withData.reduce((s, m) => s + m.revenue, 0) / withData.length : 0;

      return {
        months,
        strongest: withData.length > 0 ? withData.reduce((b, m) => m.revenue > b.revenue ? m : b) : null,
        weakest: withData.length > 0 ? withData.reduce((w, m) => m.revenue < w.revenue ? m : w) : null,
        avg_monthly_revenue: rnd(avgRevenue),
        filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(params) },
      };
  });
}

/**
 * Calculates Z-score for a value relative to a distribution.
 * Z = (x - mean) / stdDev
 */
function calcZScore(value: number, distribution: number[]): { z: number; mean: number; std: number } {
  if (distribution.length === 0) return { z: 0, mean: 0, std: 0 };
  const mean = distribution.reduce((a, b) => a + b, 0) / distribution.length;
  const std = Math.sqrt(distribution.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / distribution.length);
  return { z: std > 0 ? (value - mean) / std : 0, mean, std };
}

// ── 19. healthCheck ─────────────────────────────────────
export async function healthCheck(_params: QueryParams) {
  const tid = _params._tenant_id;

  // All aggregation done in SQL: monthly data + marketplace×month data
  const [monthlyRows, mktMonthlyRows, dailyRows] = await Promise.all([
    runSQL<{ month: string; cnt: number; total: number; paid: number; cancelled: number; cancelled_amount: number }>(`
      SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(total_amount), 0)::float AS total,
             COUNT(*) FILTER (WHERE LOWER(status) = 'paid')::int AS paid,
             COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::int AS cancelled,
             COALESCE(SUM(total_amount) FILTER (WHERE LOWER(status) = 'cancelled'), 0)::float AS cancelled_amount
      FROM orders
      GROUP BY month ORDER BY month
    `, tid),
    runSQL<{ marketplace: string; month: string; cnt: number; total: number; cancelled: number }>(`
      SELECT marketplace,
             TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(total_amount), 0)::float AS total,
             COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::int AS cancelled
      FROM orders
      GROUP BY marketplace, month ORDER BY marketplace, month
    `, tid),
    runSQL<{ date: string; total: number; cnt: number; cancelled: number }>(`
      SELECT TO_CHAR(order_date AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
             COALESCE(SUM(total_amount), 0)::float AS total,
             COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::int AS cancelled
      FROM orders 
      WHERE order_date >= NOW() - INTERVAL '30 days'
      GROUP BY date ORDER BY date
    `, tid),
  ]);

  // Weekly summary via separate query
  const weekRows = await runSQL<{ cnt: number; total: number }>(`
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount), 0)::float AS total
    FROM orders WHERE order_date >= NOW() - INTERVAL '7 days'
  `, tid);

  const alerts: Array<{ type: "danger" | "warning" | "success" | "info"; message: string; metric?: string; data_support?: any }> = [];

  // ALERT 0: Statistical Anomalies (Z-score)
  if (dailyRows.length >= 7) {
    const lastDay = dailyRows[dailyRows.length - 1];
    const history = dailyRows.slice(0, -1);

    // 1. Revenue Anomaly
    const rev = calcZScore(lastDay.total, history.map(h => h.total));
    if (Math.abs(rev.z) > 1.5) {
      alerts.push({
        type: rev.z > 2.5 ? "success" : rev.z < -2.5 ? "danger" : "warning",
        metric: "revenue_anomaly",
        message: rev.z > 0
          ? `Vendas em alta! R$ ${Math.round(lastDay.total).toLocaleString("pt-BR")} hoje — desvio positivo de ${rev.z.toFixed(1)}σ.`
          : `Vendas abaixo do padrão: R$ ${Math.round(lastDay.total).toLocaleString("pt-BR")} hoje (esperado ~R$ ${Math.round(rev.mean)}).`,
        data_support: { z_score: rnd(rev.z), actual: rnd(lastDay.total), expected: rnd(rev.mean) }
      });
    }

    // 2. Average Ticket Anomaly
    const avgTicketDist = history.filter(h => h.cnt > 0).map(h => h.total / h.cnt);
    const lastAvgTicket = lastDay.cnt > 0 ? lastDay.total / lastDay.cnt : 0;
    if (lastAvgTicket > 0 && avgTicketDist.length >= 5) {
      const atk = calcZScore(lastAvgTicket, avgTicketDist);
      if (Math.abs(atk.z) > 2.0) {
        alerts.push({
          type: atk.z > 0 ? "success" : "warning",
          metric: "ticket_anomaly",
          message: atk.z > 0
            ? `Ticket médio disparou: R$ ${Math.round(lastAvgTicket)} hoje (${atk.z.toFixed(1)}σ acima da média).`
            : `Ticket médio caiu: R$ ${Math.round(lastAvgTicket)} hoje (esperado R$ ${Math.round(atk.mean)}).`,
          data_support: { z_score: rnd(atk.z), actual: rnd(lastAvgTicket), expected: rnd(atk.mean) }
        });
      }
    }

    // 3. Cancellation Rate Anomaly
    const cancelRateDist = history.filter(h => h.cnt > 0).map(h => (h.cancelled / h.cnt) * 100);
    const lastCancelRate = lastDay.cnt > 0 ? (lastDay.cancelled / lastDay.cnt) * 100 : 0;
    if (lastDay.cnt > 10 && cancelRateDist.length >= 5) {
      const cr = calcZScore(lastCancelRate, cancelRateDist);
      if (cr.z > 2.0) {
        alerts.push({
          type: "danger",
          metric: "cancellation_anomaly",
          message: `Alerta de cancelamento! Taxa de ${lastCancelRate.toFixed(1)}% hoje — pico anômalo (${cr.z.toFixed(1)}σ).`,
          data_support: { z_score: rnd(cr.z), actual: rnd(lastCancelRate, 1), avg_rate: rnd(cr.mean, 1) }
        });
      }
    }
  }

  if (monthlyRows.length < 2) {
    return { alerts: [{ type: "info" as const, message: "Dados insuficientes para análise (menos de 2 meses)" }], summary: null };
  }

  // Build monthly map
  const monthly: Record<string, typeof monthlyRows[0]> = {};
  monthlyRows.forEach(r => { monthly[r.month] = r; });

  // Build marketplace monthly map
  const mktMonthly: Record<string, Record<string, { cnt: number; total: number; cancelled: number }>> = {};
  mktMonthlyRows.forEach(r => {
    if (!mktMonthly[r.marketplace]) mktMonthly[r.marketplace] = {};
    mktMonthly[r.marketplace][r.month] = { cnt: r.cnt, total: r.total, cancelled: r.cancelled };
  });

  const sortedMonths = monthlyRows.map(r => r.month);
  const now = new Date();
  // Adjust to BRT
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const currentMonthKey = `${brtNow.getUTCFullYear()}-${String(brtNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = brtNow.getUTCDate();
  const daysInCurrentMonth = new Date(brtNow.getUTCFullYear(), brtNow.getUTCMonth() + 1, 0).getDate();

  const currentMonth = monthly[currentMonthKey];
  const prevMonthKey = sortedMonths.filter(m => m < currentMonthKey).pop();

  // Average of complete months
  const completeMonths = sortedMonths.filter(m => m < currentMonthKey);
  const avgRevenue = completeMonths.length > 0
    ? completeMonths.reduce((s, m) => s + monthly[m].total, 0) / completeMonths.length : 0;
  const avgOrders = completeMonths.length > 0
    ? completeMonths.reduce((s, m) => s + monthly[m].cnt, 0) / completeMonths.length : 0;

  // ALERT 1: Revenue projection vs average
  if (currentMonth && dayOfMonth >= 5) {
    const projected = (currentMonth.total / dayOfMonth) * daysInCurrentMonth;
    const pct = avgRevenue > 0 ? ((projected - avgRevenue) / avgRevenue) * 100 : 0;
    if (pct < -30) {
      alerts.push({
        type: "danger", metric: "revenue_projection",
        message: `Faturamento projetado em R$ ${Math.round(projected).toLocaleString("pt-BR")} — ${Math.abs(Math.round(pct))}% ABAIXO da média (R$ ${Math.round(avgRevenue).toLocaleString("pt-BR")}). Faltam ${daysInCurrentMonth - dayOfMonth} dias.`
      });
    } else if (pct < -10) {
      alerts.push({
        type: "warning", metric: "revenue_projection",
        message: `Faturamento projetado ${Math.abs(Math.round(pct))}% abaixo da média. Atual: R$ ${Math.round(currentMonth.total).toLocaleString("pt-BR")} em ${dayOfMonth} dias.`
      });
    } else if (pct > 20) {
      alerts.push({
        type: "success", metric: "revenue_projection",
        message: `Mês em alta! Projeção de R$ ${Math.round(projected).toLocaleString("pt-BR")} — ${Math.round(pct)}% acima da média.`
      });
    }
  }

  // ALERT 2: YoY
  const lastYearKey = sortedMonths.find(m => {
    const [y, mo] = m.split("-");
    return mo === currentMonthKey.split("-")[1] && parseInt(y) < parseInt(currentMonthKey.split("-")[0]);
  });
  if (lastYearKey && currentMonth && dayOfMonth >= 5) {
    const ly = monthly[lastYearKey];
    const projected = (currentMonth.total / dayOfMonth) * daysInCurrentMonth;
    const yoy = ly.total > 0 ? ((projected - ly.total) / ly.total) * 100 : 0;
    if (Math.abs(yoy) > 15) {
      alerts.push({
        type: yoy < 0 ? "warning" : "success", metric: "yoy",
        message: `vs ${lastYearKey}: ${yoy > 0 ? "+" : ""}${Math.round(yoy)}% em faturamento (era R$ ${Math.round(ly.total).toLocaleString("pt-BR")}).`
      });
    }
  }

  // ALERT 3: Cancellation rate
  if (currentMonth && currentMonth.cnt > 20) {
    const rate = (currentMonth.cancelled / currentMonth.cnt) * 100;
    const avgRate = completeMonths.length > 0
      ? completeMonths.reduce((s, m) => s + (monthly[m].cnt > 0 ? (monthly[m].cancelled / monthly[m].cnt) * 100 : 0), 0) / completeMonths.length : 0;
    if (rate > avgRate + 5) {
      alerts.push({
        type: "danger", metric: "cancellation",
        message: `Taxa de cancelamento em ${rate.toFixed(1)}% — acima da média de ${avgRate.toFixed(1)}%. Perda: R$ ${Math.round(currentMonth.cancelled_amount).toLocaleString("pt-BR")}.`
      });
    } else if (rate < avgRate - 3) {
      alerts.push({
        type: "success", metric: "cancellation",
        message: `Cancelamentos em ${rate.toFixed(1)}% — melhor que a média de ${avgRate.toFixed(1)}%.`
      });
    }
  }

  // ALERT 4: Marketplace cancellation spike
  const mktNames: Record<string, string> = { bagy: "Bagy", ml: "Mercado Livre", shopee: "Shopee", shein: "Shein", "physical store": "Loja Física" };
  for (const [mkt, mktData] of Object.entries(mktMonthly)) {
    const cur = mktData[currentMonthKey];
    const prev = prevMonthKey ? mktData[prevMonthKey] : null;
    if (cur && prev && cur.cnt > 10 && prev.cnt > 10) {
      const curRate = (cur.cancelled / cur.cnt) * 100;
      const prevRate = (prev.cancelled / prev.cnt) * 100;
      if (curRate > prevRate + 8) {
        alerts.push({
          type: "warning", metric: "mkt_cancellation",
          message: `Cancelamentos no ${mktNames[mkt] || mkt} subiram de ${prevRate.toFixed(1)}% para ${curRate.toFixed(1)}% este mês.`
        });
      }
    }
  }

  // ALERT 5: Avg ticket trend
  const last3 = completeMonths.slice(-3);
  if (last3.length === 3) {
    const tk = last3.map(m => monthly[m].cnt > 0 ? monthly[m].total / monthly[m].cnt : 0);
    if (tk[0] > tk[1] && tk[1] > tk[2]) {
      alerts.push({
        type: "warning", metric: "avg_ticket",
        message: `Ticket médio em queda há 3 meses: R$ ${Math.round(tk[0])} → R$ ${Math.round(tk[1])} → R$ ${Math.round(tk[2])}.`
      });
    } else if (tk[0] < tk[1] && tk[1] < tk[2]) {
      alerts.push({
        type: "success", metric: "avg_ticket",
        message: `Ticket médio crescendo há 3 meses: R$ ${Math.round(tk[0])} → R$ ${Math.round(tk[1])} → R$ ${Math.round(tk[2])}.`
      });
    }
  }

  // ALERT 6: Weekly performance
  const week = weekRows[0] || { cnt: 0, total: 0 };
  const avgWeekly = avgRevenue / 4.33;
  if (week.total > avgWeekly * 1.3 && week.cnt > 20) {
    alerts.push({
      type: "success", metric: "weekly",
      message: `Ótima semana! R$ ${Math.round(week.total).toLocaleString("pt-BR")} nos últimos 7 dias (${week.cnt} pedidos) — ${Math.round(((week.total / avgWeekly) - 1) * 100)}% acima da média semanal.`
    });
  }

  if (alerts.length === 0) {
    alerts.push({ type: "info", message: "Tudo normal — sem alertas ou anomalias detectadas." });
  }

  return {
    alerts,
    summary: {
      current_month: currentMonthKey,
      days_passed: dayOfMonth,
      days_remaining: daysInCurrentMonth - dayOfMonth,
      revenue_so_far: currentMonth ? rnd(currentMonth.total) : 0,
      orders_so_far: currentMonth ? currentMonth.cnt : 0,
      avg_monthly_revenue: rnd(avgRevenue),
      avg_monthly_orders: Math.round(avgOrders),
    },
  };
}

/**
 * 20. getRFMAnalysis — Behavioral Segmentation (cached 1h)
 * Calculates Recency, Frequency, and Monetary value per customer.
 */
async function getRFMAnalysis(params: QueryParams): Promise<unknown> {
  const tenantId = params._tenant_id;
  const cacheKey = `patterns:${tenantId}:rfm`;

  return withCache(cacheKey, async () => {
    const where = buildWhere(params, { includeStatus: false });
    const sql = `
      WITH recent_orders AS (
        SELECT o.id, o.tenant_id, o.total_amount, o.order_date, o.external_order_id, o.marketplace
        FROM public.orders o
        WHERE ${where} AND o.status = 'paid' AND o.tenant_id = '${tenantId}'::uuid
      ),
      customer_orders AS (
        SELECT 
          o.id as order_id,
          o.tenant_id,
          o.total_amount,
          o.order_date,
          COALESCE(
            ml.raw_json->'buyer'->>'id',
            sh.raw_json->>'buyer_username',
            bg.raw_json->>'nome',
            sn.raw_json->>'orderNo'
          ) as customer_id,
          COALESCE(
            ml.raw_json->'buyer'->>'nickname',
            sh.raw_json->>'buyer_username',
            bg.raw_json->>'nome',
            'Cliente Shein'
          ) as customer_name
        FROM recent_orders o
        LEFT JOIN public.ml_raw_orders ml ON o.external_order_id = ml.id AND o.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        LEFT JOIN public.bagy_raw_orders bg ON o.external_order_id = bg.id AND o.marketplace = 'bagy' AND bg.tenant_id = '${tenantId}'::uuid
        LEFT JOIN public.shopee_raw_orders sh ON o.external_order_id = sh.id AND o.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
        LEFT JOIN public.shein_raw_orders sn ON o.external_order_id = sn.id AND o.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
      ),
      rfm_metrics AS (
        SELECT 
          customer_id,
          MAX(customer_name) as customer_name,
          EXTRACT(DAY FROM (NOW() - MAX(order_date))) as recency,
          COUNT(order_id) as frequency,
          SUM(total_amount) as monetary
        FROM customer_orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ),
      rfm_scores AS (
        SELECT 
          *,
          NTILE(4) OVER (ORDER BY recency DESC) as r_score,
          NTILE(4) OVER (ORDER BY frequency ASC) as f_score,
          NTILE(4) OVER (ORDER BY monetary ASC) as m_score
        FROM rfm_metrics
      )
      SELECT 
        customer_id,
        customer_name,
        recency,
        frequency,
        monetary,
        (r_score + f_score + m_score) as total_score,
        CASE 
          WHEN (r_score + f_score + m_score) >= 10 THEN 'VIP / Campeão'
          WHEN (r_score + f_score + m_score) >= 7 THEN 'Fiel'
          WHEN (r_score + f_score) >= 6 THEN 'Promissor'
          WHEN r_score <= 2 THEN 'Em Risco / Hibernando'
          ELSE 'Regular'
        END as segment
      FROM rfm_scores
      ORDER BY monetary DESC
      LIMIT 100
    `;
    const data = await runSQL(sql, null);
    return { data };
  });
}

/**
 * 21. marketBasketLite — Product Correlation (cached 1h)
 * Identifies products that are frequently bought together.
 */
async function marketBasketLite(params: QueryParams): Promise<unknown> {
  const tenantId = params._tenant_id;
  if (!tenantId) return { data: [] };
  const cacheKey = `patterns:${tenantId}:basket`;

  return withCache(cacheKey, async () => {
    const where = buildWhere(params);
    const sql = `
      WITH recent_orders AS (
        SELECT external_order_id, marketplace, tenant_id 
        FROM public.orders 
        WHERE ${where} AND tenant_id = '${tenantId}'::uuid
      ),
      order_items AS (
        SELECT r.external_order_id as order_id, r.tenant_id, jsonb_array_elements(ml.raw_json->'order_items')->'item'->>'title' as product_name 
        FROM recent_orders r JOIN public.ml_raw_orders ml ON r.external_order_id = ml.id WHERE r.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        UNION ALL
        SELECT r.external_order_id as order_id, r.tenant_id, jsonb_array_elements(sh.raw_json->'item_list')->>'item_name' as product_name 
        FROM recent_orders r JOIN public.shopee_raw_orders sh ON r.external_order_id = sh.id WHERE r.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
        UNION ALL
        SELECT r.external_order_id as order_id, r.tenant_id, jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'goodsTitle' as product_name 
        FROM recent_orders r JOIN public.shein_raw_orders sn ON r.external_order_id = sn.id WHERE r.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
      ),
      product_pairs AS (
        SELECT a.product_name as product_a, b.product_name as product_b, COUNT(*) as frequency
        FROM order_items a
        JOIN order_items b ON a.order_id = b.order_id AND a.product_name < b.product_name
        GROUP BY 1, 2
      )
      SELECT product_a, product_b, frequency
      FROM product_pairs
      WHERE frequency > 1
      ORDER BY frequency DESC
      LIMIT 20
    `;
    const data = await runSQL(sql, null);
    return { data };
  });
}

/**
 * 22. topProducts — Top Products by Sales Volume & Revenue (cached 1h)
 * Extracts individual product ranking from ML, Shopee, and Shein raw JSONs.
 */
async function topProducts(params: QueryParams): Promise<unknown> {
  const tenantId = params._tenant_id;
  if (!tenantId) return { data: [] };
  const cacheKey = `patterns:${tenantId}:topProducts`;

  return withCache(cacheKey, async () => {
    const where = buildWhere(params);
    const sql = `
      WITH recent_orders AS (
        SELECT external_order_id, marketplace
        FROM public.orders
        WHERE ${where} AND tenant_id = '${tenantId}'::uuid
      ),
      all_items AS (
        SELECT
          jsonb_array_elements(ml.raw_json->'order_items')->'item'->>'title' as product_name,
          jsonb_array_elements(ml.raw_json->'order_items')->'item'->>'seller_sku' as sku,
          (jsonb_array_elements(ml.raw_json->'order_items')->>'unit_price')::float as unit_price,
          (jsonb_array_elements(ml.raw_json->'order_items')->>'quantity')::int as qty,
          'ml' as source
        FROM recent_orders r
        JOIN public.ml_raw_orders ml ON r.external_order_id = ml.id AND r.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        UNION ALL
        SELECT
          jsonb_array_elements(sh.raw_json->'item_list')->>'item_name' as product_name,
          jsonb_array_elements(sh.raw_json->'item_list')->>'item_sku' as sku,
          (jsonb_array_elements(sh.raw_json->'item_list')->>'model_discounted_price')::float as unit_price,
          (jsonb_array_elements(sh.raw_json->'item_list')->>'model_quantity_purchased')::int as qty,
          'shopee' as source
        FROM recent_orders r
        JOIN public.shopee_raw_orders sh ON r.external_order_id = sh.id AND r.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
        UNION ALL
        SELECT
          jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'goodsTitle' as product_name,
          jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'sellerSku' as sku,
          (jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'sellerCurrencyPrice')::float as unit_price,
          1 as qty,
          'shein' as source
        FROM recent_orders r
        JOIN public.shein_raw_orders sn ON r.external_order_id = sn.id AND r.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
      )
      SELECT
        product_name,
        MAX(sku) as sku,
        SUM(qty)::int as total_sold,
        ROUND(SUM(unit_price * qty)::numeric, 2)::float as total_revenue,
        ROUND(AVG(unit_price)::numeric, 2)::float as avg_price,
        COUNT(*)::int as order_count
      FROM all_items
      WHERE product_name IS NOT NULL
      GROUP BY product_name
      ORDER BY total_sold DESC
      LIMIT 20
    `;
    const data = await runSQL(sql, null);
    return { data };
  });
}

// ── Advanced Analytics: Patterns & Segments ────────────────────────

/**
 * Calculates Pearson correlation between revenue and other metrics.
 * Uses PostgreSQL's native corr(y, x) function.
 */
export async function getMetricCorrelation(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:getMetricCorrelation:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const tenantId = params._tenant_id;
      const where = buildWhere(params);

      const sql = `
            WITH daily_metrics AS (
                SELECT 
                    DATE(order_date) as day,
                    SUM(total_amount) as revenue,
                    COUNT(id) as order_count,
                    AVG(total_amount) as avg_ticket
                FROM public.orders
                WHERE ${where} AND tenant_id = '${tenantId}'::uuid
                GROUP BY 1
            )
            SELECT 
                corr(revenue, order_count) as revenue_vs_count,
                corr(revenue, avg_ticket) as revenue_vs_ticket,
                corr(order_count, avg_ticket) as count_vs_ticket
            FROM daily_metrics
        `;

      const rows = await runSQL<any>(sql, null);
      const result = rows[0] || {};

      return {
        revenue_v_orders: rnd(result.revenue_vs_count || 0),
        revenue_v_ticket: rnd(result.revenue_vs_ticket || 0),
        orders_v_ticket: rnd(result.count_vs_ticket || 0),
        period: fmtPeriod(params)
      };
  });
}

/**
 * Identifies specific smart segments (Churn Warning, Upsell Candidates).
 * Based on RFM logic but returns specific customer lists.
 */
export async function getSmartSegments(params: QueryParams) {
  const _tid = params._tenant_id || 'system';
  const paramStr = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramStr.length; i++) hash = Math.imul(31, hash) + paramStr.charCodeAt(i) | 0;
  const cacheKey = `optimus:${_tid}:getSmartSegments:${Math.abs(hash)}`;

  return withCache(cacheKey, async () => {
    const tenantId = params._tenant_id;
      const where = buildWhere(params);
      const limit = params.limit || 5;

      const churnSql = `
            WITH recent_orders AS (
                SELECT o.id, o.total_amount, o.order_date, o.external_order_id, o.marketplace
                FROM public.orders o
                WHERE ${where} AND o.tenant_id = '${tenantId}'::uuid
            ),
            customer_orders AS (
                SELECT 
                    o.id,
                    o.total_amount,
                    o.order_date,
                    COALESCE(
                      ml.raw_json->'buyer'->>'nickname',
                      sh.raw_json->>'buyer_username',
                      bg.raw_json->>'nome',
                      'Cliente Oculto'
                    ) as customer_name,
                    COALESCE(
                      ml.raw_json->'buyer'->>'email',
                      sh.raw_json->>'buyer_username',
                      bg.raw_json->>'email'
                    ) as customer_email
                FROM recent_orders o
                LEFT JOIN public.ml_raw_orders ml ON o.external_order_id = ml.id AND o.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.bagy_raw_orders bg ON o.external_order_id = bg.id AND o.marketplace = 'bagy' AND bg.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.shopee_raw_orders sh ON o.external_order_id = sh.id AND o.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.shein_raw_orders sn ON o.external_order_id = sn.id AND o.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
            ),
            customer_stats AS (
                SELECT 
                    customer_name as name,
                    customer_email as email,
                    MAX(order_date) as last_order,
                    COUNT(id) as total_orders,
                    SUM(total_amount) as total_spent
                FROM customer_orders
                GROUP BY 1, 2
                HAVING COUNT(id) > 2
            )
            SELECT * FROM customer_stats
            WHERE last_order < NOW() - INTERVAL '45 days'
            ORDER BY total_spent DESC
            LIMIT ${limit}
        `;

      const upsellSql = `
            WITH recent_orders AS (
                SELECT o.id, o.total_amount, o.order_date, o.external_order_id, o.marketplace
                FROM public.orders o
                WHERE ${where} AND o.tenant_id = '${tenantId}'::uuid
            ),
            customer_orders AS (
                SELECT 
                    o.id,
                    o.total_amount,
                    o.order_date,
                    COALESCE(
                      ml.raw_json->'buyer'->>'nickname',
                      sh.raw_json->>'buyer_username',
                      bg.raw_json->>'nome',
                      'Cliente Oculto'
                    ) as customer_name,
                    COALESCE(
                      ml.raw_json->'buyer'->>'email',
                      sh.raw_json->>'buyer_username',
                      bg.raw_json->>'email'
                    ) as customer_email
                FROM recent_orders o
                LEFT JOIN public.ml_raw_orders ml ON o.external_order_id = ml.id AND o.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.bagy_raw_orders bg ON o.external_order_id = bg.id AND o.marketplace = 'bagy' AND bg.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.shopee_raw_orders sh ON o.external_order_id = sh.id AND o.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
                LEFT JOIN public.shein_raw_orders sn ON o.external_order_id = sn.id AND o.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
            ),
            customer_stats AS (
                SELECT 
                    customer_name as name,
                    customer_email as email,
                    COUNT(id) as total_orders,
                    AVG(total_amount) as avg_ticket,
                    SUM(total_amount) as total_spent
                FROM customer_orders
                GROUP BY 1, 2
                HAVING COUNT(id) > 5
            )
            SELECT * FROM customer_stats
            WHERE avg_ticket < (SELECT AVG(total_amount) FROM public.orders WHERE ${where} AND tenant_id = '${tenantId}'::uuid) * 1.2
            ORDER BY total_orders DESC
            LIMIT ${limit}
        `;

      const [churners, upsellers] = await Promise.all([
        runSQL<any>(churnSql, null),
        runSQL<any>(upsellSql, null)
      ]);

      return {
        churn_risk: (churners || []).map(c => ({
          name: c.name,
          email: c.email || 'N/A',
          last_order: c.last_order,
          total_spent: rnd(c.total_spent)
        })),
        upsell_candidates: (upsellers || []).map(u => ({
          name: u.name,
          email: u.email || 'N/A',
          avg_ticket: rnd(u.avg_ticket),
          orders: u.total_orders
        }))
      };
  });
}

/**
 * 23. bcgMatrix — BCG Matrix (Product Portfolio Analysis, cached 1h)
 * Classifies products into Star, Cash Cow, Question Mark, Dog based on
 * YoY revenue growth (Y axis) and relative market share (X axis).
 */
async function bcgMatrix(params: QueryParams): Promise<unknown> {
  const tenantId = params._tenant_id;
  if (!tenantId) return { data: [], quadrants: { stars: 0, cash_cows: 0, question_marks: 0, dogs: 0 } };
  const cacheKey = `patterns:${tenantId}:bcg`;

  return withCache(cacheKey, async () => {
    const sql = `
      WITH all_items AS (
        SELECT
          jsonb_array_elements(ml.raw_json->'order_items')->'item'->>'title' as product_name,
          (jsonb_array_elements(ml.raw_json->'order_items')->>'unit_price')::float *
          (jsonb_array_elements(ml.raw_json->'order_items')->>'quantity')::int as line_total,
          o.order_date
        FROM public.orders o
        JOIN public.ml_raw_orders ml ON o.external_order_id = ml.id AND o.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND o.status = 'paid'
        UNION ALL
        SELECT
          jsonb_array_elements(sh.raw_json->'item_list')->>'item_name' as product_name,
          (jsonb_array_elements(sh.raw_json->'item_list')->>'model_discounted_price')::float *
          (jsonb_array_elements(sh.raw_json->'item_list')->>'model_quantity_purchased')::int as line_total,
          o.order_date
        FROM public.orders o
        JOIN public.shopee_raw_orders sh ON o.external_order_id = sh.id AND o.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND o.status = 'paid'
        UNION ALL
        SELECT
          jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'goodsTitle' as product_name,
          (jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'sellerCurrencyPrice')::float as line_total,
          o.order_date
        FROM public.orders o
        JOIN public.shein_raw_orders sn ON o.external_order_id = sn.id AND o.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND o.status = 'paid'
      ),
      period_sales AS (
        SELECT
          product_name,
          SUM(CASE WHEN order_date >= NOW() - INTERVAL '6 months' THEN line_total ELSE 0 END) as recent_revenue,
          SUM(CASE WHEN order_date >= NOW() - INTERVAL '12 months' AND order_date < NOW() - INTERVAL '6 months' THEN line_total ELSE 0 END) as previous_revenue,
          SUM(line_total) as total_revenue
        FROM all_items
        WHERE product_name IS NOT NULL
          AND order_date >= NOW() - INTERVAL '12 months'
        GROUP BY product_name
        HAVING SUM(line_total) > 0
      ),
      grand_total AS (
        SELECT SUM(total_revenue) as overall FROM period_sales
      )
      SELECT
        p.product_name,
        ROUND(p.recent_revenue::numeric, 2)::float as recent_revenue,
        ROUND(p.previous_revenue::numeric, 2)::float as previous_revenue,
        ROUND(p.total_revenue::numeric, 2)::float as total_revenue,
        CASE WHEN g.overall > 0 THEN ROUND((p.total_revenue / g.overall * 100)::numeric, 2)::float ELSE 0 END as market_share,
        CASE WHEN p.previous_revenue > 0 THEN ROUND(((p.recent_revenue - p.previous_revenue) / p.previous_revenue * 100)::numeric, 1)::float ELSE
          CASE WHEN p.recent_revenue > 0 THEN 100.0 ELSE 0.0 END
        END as growth_pct
      FROM period_sales p, grand_total g
      ORDER BY p.total_revenue DESC
      LIMIT 30
    `;
    const rows = await runSQL<{
      product_name: string;
      recent_revenue: number;
      previous_revenue: number;
      total_revenue: number;
      market_share: number;
      growth_pct: number;
    }>(sql, null);

    // Median growth and share to define quadrant thresholds
    const growths = rows.map(r => r.growth_pct).sort((a, b) => a - b);
    const shares = rows.map(r => r.market_share).sort((a, b) => a - b);
    const medianGrowth = growths.length > 0 ? growths[Math.floor(growths.length / 2)] : 0;
    const medianShare = shares.length > 0 ? shares[Math.floor(shares.length / 2)] : 0;

    const classified = rows.map(r => {
      const highGrowth = r.growth_pct >= medianGrowth;
      const highShare = r.market_share >= medianShare;
      let quadrant: 'star' | 'cash_cow' | 'question_mark' | 'dog';
      if (highGrowth && highShare) quadrant = 'star';
      else if (!highGrowth && highShare) quadrant = 'cash_cow';
      else if (highGrowth && !highShare) quadrant = 'question_mark';
      else quadrant = 'dog';
      return { ...r, quadrant };
    });

    const quadrants = {
      stars: classified.filter(p => p.quadrant === 'star').length,
      cash_cows: classified.filter(p => p.quadrant === 'cash_cow').length,
      question_marks: classified.filter(p => p.quadrant === 'question_mark').length,
      dogs: classified.filter(p => p.quadrant === 'dog').length,
    };

    return { data: classified, quadrants, thresholds: { medianGrowth: rnd(medianGrowth), medianShare: rnd(medianShare) } };
  });
}

// ── Function Registry ───────────────────────────────────
export const queryFunctions: Record<string, (params: QueryParams) => Promise<unknown>> = {
  countOrders,
  totalSales,
  avgTicket,
  ordersByStatus,
  ordersByMarketplace,
  salesByMonth,
  salesByDayOfWeek,
  topDays,
  cancellationRate,
  compareMarketplaces,
  comparePeriods,
  salesByHour,
  salesForecast,
  executiveSummary,
  marketplaceGrowth,
  cancellationByMonth,
  yearOverYear,
  seasonalityAnalysis,
  healthCheck,
  getRFMAnalysis,
  marketBasketLite,
  topProducts,
  getMetricCorrelation,
  getSmartSegments,
  bcgMatrix,
};
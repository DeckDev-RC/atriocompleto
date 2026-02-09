import { supabase } from "../config/supabase";

/**
 * Query Functions — Suíte completa de analytics para e-commerce
 *
 * Funções pré-definidas chamadas pelo Gemini via Function Calling.
 * Todas usam .ilike() para case-insensitive e fetchAllRows para paginação.
 *
 * FUNÇÕES DISPONÍVEIS:
 *  1. countOrders       — Conta pedidos
 *  2. totalSales        — Faturamento total
 *  3. avgTicket         — Ticket médio
 *  4. ordersByStatus    — Distribuição por status
 *  5. ordersByMarketplace — Vendas por marketplace
 *  6. salesByMonth      — Evolução mensal
 *  7. salesByDayOfWeek  — Performance por dia da semana
 *  8. topDays           — Melhores/piores dias de venda
 *  9. cancellationRate  — Taxa de cancelamento
 * 10. compareMarketplaces — Comparação detalhada entre marketplaces
 * 11. comparePeriods    — Comparação entre dois períodos
 * 12. salesByHour       — Distribuição por hora do dia
 */

// ── Types ───────────────────────────────────────────────
export interface QueryParams {
  status?: string;
  marketplace?: string;
  start_date?: string;
  end_date?: string;
  period_days?: number;
  all_time?: boolean;
  // Parâmetros específicos
  limit?: number;
  order?: "best" | "worst";
  compare_start_date?: string;
  compare_end_date?: string;
  group_by?: string;
}

// ── Helpers ─────────────────────────────────────────────
const BRT_OFFSET = -3; // GMT-3 Brasília

/**
 * Converte um timestamp (string ISO ou Date) para data/hora em BRT.
 * Retorna um Date ajustado para GMT-3.
 */
function toBRT(dateStr: string): Date {
  const d = new Date(dateStr);
  // Ajusta para BRT: adiciona o offset de -3h
  return new Date(d.getTime() + BRT_OFFSET * 60 * 60 * 1000);
}

/**
 * Extrai YYYY-MM em BRT de um timestamp.
 * Ex: "2025-01-31T23:30:00Z" (UTC) → "2025-02-01" em BRT → retorna "2025-02"
 * Sem isso, esse pedido seria agrupado em janeiro ao invés de fevereiro.
 */
function toMonthBRT(dateStr: string): string {
  const d = toBRT(dateStr);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Extrai YYYY-MM-DD em BRT de um timestamp.
 */
function toDayBRT(dateStr: string): string {
  const d = toBRT(dateStr);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Extrai dia da semana (0=Dom, 6=Sáb) em BRT.
 */
function getDayOfWeekBRT(dateStr: string): number {
  return toBRT(dateStr).getUTCDay();
}

/**
 * Extrai hora do dia (0-23) em BRT.
 */
function getHourBRT(dateStr: string): number {
  return toBRT(dateStr).getUTCHours();
}

/**
 * Extrai mês do ano (1-12) em BRT.
 */
function getMonthNumBRT(dateStr: string): number {
  return toBRT(dateStr).getUTCMonth() + 1;
}

function buildDateRange(params: QueryParams): { start: string; end: string } | null {
  if (params.all_time) return null;
  if (params.start_date && params.end_date) {
    // Quando o Gemini manda datas como "2025-01-01", interpretar como início do dia em BRT
    // "2025-01-01" em BRT = "2025-01-01T03:00:00Z" em UTC
    const startStr = params.start_date.includes("T")
      ? params.start_date
      : params.start_date + "T00:00:00-03:00";
    const endStr = params.end_date.includes("T")
      ? params.end_date
      : params.end_date + "T23:59:59-03:00";
    return { start: startStr, end: endStr };
  }
  if (params.period_days) {
    // "Últimos N dias" baseado no horário BRT
    const now = new Date();
    const nowBRT = new Date(now.getTime() + BRT_OFFSET * 60 * 60 * 1000);
    const endStr = nowBRT.toISOString().substring(0, 10) + "T23:59:59-03:00";
    const start = new Date(nowBRT);
    start.setDate(start.getDate() - params.period_days);
    const startStr = start.toISOString().substring(0, 10) + "T00:00:00-03:00";
    return { start: startStr, end: endStr };
  }
  return null; // Sem filtro = tudo
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(
  query: any,
  params: QueryParams,
  opts: { includeStatus?: boolean; includeMarketplace?: boolean } = {}
): any {
  const { includeStatus = true, includeMarketplace = true } = opts;
  let q = query;
  if (includeStatus && params.status) q = q.ilike("status", params.status);
  if (includeMarketplace && params.marketplace) q = q.ilike("marketplace", `%${params.marketplace}%`);
  return q;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDateFilter(
  query: any,
  dateRange: { start: string; end: string } | null
): any {
  if (!dateRange) return query;
  return query.gte("order_date", dateRange.start).lte("order_date", dateRange.end);
}

async function fetchAllRows<T extends Record<string, unknown>>(
  tableName: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (query: any) => any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allData: T[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(tableName).select(columns).range(from, to);
    query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`Erro na consulta: ${error.message}`);
    if (!data || data.length === 0) break;
    allData.push(...(data as unknown as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return allData;
}

const fmtPeriod = (dr: { start: string; end: string } | null) =>
  dr ? { start: dr.start, end: dr.end } : "todos os periodos";

// ── Metadata ────────────────────────────────────────────
export async function getDistinctValues() {
  let statuses: string[] = [];
  let marketplaces: string[] = [];

  try {
    const { data, error } = await supabase.rpc("get_orders_metadata");
    if (!error && data) {
      const meta = typeof data === "string" ? JSON.parse(data) : data;
      if (Array.isArray(meta.statuses)) statuses = meta.statuses.filter(Boolean);
      if (Array.isArray(meta.marketplaces)) marketplaces = meta.marketplaces.filter(Boolean);
      if (statuses.length > 0 && marketplaces.length > 0) {
        return { statuses: statuses.sort(), marketplaces: marketplaces.sort() };
      }
    }
  } catch (err) {
    console.warn("[getDistinctValues] RPC fallback:", err);
  }

  // Fallback: paginação
  const allStatuses = new Set<string>();
  const allMarketplaces = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const from = page * 1000;
    const { data, error } = await supabase.from("orders").select("status, marketplace").range(from, from + 999);
    if (error || !data || data.length === 0) break;
    data.forEach((row) => {
      if (row.status) allStatuses.add(row.status);
      if (row.marketplace) allMarketplaces.add(row.marketplace);
    });
    if (data.length < 1000) break;
  }
  return { statuses: [...allStatuses].sort(), marketplaces: [...allMarketplaces].sort() };
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE QUERY
// ═══════════════════════════════════════════════════════════

// ── 1. countOrders ──────────────────────────────────────
export async function countOrders(params: QueryParams) {
  const dateRange = buildDateRange(params);
  let query = supabase.from("orders").select("id", { count: "exact", head: true });
  query = applyDateFilter(query, dateRange);
  query = applyFilters(query, params);
  const { count, error } = await query;
  if (error) throw new Error(`Erro: ${error.message}`);

  // Se não tem filtro de status, retornar breakdown por status para dados qualificados
  let byStatus: Record<string, number> | undefined;
  if (!params.status) {
    const data = await fetchAllRows<{ status: string }>("orders", "status", (q) => {
      let qr = applyDateFilter(q, dateRange);
      qr = applyFilters(qr, params, { includeStatus: false });
      return qr;
    });
    byStatus = {};
    data.forEach((row) => {
      const s = row.status || "unknown";
      byStatus![s] = (byStatus![s] || 0) + 1;
    });
  }

  return {
    total: count || 0,
    by_status: byStatus,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 2. totalSales ───────────────────────────────────────
export async function totalSales(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ total_amount: number; status: string }>("orders", "total_amount, status", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params);
    return query;
  });
  const total = data.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);

  // Breakdown por status quando sem filtro
  let byStatus: Record<string, { count: number; total: number }> | undefined;
  if (!params.status) {
    byStatus = {};
    data.forEach((row) => {
      const s = row.status || "unknown";
      if (!byStatus![s]) byStatus![s] = { count: 0, total: 0 };
      byStatus![s].count++;
      byStatus![s].total += Number(row.total_amount) || 0;
    });
    // Arredondar
    Object.values(byStatus).forEach((v) => { v.total = Math.round(v.total * 100) / 100; });
  }

  return {
    total_sales: Math.round(total * 100) / 100,
    order_count: data.length,
    by_status: byStatus,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 3. avgTicket ────────────────────────────────────────
export async function avgTicket(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ total_amount: number }>("orders", "total_amount", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params);
    return query;
  });
  const amounts = data.map((r) => Number(r.total_amount) || 0);
  const total = amounts.reduce((sum, v) => sum + v, 0);
  const avg = amounts.length > 0 ? total / amounts.length : 0;

  // Calcular mediana e desvio padrão para insights
  const sorted = [...amounts].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const variance = amounts.length > 0 ? amounts.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / amounts.length : 0;
  const stddev = Math.sqrt(variance);

  return {
    avg_ticket: Math.round(avg * 100) / 100,
    median_ticket: Math.round(median * 100) / 100,
    min_ticket: sorted.length > 0 ? Math.round(sorted[0] * 100) / 100 : 0,
    max_ticket: sorted.length > 0 ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
    std_deviation: Math.round(stddev * 100) / 100,
    total_sales: Math.round(total * 100) / 100,
    order_count: amounts.length,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 4. ordersByStatus ───────────────────────────────────
export async function ordersByStatus(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ status: string }>("orders", "status", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params, { includeStatus: false });
    return query;
  });
  const grouped: Record<string, number> = {};
  data.forEach((row) => { grouped[row.status || "desconhecido"] = (grouped[row.status || "desconhecido"] || 0) + 1; });
  return { distribution: grouped, total: data.length, filters: { marketplace: params.marketplace, period: fmtPeriod(dateRange) } };
}

// ── 5. ordersByMarketplace ──────────────────────────────
export async function ordersByMarketplace(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ marketplace: string; total_amount: number; status: string }>(
    "orders", "marketplace, total_amount, status", (q) => {
      let query = applyDateFilter(q, dateRange);
      query = applyFilters(query, params, { includeMarketplace: false });
      return query;
    }
  );

  const grouped: Record<string, {
    count: number; total: number;
    by_status: Record<string, { count: number; total: number }>;
  }> = {};

  data.forEach((row) => {
    const m = row.marketplace || "desconhecido";
    if (!grouped[m]) grouped[m] = { count: 0, total: 0, by_status: {} };
    const amount = Number(row.total_amount) || 0;
    grouped[m].count++;
    grouped[m].total += amount;

    // Breakdown por status dentro de cada marketplace
    if (!params.status) {
      const s = row.status || "unknown";
      if (!grouped[m].by_status[s]) grouped[m].by_status[s] = { count: 0, total: 0 };
      grouped[m].by_status[s].count++;
      grouped[m].by_status[s].total += amount;
    }
  });

  for (const key of Object.keys(grouped)) {
    grouped[key].total = Math.round(grouped[key].total * 100) / 100;
    for (const s of Object.keys(grouped[key].by_status)) {
      grouped[key].by_status[s].total = Math.round(grouped[key].by_status[s].total * 100) / 100;
    }
  }

  // Breakdown geral por status (quando sem filtro de status)
  let globalByStatus: Record<string, { count: number; total: number }> | undefined;
  if (!params.status) {
    globalByStatus = {};
    data.forEach((row) => {
      const s = row.status || "unknown";
      if (!globalByStatus![s]) globalByStatus![s] = { count: 0, total: 0 };
      globalByStatus![s].count++;
      globalByStatus![s].total += Number(row.total_amount) || 0;
    });
    for (const s of Object.keys(globalByStatus)) {
      globalByStatus[s].total = Math.round(globalByStatus[s].total * 100) / 100;
    }
  }

  return {
    marketplaces: grouped,
    total_orders: data.length,
    by_status: globalByStatus,
    filters: { status: params.status, period: fmtPeriod(dateRange) },
  };
}

// ── 6. salesByMonth ─────────────────────────────────────
export async function salesByMonth(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ order_date: string; total_amount: number; status: string }>(
    "orders", "order_date, total_amount, status", (q) => {
      let query = applyDateFilter(q, dateRange);
      query = applyFilters(query, params);
      return query;
    }
  );

  const grouped: Record<string, {
    count: number; total: number;
    by_status: Record<string, { count: number; total: number }>;
  }> = {};

  data.forEach((row) => {
    if (!row.order_date) return;
    const month = toMonthBRT(row.order_date);
    if (!grouped[month]) grouped[month] = { count: 0, total: 0, by_status: {} };
    const amount = Number(row.total_amount) || 0;
    grouped[month].count++;
    grouped[month].total += amount;

    // Breakdown por status dentro de cada mês (quando sem filtro de status)
    if (!params.status) {
      const s = row.status || "unknown";
      if (!grouped[month].by_status[s]) grouped[month].by_status[s] = { count: 0, total: 0 };
      grouped[month].by_status[s].count++;
      grouped[month].by_status[s].total += amount;
    }
  });

  const months = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      count: d.count,
      total: Math.round(d.total * 100) / 100,
      avg_ticket: d.count > 0 ? Math.round((d.total / d.count) * 100) / 100 : 0,
      by_status: !params.status ? Object.fromEntries(
        Object.entries(d.by_status).map(([s, v]) => [s, { count: v.count, total: Math.round(v.total * 100) / 100 }])
      ) : undefined,
    }));

  // Calcular variação mês a mês
  const monthsWithGrowth = months.map((m, i) => ({
    ...m,
    growth_pct: i > 0 && months[i - 1].total > 0
      ? Math.round(((m.total - months[i - 1].total) / months[i - 1].total) * 10000) / 100
      : null,
  }));

  const grandTotal = months.reduce((sum, m) => sum + m.total, 0);
  const grandCount = months.reduce((sum, m) => sum + m.count, 0);

  // Breakdown geral por status
  let globalByStatus: Record<string, { count: number; total: number }> | undefined;
  if (!params.status) {
    globalByStatus = {};
    data.forEach((row) => {
      const s = row.status || "unknown";
      if (!globalByStatus![s]) globalByStatus![s] = { count: 0, total: 0 };
      globalByStatus![s].count++;
      globalByStatus![s].total += Number(row.total_amount) || 0;
    });
    for (const s of Object.keys(globalByStatus)) {
      globalByStatus[s].total = Math.round(globalByStatus[s].total * 100) / 100;
    }
  }

  return {
    months: monthsWithGrowth,
    grand_total: Math.round(grandTotal * 100) / 100,
    grand_count: grandCount,
    by_status: globalByStatus,
    best_month: months.length > 0 ? months.reduce((best, m) => m.total > best.total ? m : best, months[0]) : null,
    worst_month: months.length > 0 ? months.reduce((worst, m) => m.total < worst.total ? m : worst, months[0]) : null,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 7. salesByDayOfWeek ─────────────────────────────────
export async function salesByDayOfWeek(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ order_date: string; total_amount: number }>("orders", "order_date, total_amount", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params);
    return query;
  });

  const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const grouped: Record<number, { name: string; count: number; total: number }> = {};
  for (let i = 0; i < 7; i++) grouped[i] = { name: dayNames[i], count: 0, total: 0 };

  data.forEach((row) => {
    if (!row.order_date) return;
    const day = getDayOfWeekBRT(row.order_date);
    grouped[day].count++;
    grouped[day].total += Number(row.total_amount) || 0;
  });

  const days = Object.values(grouped).map((d) => ({
    ...d,
    total: Math.round(d.total * 100) / 100,
    avg_ticket: d.count > 0 ? Math.round((d.total / d.count) * 100) / 100 : 0,
  }));

  const bestDay = days.reduce((best, d) => d.total > best.total ? d : best, days[0]);
  const worstDay = days.reduce((worst, d) => d.total < worst.total ? d : worst, days[0]);

  return {
    days,
    best_day: bestDay,
    worst_day: worstDay,
    total_orders: data.length,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 8. topDays ──────────────────────────────────────────
export async function topDays(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ order_date: string; total_amount: number }>("orders", "order_date, total_amount", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params);
    return query;
  });

  const grouped: Record<string, { count: number; total: number }> = {};
  data.forEach((row) => {
    if (!row.order_date) return;
    const day = toDayBRT(row.order_date);
    if (!grouped[day]) grouped[day] = { count: 0, total: 0 };
    grouped[day].count++;
    grouped[day].total += Number(row.total_amount) || 0;
  });

  const limit = params.limit || 10;
  const sortedByRevenue = Object.entries(grouped)
    .map(([date, d]) => ({ date, count: d.count, total: Math.round(d.total * 100) / 100 }))
    .sort((a, b) => params.order === "worst" ? a.total - b.total : b.total - a.total)
    .slice(0, limit);

  const sortedByVolume = Object.entries(grouped)
    .map(([date, d]) => ({ date, count: d.count, total: Math.round(d.total * 100) / 100 }))
    .sort((a, b) => params.order === "worst" ? a.count - b.count : b.count - a.count)
    .slice(0, limit);

  return {
    by_revenue: sortedByRevenue,
    by_volume: sortedByVolume,
    type: params.order === "worst" ? "piores" : "melhores",
    limit,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 9. cancellationRate ─────────────────────────────────
export async function cancellationRate(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ status: string; total_amount: number; marketplace: string }>(
    "orders", "status, total_amount, marketplace", (q) => {
      let query = applyDateFilter(q, dateRange);
      if (params.marketplace) query = query.ilike("marketplace", `%${params.marketplace}%`);
      return query;
    }
  );

  const total = data.length;
  const cancelled = data.filter((r) => r.status?.toLowerCase() === "cancelled");
  const paid = data.filter((r) => r.status?.toLowerCase() === "paid");
  const cancelledAmount = cancelled.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  const paidAmount = paid.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

  // Taxa por marketplace
  const byMarketplace: Record<string, { total: number; cancelled: number; rate: number }> = {};
  data.forEach((r) => {
    const m = r.marketplace || "desconhecido";
    if (!byMarketplace[m]) byMarketplace[m] = { total: 0, cancelled: 0, rate: 0 };
    byMarketplace[m].total++;
    if (r.status?.toLowerCase() === "cancelled") byMarketplace[m].cancelled++;
  });
  for (const key of Object.keys(byMarketplace)) {
    byMarketplace[key].rate = byMarketplace[key].total > 0
      ? Math.round((byMarketplace[key].cancelled / byMarketplace[key].total) * 10000) / 100
      : 0;
  }

  return {
    total_orders: total,
    cancelled_orders: cancelled.length,
    cancellation_rate: total > 0 ? Math.round((cancelled.length / total) * 10000) / 100 : 0,
    cancelled_amount: Math.round(cancelledAmount * 100) / 100,
    paid_orders: paid.length,
    paid_amount: Math.round(paidAmount * 100) / 100,
    by_marketplace: byMarketplace,
    filters: { marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ── 10. compareMarketplaces ─────────────────────────────
export async function compareMarketplaces(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ marketplace: string; total_amount: number; status: string; order_date: string }>(
    "orders", "marketplace, total_amount, status, order_date", (q) => applyDateFilter(q, dateRange)
  );

  const mktData: Record<string, {
    count: number; total: number; paid: number; cancelled: number;
    paid_amount: number; amounts: number[];
  }> = {};

  data.forEach((row) => {
    const m = row.marketplace || "desconhecido";
    if (!mktData[m]) mktData[m] = { count: 0, total: 0, paid: 0, cancelled: 0, paid_amount: 0, amounts: [] };
    const amount = Number(row.total_amount) || 0;
    mktData[m].count++;
    mktData[m].total += amount;
    mktData[m].amounts.push(amount);
    if (row.status?.toLowerCase() === "paid") { mktData[m].paid++; mktData[m].paid_amount += amount; }
    if (row.status?.toLowerCase() === "cancelled") mktData[m].cancelled++;
  });

  const grandTotal = data.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

  const comparison = Object.entries(mktData)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, d]) => ({
      marketplace: name,
      orders: d.count,
      revenue: Math.round(d.total * 100) / 100,
      revenue_share: grandTotal > 0 ? Math.round((d.total / grandTotal) * 10000) / 100 : 0,
      avg_ticket: d.count > 0 ? Math.round((d.total / d.count) * 100) / 100 : 0,
      paid_orders: d.paid,
      cancelled_orders: d.cancelled,
      cancellation_rate: d.count > 0 ? Math.round((d.cancelled / d.count) * 10000) / 100 : 0,
      conversion_rate: d.count > 0 ? Math.round((d.paid / d.count) * 10000) / 100 : 0,
    }));

  return {
    comparison,
    total_orders: data.length,
    total_revenue: Math.round(grandTotal * 100) / 100,
    filters: { period: fmtPeriod(dateRange) },
  };
}

// ── 11. comparePeriods ──────────────────────────────────
export async function comparePeriods(params: QueryParams) {
  // Período atual
  const currentRange = buildDateRange(params);
  if (!currentRange) {
    return { error: "Especifique um periodo para comparacao (start_date/end_date ou period_days)" };
  }

  // Período de comparação: mesmo tamanho, imediatamente anterior
  const currentStart = new Date(currentRange.start);
  const currentEnd = new Date(currentRange.end);
  const diffMs = currentEnd.getTime() - currentStart.getTime();
  const compareEnd = new Date(currentStart.getTime() - 1);
  const compareStart = new Date(compareEnd.getTime() - diffMs);

  const [currentData, previousData] = await Promise.all([
    fetchAllRows<{ total_amount: number; status: string }>("orders", "total_amount, status", (q) => {
      let query = q.gte("order_date", currentRange.start).lte("order_date", currentRange.end);
      query = applyFilters(query, params);
      return query;
    }),
    fetchAllRows<{ total_amount: number; status: string }>("orders", "total_amount, status", (q) => {
      let query = q.gte("order_date", compareStart.toISOString()).lte("order_date", compareEnd.toISOString());
      query = applyFilters(query, params);
      return query;
    }),
  ]);

  const calcMetrics = (rows: typeof currentData) => {
    const total = rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    const paid = rows.filter((r) => r.status?.toLowerCase() === "paid");
    return {
      orders: rows.length,
      revenue: Math.round(total * 100) / 100,
      avg_ticket: rows.length > 0 ? Math.round((total / rows.length) * 100) / 100 : 0,
      paid_orders: paid.length,
      paid_revenue: Math.round(paid.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) * 100) / 100,
    };
  };

  const current = calcMetrics(currentData);
  const previous = calcMetrics(previousData);

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 10000) / 100 : null;

  return {
    current_period: { start: currentRange.start, end: currentRange.end, ...current },
    previous_period: { start: compareStart.toISOString(), end: compareEnd.toISOString(), ...previous },
    changes: {
      orders: pctChange(current.orders, previous.orders),
      revenue: pctChange(current.revenue, previous.revenue),
      avg_ticket: pctChange(current.avg_ticket, previous.avg_ticket),
      paid_orders: pctChange(current.paid_orders, previous.paid_orders),
    },
    filters: { status: params.status, marketplace: params.marketplace },
  };
}

// ── 12. salesByHour ─────────────────────────────────────
export async function salesByHour(params: QueryParams) {
  const dateRange = buildDateRange(params);
  const data = await fetchAllRows<{ order_date: string; total_amount: number }>("orders", "order_date, total_amount", (q) => {
    let query = applyDateFilter(q, dateRange);
    query = applyFilters(query, params);
    return query;
  });

  const hours: Record<number, { count: number; total: number }> = {};
  for (let i = 0; i < 24; i++) hours[i] = { count: 0, total: 0 };

  data.forEach((row) => {
    if (!row.order_date) return;
    const hour = getHourBRT(row.order_date);
    hours[hour].count++;
    hours[hour].total += Number(row.total_amount) || 0;
  });

  const hourList = Object.entries(hours).map(([h, d]) => ({
    hour: parseInt(h),
    label: `${h.padStart(2, "0")}:00`,
    count: d.count,
    total: Math.round(d.total * 100) / 100,
  }));

  const peakHour = hourList.reduce((best, h) => h.count > best.count ? h : best, hourList[0]);
  const quietHour = hourList.filter((h) => h.count > 0).reduce((worst, h) => h.count < worst.count ? h : worst, hourList.find((h) => h.count > 0) || hourList[0]);

  return {
    hours: hourList,
    peak_hour: peakHour,
    quiet_hour: quietHour,
    total_orders: data.length,
    filters: { status: params.status, marketplace: params.marketplace, period: fmtPeriod(dateRange) },
  };
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AVANÇADAS (13-18)
// ═══════════════════════════════════════════════════════════

// ── 13. salesForecast ───────────────────────────────────
// Previsão de faturamento baseada em média móvel e tendência linear
export async function salesForecast(params: QueryParams) {
  // Busca todos os dados para calcular tendência
  const data = await fetchAllRows<{ order_date: string; total_amount: number }>(
    "orders", "order_date, total_amount", (q) => applyFilters(q, params)
  );

  // Agrupar por mês
  const monthly: Record<string, { count: number; total: number }> = {};
  data.forEach((row) => {
    if (!row.order_date) return;
    const month = toMonthBRT(row.order_date);
    if (!monthly[month]) monthly[month] = { count: 0, total: 0 };
    monthly[month].count++;
    monthly[month].total += Number(row.total_amount) || 0;
  });

  const months = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d], i) => ({ month, index: i, revenue: d.total, orders: d.count }));

  if (months.length < 3) {
    return { error: "Dados insuficientes para previsao. Necessario pelo menos 3 meses." };
  }

  // Média móvel de 3 meses
  const movingAvg3 = months.length >= 3
    ? (months[months.length - 1].revenue + months[months.length - 2].revenue + months[months.length - 3].revenue) / 3
    : months[months.length - 1].revenue;

  // Regressão linear simples para tendência
  const n = months.length;
  const sumX = months.reduce((s, m) => s + m.index, 0);
  const sumY = months.reduce((s, m) => s + m.revenue, 0);
  const sumXY = months.reduce((s, m) => s + m.index * m.revenue, 0);
  const sumX2 = months.reduce((s, m) => s + m.index * m.index, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const linearForecast = intercept + slope * n; // Próximo mês

  // Previsão ponderada (70% média móvel, 30% tendência linear)
  const forecast = movingAvg3 * 0.7 + linearForecast * 0.3;

  // Último mês completo
  const lastMonth = months[months.length - 1];
  // Mês atual (pode estar incompleto) — usar BRT
  const nowBRT = toBRT(new Date().toISOString());
  const currentMonthKey = `${nowBRT.getUTCFullYear()}-${String(nowBRT.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentMonthData = monthly[currentMonthKey];
  const daysInMonth = new Date(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth() + 1, 0).getDate();
  const daysPassed = nowBRT.getUTCDate();
  const projectedCurrentMonth = currentMonthData
    ? (currentMonthData.total / daysPassed) * daysInMonth
    : null;

  // Tendência geral
  const avgRevenue = sumY / n;
  const trend = slope > avgRevenue * 0.02 ? "crescimento" : slope < -avgRevenue * 0.02 ? "queda" : "estavel";

  // Sazonalidade: meses com performance acima/abaixo da média
  const aboveAvg = months.filter((m) => m.revenue > avgRevenue).map((m) => m.month);
  const belowAvg = months.filter((m) => m.revenue < avgRevenue).map((m) => m.month);

  return {
    forecast_next_month: Math.round(forecast * 100) / 100,
    moving_avg_3m: Math.round(movingAvg3 * 100) / 100,
    linear_trend_forecast: Math.round(linearForecast * 100) / 100,
    current_month: currentMonthData ? {
      month: currentMonthKey,
      actual_so_far: Math.round(currentMonthData.total * 100) / 100,
      orders_so_far: currentMonthData.count,
      days_passed: daysPassed,
      days_in_month: daysInMonth,
      projected_total: projectedCurrentMonth ? Math.round(projectedCurrentMonth * 100) / 100 : null,
    } : null,
    last_complete_month: {
      month: lastMonth.month,
      revenue: Math.round(lastMonth.revenue * 100) / 100,
      orders: lastMonth.orders,
    },
    trend,
    avg_monthly_revenue: Math.round(avgRevenue * 100) / 100,
    months_analyzed: n,
    strong_months: aboveAvg,
    weak_months: belowAvg,
    filters: { status: params.status, marketplace: params.marketplace },
  };
}

// ── 14. executiveSummary ────────────────────────────────
// Resumo executivo completo com todos os KPIs principais
export async function executiveSummary(params: QueryParams) {
  const dateRange = buildDateRange(params);

  // Buscar todos os dados de uma vez
  const data = await fetchAllRows<{
    status: string; marketplace: string; total_amount: number; order_date: string;
  }>("orders", "status, marketplace, total_amount, order_date", (q) => applyDateFilter(q, dateRange));

  const total = data.length;
  const amounts = data.map((r) => Number(r.total_amount) || 0);
  const totalRevenue = amounts.reduce((s, v) => s + v, 0);
  const avgTk = total > 0 ? totalRevenue / total : 0;

  // Por status
  const statusCount: Record<string, number> = {};
  const statusRevenue: Record<string, number> = {};
  data.forEach((r) => {
    const s = r.status || "unknown";
    statusCount[s] = (statusCount[s] || 0) + 1;
    statusRevenue[s] = (statusRevenue[s] || 0) + (Number(r.total_amount) || 0);
  });

  // Por marketplace
  const mktCount: Record<string, number> = {};
  const mktRevenue: Record<string, number> = {};
  data.forEach((r) => {
    const m = r.marketplace || "unknown";
    mktCount[m] = (mktCount[m] || 0) + 1;
    mktRevenue[m] = (mktRevenue[m] || 0) + (Number(r.total_amount) || 0);
  });

  // Por mês
  const monthlyRevenue: Record<string, number> = {};
  const monthlyCount: Record<string, number> = {};
  data.forEach((r) => {
    if (!r.order_date) return;
    const m = toMonthBRT(r.order_date);
    monthlyRevenue[m] = (monthlyRevenue[m] || 0) + (Number(r.total_amount) || 0);
    monthlyCount[m] = (monthlyCount[m] || 0) + 1;
  });

  const monthsSorted = Object.keys(monthlyRevenue).sort();
  const bestMonth = monthsSorted.reduce((best, m) => monthlyRevenue[m] > monthlyRevenue[best] ? m : best, monthsSorted[0]);
  const worstMonth = monthsSorted.reduce((worst, m) => monthlyRevenue[m] < monthlyRevenue[worst] ? m : worst, monthsSorted[0]);

  // Top marketplace
  const topMkt = Object.entries(mktRevenue).sort(([, a], [, b]) => b - a);

  // Cancelamento
  const cancelledCount = statusCount["cancelled"] || 0;
  const cancelledRevenue = statusRevenue["cancelled"] || 0;
  const paidCount = statusCount["paid"] || 0;
  const paidRevenue = statusRevenue["paid"] || 0;

  // Tendência: comparar último mês com penúltimo
  let monthTrend = null;
  if (monthsSorted.length >= 2) {
    const last = monthlyRevenue[monthsSorted[monthsSorted.length - 1]];
    const prev = monthlyRevenue[monthsSorted[monthsSorted.length - 2]];
    monthTrend = prev > 0 ? Math.round(((last - prev) / prev) * 10000) / 100 : null;
  }

  return {
    overview: {
      total_orders: total,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_ticket: Math.round(avgTk * 100) / 100,
      period: fmtPeriod(dateRange),
    },
    health: {
      paid_orders: paidCount,
      paid_revenue: Math.round(paidRevenue * 100) / 100,
      paid_pct: total > 0 ? Math.round((paidCount / total) * 10000) / 100 : 0,
      cancelled_orders: cancelledCount,
      cancelled_revenue: Math.round(cancelledRevenue * 100) / 100,
      cancellation_rate: total > 0 ? Math.round((cancelledCount / total) * 10000) / 100 : 0,
    },
    channels: topMkt.map(([name, rev]) => ({
      marketplace: name,
      revenue: Math.round(rev * 100) / 100,
      share: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 10000) / 100 : 0,
      orders: mktCount[name] || 0,
      avg_ticket: mktCount[name] > 0 ? Math.round((rev / mktCount[name]) * 100) / 100 : 0,
    })),
    timeline: {
      months_count: monthsSorted.length,
      best_month: { month: bestMonth, revenue: Math.round(monthlyRevenue[bestMonth] * 100) / 100 },
      worst_month: { month: worstMonth, revenue: Math.round(monthlyRevenue[worstMonth] * 100) / 100 },
      latest_month_trend: monthTrend,
    },
    status_breakdown: Object.entries(statusCount)
      .sort(([, a], [, b]) => b - a)
      .map(([s, c]) => ({
        status: s,
        count: c,
        pct: total > 0 ? Math.round((c / total) * 10000) / 100 : 0,
        revenue: Math.round((statusRevenue[s] || 0) * 100) / 100,
      })),
  };
}

// ── 15. marketplaceGrowth ───────────────────────────────
// Evolução mensal por marketplace — qual canal cresce mais?
export async function marketplaceGrowth(params: QueryParams) {
  const data = await fetchAllRows<{ marketplace: string; total_amount: number; order_date: string }>(
    "orders", "marketplace, total_amount, order_date", (q) => applyFilters(q, params)
  );

  // Agrupar: marketplace -> mês -> { count, total }
  const mktMonthly: Record<string, Record<string, { count: number; total: number }>> = {};

  data.forEach((row) => {
    if (!row.order_date) return;
    const m = row.marketplace || "unknown";
    const month = toMonthBRT(row.order_date);
    if (!mktMonthly[m]) mktMonthly[m] = {};
    if (!mktMonthly[m][month]) mktMonthly[m][month] = { count: 0, total: 0 };
    mktMonthly[m][month].count++;
    mktMonthly[m][month].total += Number(row.total_amount) || 0;
  });

  // Calcular crescimento para cada marketplace
  const marketplaces = Object.entries(mktMonthly).map(([name, months]) => {
    const sortedMonths = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
    const monthData = sortedMonths.map(([month, d], i) => ({
      month,
      revenue: Math.round(d.total * 100) / 100,
      orders: d.count,
      growth: i > 0 && sortedMonths[i - 1][1].total > 0
        ? Math.round(((d.total - sortedMonths[i - 1][1].total) / sortedMonths[i - 1][1].total) * 10000) / 100
        : null,
    }));

    // Crescimento total (primeiro vs último mês)
    const first = sortedMonths[0]?.[1].total || 0;
    const last = sortedMonths[sortedMonths.length - 1]?.[1].total || 0;
    const overallGrowth = first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : null;

    // Média mensal
    const totalRevenue = sortedMonths.reduce((s, [, d]) => s + d.total, 0);
    const avgMonthly = sortedMonths.length > 0 ? totalRevenue / sortedMonths.length : 0;

    return {
      marketplace: name,
      months: monthData,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_monthly: Math.round(avgMonthly * 100) / 100,
      overall_growth: overallGrowth,
      months_active: sortedMonths.length,
    };
  });

  // Ordenar por crescimento total
  marketplaces.sort((a, b) => (b.overall_growth || 0) - (a.overall_growth || 0));

  return {
    marketplaces,
    fastest_growing: marketplaces[0]?.marketplace || null,
    slowest_growing: marketplaces[marketplaces.length - 1]?.marketplace || null,
    filters: { status: params.status },
  };
}

// ── 16. cancellationByMonth ─────────────────────────────
// Taxa de cancelamento mês a mês com valor perdido
export async function cancellationByMonth(params: QueryParams) {
  const data = await fetchAllRows<{ status: string; total_amount: number; order_date: string; marketplace: string }>(
    "orders", "status, total_amount, order_date, marketplace", (q) => {
      if (params.marketplace) q = q.ilike("marketplace", `%${params.marketplace}%`);
      return q;
    }
  );

  const monthly: Record<string, {
    total: number; paid: number; cancelled: number;
    paidAmount: number; cancelledAmount: number;
  }> = {};

  data.forEach((row) => {
    if (!row.order_date) return;
    const month = toMonthBRT(row.order_date);
    if (!monthly[month]) monthly[month] = { total: 0, paid: 0, cancelled: 0, paidAmount: 0, cancelledAmount: 0 };
    const amount = Number(row.total_amount) || 0;
    monthly[month].total++;
    if (row.status?.toLowerCase() === "cancelled") {
      monthly[month].cancelled++;
      monthly[month].cancelledAmount += amount;
    }
    if (row.status?.toLowerCase() === "paid") {
      monthly[month].paid++;
      monthly[month].paidAmount += amount;
    }
  });

  const months = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      total_orders: d.total,
      paid_orders: d.paid,
      cancelled_orders: d.cancelled,
      cancellation_rate: d.total > 0 ? Math.round((d.cancelled / d.total) * 10000) / 100 : 0,
      paid_revenue: Math.round(d.paidAmount * 100) / 100,
      lost_revenue: Math.round(d.cancelledAmount * 100) / 100,
    }));

  const totalCancelled = months.reduce((s, m) => s + m.cancelled_orders, 0);
  const totalLost = months.reduce((s, m) => s + m.lost_revenue, 0);
  const totalOrders = months.reduce((s, m) => s + m.total_orders, 0);
  const worstMonth = months.length > 0
    ? months.reduce((worst, m) => m.cancellation_rate > worst.cancellation_rate ? m : worst, months[0])
    : null;
  const bestMonth = months.length > 0
    ? months.reduce((best, m) => m.cancellation_rate < best.cancellation_rate ? m : best, months[0])
    : null;

  return {
    months,
    summary: {
      total_cancelled: totalCancelled,
      total_lost_revenue: Math.round(totalLost * 100) / 100,
      avg_cancellation_rate: totalOrders > 0 ? Math.round((totalCancelled / totalOrders) * 10000) / 100 : 0,
      worst_month: worstMonth,
      best_month: bestMonth,
    },
    filters: { marketplace: params.marketplace },
  };
}

// ── 17. yearOverYear ────────────────────────────────────
// Comparação ano a ano (ou mês específico vs mesmo mês ano anterior)
export async function yearOverYear(params: QueryParams) {
  const data = await fetchAllRows<{ total_amount: number; order_date: string; status: string }>(
    "orders", "total_amount, order_date, status", (q) => applyFilters(q, params)
  );

  // Agrupar por ano-mês
  const monthly: Record<string, { count: number; total: number; paid: number; cancelled: number }> = {};
  data.forEach((row) => {
    if (!row.order_date) return;
    const month = toMonthBRT(row.order_date);
    if (!monthly[month]) monthly[month] = { count: 0, total: 0, paid: 0, cancelled: 0 };
    monthly[month].count++;
    monthly[month].total += Number(row.total_amount) || 0;
    if (row.status?.toLowerCase() === "paid") monthly[month].paid++;
    if (row.status?.toLowerCase() === "cancelled") monthly[month].cancelled++;
  });

  // Agrupar por número do mês para comparação YoY
  const byMonthNum: Record<string, Record<string, { revenue: number; orders: number }>> = {};
  Object.entries(monthly).forEach(([key, d]) => {
    const [year, mon] = key.split("-");
    if (!byMonthNum[mon]) byMonthNum[mon] = {};
    byMonthNum[mon][year] = { revenue: Math.round(d.total * 100) / 100, orders: d.count };
  });

  // Comparações YoY para cada mês que tem dados em múltiplos anos
  const comparisons = Object.entries(byMonthNum)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mon, years]) => {
      const yearsSorted = Object.entries(years).sort(([a], [b]) => a.localeCompare(b));
      const result: Record<string, unknown> = { month: mon };
      yearsSorted.forEach(([year, d]) => {
        result[`revenue_${year}`] = d.revenue;
        result[`orders_${year}`] = d.orders;
      });
      // Calcular variação entre anos
      if (yearsSorted.length >= 2) {
        const prev = yearsSorted[yearsSorted.length - 2][1];
        const curr = yearsSorted[yearsSorted.length - 1][1];
        result.revenue_change = prev.revenue > 0
          ? Math.round(((curr.revenue - prev.revenue) / prev.revenue) * 10000) / 100
          : null;
        result.orders_change = prev.orders > 0
          ? Math.round(((curr.orders - prev.orders) / prev.orders) * 10000) / 100
          : null;
      }
      return result;
    });

  // Totais por ano
  const byYear: Record<string, { revenue: number; orders: number }> = {};
  Object.entries(monthly).forEach(([key, d]) => {
    const year = key.split("-")[0];
    if (!byYear[year]) byYear[year] = { revenue: 0, orders: 0 };
    byYear[year].revenue += d.total;
    byYear[year].orders += d.count;
  });

  const yearTotals = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, d]) => ({
      year,
      revenue: Math.round(d.revenue * 100) / 100,
      orders: d.orders,
      avg_ticket: d.orders > 0 ? Math.round((d.revenue / d.orders) * 100) / 100 : 0,
    }));

  return {
    monthly_comparison: comparisons,
    yearly_totals: yearTotals,
    filters: { status: params.status, marketplace: params.marketplace },
  };
}

// ── 18. seasonalityAnalysis ─────────────────────────────
// Análise de padrões sazonais
export async function seasonalityAnalysis(params: QueryParams) {
  const data = await fetchAllRows<{ total_amount: number; order_date: string }>(
    "orders", "total_amount, order_date", (q) => applyFilters(q, params)
  );

  // Agrupar por mês do ano (1-12) para encontrar padrões
  const byMonthOfYear: Record<number, { revenues: number[]; orders: number[] }> = {};
  const monthlyRaw: Record<string, { total: number; count: number }> = {};

  data.forEach((row) => {
    if (!row.order_date) return;
    const monthNum = getMonthNumBRT(row.order_date);
    const monthKey = toMonthBRT(row.order_date);
    const amount = Number(row.total_amount) || 0;

    if (!monthlyRaw[monthKey]) monthlyRaw[monthKey] = { total: 0, count: 0 };
    monthlyRaw[monthKey].total += amount;
    monthlyRaw[monthKey].count++;

    if (!byMonthOfYear[monthNum]) byMonthOfYear[monthNum] = { revenues: [], orders: [] };
  });

  // Preencher byMonthOfYear com dados mensais reais
  Object.entries(monthlyRaw).forEach(([key, d]) => {
    const monthNum = parseInt(key.split("-")[1]);
    if (!byMonthOfYear[monthNum]) byMonthOfYear[monthNum] = { revenues: [], orders: [] };
    byMonthOfYear[monthNum].revenues.push(d.total);
    byMonthOfYear[monthNum].orders.push(d.count);
  });

  const monthNames = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  // Calcular média e índice sazonal para cada mês
  const allMonthlyRevenues = Object.values(monthlyRaw).map((d) => d.total);
  const grandAvg = allMonthlyRevenues.length > 0
    ? allMonthlyRevenues.reduce((s, v) => s + v, 0) / allMonthlyRevenues.length
    : 0;

  const seasonal = Object.entries(byMonthOfYear)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([monthNum, d]) => {
      const avgRevenue = d.revenues.length > 0 ? d.revenues.reduce((s, v) => s + v, 0) / d.revenues.length : 0;
      const avgOrders = d.orders.length > 0 ? d.orders.reduce((s, v) => s + v, 0) / d.orders.length : 0;
      const seasonalIndex = grandAvg > 0 ? Math.round((avgRevenue / grandAvg) * 100) : 100;

      return {
        month: parseInt(monthNum),
        name: monthNames[parseInt(monthNum)] || monthNum,
        avg_revenue: Math.round(avgRevenue * 100) / 100,
        avg_orders: Math.round(avgOrders),
        seasonal_index: seasonalIndex, // 100 = média, >100 = acima, <100 = abaixo
        classification: seasonalIndex >= 120 ? "forte" : seasonalIndex >= 90 ? "normal" : "fraco",
        data_points: d.revenues.length,
      };
    });

  const strongMonths = seasonal.filter((m) => m.classification === "forte");
  const weakMonths = seasonal.filter((m) => m.classification === "fraco");

  // Análise por dia da semana para complementar
  const byDow: Record<number, number[]> = {};
  data.forEach((row) => {
    if (!row.order_date) return;
    const dow = getDayOfWeekBRT(row.order_date);
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(Number(row.total_amount) || 0);
  });

  const dowNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const weekPattern = Object.entries(byDow)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([dow, amounts]) => ({
      day: dowNames[parseInt(dow)],
      avg_revenue: amounts.length > 0 ? Math.round((amounts.reduce((s, v) => s + v, 0) / amounts.length) * 100) / 100 : 0,
      avg_orders_per_day: amounts.length > 0 ? Math.round(amounts.length / (Object.keys(monthlyRaw).length * 4.33)) : 0,
    }));

  return {
    monthly_pattern: seasonal,
    strong_months: strongMonths.map((m) => m.name),
    weak_months: weakMonths.map((m) => m.name),
    weekly_pattern: weekPattern,
    avg_monthly_revenue: Math.round(grandAvg * 100) / 100,
    filters: { status: params.status, marketplace: params.marketplace },
  };
}

// ── 19. healthCheck ─────────────────────────────────────
// Alertas inteligentes proativos — diagnóstico automático do negócio
export async function healthCheck(_params: QueryParams) {
  const data = await fetchAllRows<{
    status: string; marketplace: string; total_amount: number; order_date: string;
  }>("orders", "status, marketplace, total_amount, order_date", (q) => q);

  const alerts: Array<{ type: "danger" | "warning" | "success" | "info"; message: string; metric?: string }> = [];

  // ── Agrupar por mês ───────────────────────────────────
  const monthly: Record<string, { count: number; total: number; paid: number; cancelled: number; cancelledAmount: number }> = {};
  const mktMonthly: Record<string, Record<string, { count: number; total: number; cancelled: number }>> = {};

  data.forEach((row) => {
    if (!row.order_date) return;
    const month = toMonthBRT(row.order_date);
    const amount = Number(row.total_amount) || 0;
    const mkt = row.marketplace || "unknown";
    const status = row.status?.toLowerCase() || "";

    if (!monthly[month]) monthly[month] = { count: 0, total: 0, paid: 0, cancelled: 0, cancelledAmount: 0 };
    monthly[month].count++;
    monthly[month].total += amount;
    if (status === "paid") monthly[month].paid++;
    if (status === "cancelled") { monthly[month].cancelled++; monthly[month].cancelledAmount += amount; }

    if (!mktMonthly[mkt]) mktMonthly[mkt] = {};
    if (!mktMonthly[mkt][month]) mktMonthly[mkt][month] = { count: 0, total: 0, cancelled: 0 };
    mktMonthly[mkt][month].count++;
    mktMonthly[mkt][month].total += amount;
    if (status === "cancelled") mktMonthly[mkt][month].cancelled++;
  });

  const sortedMonths = Object.keys(monthly).sort();
  if (sortedMonths.length < 2) {
    return { alerts: [{ type: "info" as const, message: "Dados insuficientes para análise (menos de 2 meses)" }], summary: null };
  }

  const nowBRT = toBRT(new Date().toISOString());
  const currentMonthKey = `${nowBRT.getUTCFullYear()}-${String(nowBRT.getUTCMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = nowBRT.getUTCDate();
  const daysInCurrentMonth = new Date(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth() + 1, 0).getDate();

  const currentMonth = monthly[currentMonthKey];
  const prevMonthKey = sortedMonths.filter((m) => m < currentMonthKey).pop();

  // Média histórica (meses completos)
  const completeMonths = sortedMonths.filter((m) => m < currentMonthKey);
  const avgRevenue = completeMonths.length > 0
    ? completeMonths.reduce((s, m) => s + monthly[m].total, 0) / completeMonths.length : 0;
  const avgOrders = completeMonths.length > 0
    ? completeMonths.reduce((s, m) => s + monthly[m].count, 0) / completeMonths.length : 0;

  // ── ALERTA 1: Projeção do mês vs média ────────────────
  if (currentMonth && dayOfMonth >= 5) {
    const projected = (currentMonth.total / dayOfMonth) * daysInCurrentMonth;
    const pct = avgRevenue > 0 ? ((projected - avgRevenue) / avgRevenue) * 100 : 0;
    if (pct < -30) {
      alerts.push({ type: "danger", metric: "revenue_projection",
        message: `Faturamento projetado em R$ ${Math.round(projected).toLocaleString("pt-BR")} — ${Math.abs(Math.round(pct))}% ABAIXO da média (R$ ${Math.round(avgRevenue).toLocaleString("pt-BR")}). Faltam ${daysInCurrentMonth - dayOfMonth} dias.` });
    } else if (pct < -10) {
      alerts.push({ type: "warning", metric: "revenue_projection",
        message: `Faturamento projetado ${Math.abs(Math.round(pct))}% abaixo da média. Atual: R$ ${Math.round(currentMonth.total).toLocaleString("pt-BR")} em ${dayOfMonth} dias.` });
    } else if (pct > 20) {
      alerts.push({ type: "success", metric: "revenue_projection",
        message: `Mês em alta! Projeção de R$ ${Math.round(projected).toLocaleString("pt-BR")} — ${Math.round(pct)}% acima da média.` });
    }
  }

  // ── ALERTA 2: YoY mesmo mês ───────────────────────────
  const lastYearKey = sortedMonths.find((m) => {
    const [y, mo] = m.split("-");
    return mo === currentMonthKey.split("-")[1] && parseInt(y) < parseInt(currentMonthKey.split("-")[0]);
  });
  if (lastYearKey && currentMonth && dayOfMonth >= 5) {
    const ly = monthly[lastYearKey];
    const projected = (currentMonth.total / dayOfMonth) * daysInCurrentMonth;
    const yoy = ly.total > 0 ? ((projected - ly.total) / ly.total) * 100 : 0;
    if (Math.abs(yoy) > 15) {
      alerts.push({ type: yoy < 0 ? "warning" : "success", metric: "yoy",
        message: `vs ${lastYearKey}: ${yoy > 0 ? "+" : ""}${Math.round(yoy)}% em faturamento (era R$ ${Math.round(ly.total).toLocaleString("pt-BR")}).` });
    }
  }

  // ── ALERTA 3: Taxa de cancelamento ────────────────────
  if (currentMonth && currentMonth.count > 20) {
    const rate = (currentMonth.cancelled / currentMonth.count) * 100;
    const avgRate = completeMonths.length > 0
      ? completeMonths.reduce((s, m) => s + (monthly[m].count > 0 ? (monthly[m].cancelled / monthly[m].count) * 100 : 0), 0) / completeMonths.length : 0;
    if (rate > avgRate + 5) {
      alerts.push({ type: "danger", metric: "cancellation",
        message: `Taxa de cancelamento em ${rate.toFixed(1)}% — acima da média de ${avgRate.toFixed(1)}%. Perda: R$ ${Math.round(currentMonth.cancelledAmount).toLocaleString("pt-BR")}.` });
    } else if (rate < avgRate - 3) {
      alerts.push({ type: "success", metric: "cancellation",
        message: `Cancelamentos em ${rate.toFixed(1)}% — melhor que a média de ${avgRate.toFixed(1)}%.` });
    }
  }

  // ── ALERTA 4: Cancelamento por marketplace ────────────
  const mktNames: Record<string, string> = { bagy: "Bagy", ml: "Mercado Livre", shopee: "Shopee", shein: "Shein", "physical store": "Loja Física" };
  for (const [mkt, mktData] of Object.entries(mktMonthly)) {
    const cur = mktData[currentMonthKey];
    const prev = prevMonthKey ? mktData[prevMonthKey] : null;
    if (cur && prev && cur.count > 10 && prev.count > 10) {
      const curRate = (cur.cancelled / cur.count) * 100;
      const prevRate = (prev.cancelled / prev.count) * 100;
      if (curRate > prevRate + 8) {
        alerts.push({ type: "warning", metric: "mkt_cancellation",
          message: `Cancelamentos no ${mktNames[mkt] || mkt} subiram de ${prevRate.toFixed(1)}% para ${curRate.toFixed(1)}% este mês.` });
      }
    }
  }

  // ── ALERTA 5: Ticket médio tendência ──────────────────
  const last3 = completeMonths.slice(-3);
  if (last3.length === 3) {
    const tk = last3.map((m) => monthly[m].count > 0 ? monthly[m].total / monthly[m].count : 0);
    if (tk[0] > tk[1] && tk[1] > tk[2]) {
      alerts.push({ type: "warning", metric: "avg_ticket",
        message: `Ticket médio em queda há 3 meses: R$ ${Math.round(tk[0])} → R$ ${Math.round(tk[1])} → R$ ${Math.round(tk[2])}.` });
    } else if (tk[0] < tk[1] && tk[1] < tk[2]) {
      alerts.push({ type: "success", metric: "avg_ticket",
        message: `Ticket médio crescendo há 3 meses: R$ ${Math.round(tk[0])} → R$ ${Math.round(tk[1])} → R$ ${Math.round(tk[2])}.` });
    }
  }

  // ── ALERTA 6: Última semana ───────────────────────────
  let weekTotal = 0, weekOrders = 0;
  data.forEach((row) => {
    if (!row.order_date) return;
    const d = toBRT(row.order_date);
    const daysAgo = Math.floor((nowBRT.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo >= 0 && daysAgo < 7) {
      weekTotal += Number(row.total_amount) || 0;
      weekOrders++;
    }
  });
  const avgWeekly = avgRevenue / 4.33;
  if (weekTotal > avgWeekly * 1.3 && weekOrders > 20) {
    alerts.push({ type: "success", metric: "weekly",
      message: `Ótima semana! R$ ${Math.round(weekTotal).toLocaleString("pt-BR")} nos últimos 7 dias (${weekOrders} pedidos) — ${Math.round(((weekTotal / avgWeekly) - 1) * 100)}% acima da média semanal.` });
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
      revenue_so_far: currentMonth ? Math.round(currentMonth.total * 100) / 100 : 0,
      orders_so_far: currentMonth ? currentMonth.count : 0,
      avg_monthly_revenue: Math.round(avgRevenue * 100) / 100,
      avg_monthly_orders: Math.round(avgOrders),
    },
  };
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
};

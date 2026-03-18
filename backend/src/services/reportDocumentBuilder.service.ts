import { fetchDashboardAggregated, type DashboardParams } from "./dashboard";
import { getMarketplaceInfo } from "../config/marketplace";
import { ProductAnalyzer, type OptimusFilters } from "./optimus/productAnalyzer";
import { queryFunctions } from "./query-functions";
import { CustomReportBuilderService, type CustomReportDefinition } from "./customReportBuilder.service";
import {
  type GeneratedSheet,
  type ReportFiltersInput,
  type ReportType,
  type ScheduledReportRow,
  REPORT_TIMEZONE,
  formatCurrency,
  formatPercent,
  resolveDateWindow,
} from "./reportScheduler.utils";

export interface ReportDocument {
  title: string;
  reportType: ReportType | "custom_builder";
  periodLabel: string;
  sheets: GeneratedSheet[];
  summaryRows: Array<Record<string, string | number | null>>;
  previewRows: Array<Record<string, string | number | null>>;
  metadata: Record<string, unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  total_orders: "Total de Pedidos",
  total_revenue: "Faturamento Total",
  avg_ticket: "Ticket Médio",
  paid_orders: "Pedidos Pagos",
  paid_revenue: "Receita Paga",
  cancelled_orders: "Pedidos Cancelados",
  cancelled_revenue: "Receita Cancelada",
  cancellation_rate: "Taxa de Cancelamento",
  conversion_rate: "Taxa de Conversão",
  revenue_share: "Participação na Receita",
  share: "Participação",
  orders: "Pedidos",
  revenue: "Faturamento",
  marketplace: "Marketplace",
  comparison: "Comparativo",
  overview: "Resumo Geral",
  health: "Saúde da Operação",
  timeline: "Evolução",
  months: "Meses",
  status_breakdown: "Distribuição por Status",
  filters: "Filtros",
  note: "Observação",
  distinct_buyers: "Clientes Distintos",
  total_distinct_buyers: "Total de Clientes Distintos",
  total_spent: "Gasto Total",
  avg_total_spent: "Gasto Médio",
  count: "Quantidade",
  best_month: "Melhor Mês",
  worst_month: "Pior Mês",
  growth_pct: "Variação",
  month: "Mês",
  period: "Período",
  latest_month_trend: "Tendência do Último Mês",
  count_orders: "Pedidos",
  rank: "Posição",
  name: "Nome",
  status: "Status",
  last_order: "Última Compra",
  days_since_last: "Dias desde a Última Compra",
  days_inactive: "Dias Inativo",
  by_marketplace: "Por Marketplace",
  inactive_customers: "Clientes Inativos",
  top_buyers: "Top Clientes",
  year: "Ano",
  years: "Anos",
  monthly_comparison: "Comparativo Mensal",
  channels: "Canais",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Pagos",
  cancelled: "Cancelados",
  shipped: "Enviados",
  pending: "Pendentes",
  "pending processing": "Em processamento",
  partially_refunded: "Parcialmente reembolsados",
  success: "Sucesso",
  failed: "Falha",
  active: "Ativo",
  inactive: "Inativo",
};

const FUNCTION_LABELS: Record<string, string> = {
  compareMarketplaces: "Comparativo por Marketplace",
  ordersByMarketplace: "Vendas por Marketplace",
  salesByMonth: "Evolução Mensal de Vendas",
  executiveSummary: "Resumo Executivo",
  customerCount: "Base de Clientes",
  topBuyers: "Top Clientes",
  inactiveCustomers: "Clientes Inativos",
  newCustomers: "Novos Clientes",
  customerPurchasePatterns: "Comportamento de Compra",
  cancellationRate: "Taxa de Cancelamento",
  comparePeriods: "Comparação de Períodos",
};

const FUNCTION_SECTION_LABELS: Record<string, Record<string, string>> = {
  compareMarketplaces: {
    comparison: "Comparativo por Marketplace",
  },
  executiveSummary: {
    overview: "Resumo Executivo",
    health: "Saúde da Operação",
    channels: "Canais",
    timeline: "Linha do Tempo",
    status_breakdown: "Distribuição por Status",
  },
  customerCount: {
    by_marketplace: "Clientes por Marketplace",
  },
  topBuyers: {
    top_buyers: "Ranking de Clientes",
  },
  inactiveCustomers: {
    inactive_customers: "Lista de Clientes Inativos",
  },
};

function prettifyKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function translateFieldLabel(key: string, functionName?: string) {
  return FUNCTION_SECTION_LABELS[functionName || ""]?.[key] || FIELD_LABELS[key] || prettifyKey(key);
}

function formatMonthLabel(value: string) {
  if (/^\d{2}$/.test(value)) {
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const idx = Number(value) - 1;
    return idx >= 0 && idx < names.length ? names[idx] : value;
  }
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const idx = Number(month) - 1;
  return idx >= 0 && idx < names.length ? `${names[idx]}/${year}` : value;
}

function formatIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: REPORT_TIMEZONE });
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString("pt-BR", { timeZone: REPORT_TIMEZONE });
  }
  return value;
}

function formatScalarByKey(key: string, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "Sim" : "Não";

  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (key.includes("marketplace")) return getMarketplaceInfo(value).label;
    if (key === "status" || key.endsWith("_status")) return STATUS_LABELS[lower] || prettifyKey(value);
    if (/^\d{4}-\d{2}$/.test(value)) return formatMonthLabel(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatIsoDate(value);
    return value;
  }

  if (typeof value === "number") {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("revenue") || normalizedKey.includes("amount") || normalizedKey.includes("ticket") || normalizedKey.includes("spent")) {
      return formatCurrency(value);
    }
    if (
      normalizedKey.includes("rate") ||
      normalizedKey.includes("share") ||
      normalizedKey.endsWith("_pct") ||
      normalizedKey.includes("percent")
    ) {
      return formatPercent(value);
    }
    return Number.isInteger(value) ? value : Number(value.toFixed(2));
  }

  return null;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function normalizeCellValue(value: unknown, key = ""): string | number | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return formatScalarByKey(key, value);
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) {
    if (value.every((item) => isScalar(item))) {
      return value.map((item) => String(item ?? "")).join(", ");
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function buildRowsFromArray(items: unknown[], functionName?: string): Array<Record<string, string | number | null>> {
  if (items.length === 0) return [];

  if (items.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    const records = items as Array<Record<string, unknown>>;
    const nestedArrayKeys = Array.from(
      new Set(
        records.flatMap((record) =>
          Object.entries(record)
            .filter(([, value]) => Array.isArray(value) && value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry)))
            .map(([key]) => key),
        ),
      ),
    );

    if (nestedArrayKeys.length === 1) {
      const nestedKey = nestedArrayKeys[0];
      const parentScalarKeys = Array.from(
        new Set(
          records.flatMap((record) =>
            Object.keys(record).filter((key) => key !== nestedKey && isScalar(record[key])),
          ),
        ),
      );

      const nestedKeys = Array.from(
        new Set(
          records.flatMap((record) =>
            ((record[nestedKey] as Array<Record<string, unknown>> | undefined) || []).flatMap((entry) => Object.keys(entry)),
          ),
        ),
      );

      const expandedRows = records.flatMap((record) => {
        const nestedItems = ((record[nestedKey] as Array<Record<string, unknown>> | undefined) || []);
        if (nestedItems.length === 0) {
          return [
            Object.fromEntries([
              ...parentScalarKeys.map((key) => [translateFieldLabel(key, functionName), normalizeCellValue(record[key], key)]),
            ]),
          ];
        }

        return nestedItems.map((nested) =>
          Object.fromEntries([
            ...parentScalarKeys.map((key) => [translateFieldLabel(key, functionName), normalizeCellValue(record[key], key)]),
            ...nestedKeys.map((key) => [translateFieldLabel(key, functionName), normalizeCellValue(nested[key], key)]),
          ]),
        );
      });

      if (expandedRows.length > 0) {
        return expandedRows;
      }
    }

    const keys = Array.from(
      new Set(
        items.flatMap((item) => Object.keys(item as Record<string, unknown>)),
      ),
    );
    return items.map((item) => {
      const record = item as Record<string, unknown>;
      return Object.fromEntries(keys.map((key) => [translateFieldLabel(key, functionName), normalizeCellValue(record[key], key)]));
    });
  }

  return items.map((item, index) => ({
    Item: index + 1,
    Valor: normalizeCellValue(item),
  }));
}

function buildRowsFromObject(value: Record<string, unknown>, functionName?: string): Array<Record<string, string | number | null>> {
  const entries = Object.entries(value);
  if (entries.length === 0) return [];

  const allScalar = entries.every(([, current]) => isScalar(current) || Array.isArray(current));
  if (allScalar) {
    return entries.map(([field, current]) => ({
      Campo: translateFieldLabel(field, functionName),
      Valor: normalizeCellValue(current, field),
    }));
  }

  const allObjects = entries.every(([, current]) => current && typeof current === "object" && !Array.isArray(current));
  if (allObjects) {
    const nestedKeys = Array.from(
      new Set(
        entries.flatMap(([, current]) => Object.keys(current as Record<string, unknown>)),
      ),
    );

    return entries.map(([field, current]) => {
      const nested = current as Record<string, unknown>;
      return Object.fromEntries([
        ["Item", translateFieldLabel(field, functionName)],
        ...nestedKeys.map((key) => [translateFieldLabel(key, functionName), normalizeCellValue(nested[key], key)]),
      ]);
    });
  }

  return entries.map(([field, current]) => ({
    Campo: translateFieldLabel(field, functionName),
    Valor: normalizeCellValue(current, field),
  }));
}

function toSheet(name: string, value: unknown, functionName?: string): GeneratedSheet {
  if (Array.isArray(value)) {
    return { name, rows: buildRowsFromArray(value, functionName) };
  }

  if (value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0) {
    return { name, rows: buildRowsFromObject(value as Record<string, unknown>, functionName) };
  }

  // Skip sheets for undefined/null/empty values
  if (value === undefined || value === null || value === "") {
    return { name, rows: [] };
  }

  return {
    name,
    rows: [{ Valor: normalizeCellValue(value) }],
  };
}

function extractRequestedYears(question?: string) {
  if (!question) return [];
  return Array.from(new Set((question.match(/\b20\d{2}\b/g) || [])));
}

function extractRequestedMonths(question?: string) {
  if (!question) return [];
  const monthMap: Record<string, string> = {
    janeiro: "01",
    fevereiro: "02",
    março: "03",
    marco: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };

  const normalized = question.toLowerCase();
  return Object.entries(monthMap)
    .filter(([label]) => normalized.includes(label))
    .map(([, value]) => value);
}

function filterGenericResult(functionName: string, result: Record<string, unknown>, question?: string) {
  if (functionName !== "yearOverYear") return result;

  const requestedYears = extractRequestedYears(question);
  const requestedMonths = extractRequestedMonths(question);
  const next = { ...result };

  if (Array.isArray(next.years)) {
    next.years = (next.years as Array<Record<string, unknown>>).filter((item) => {
      if (requestedYears.length === 0) return true;
      return requestedYears.includes(String(item.year || ""));
    });
  }

  if (Array.isArray(next.monthly_comparison)) {
    next.monthly_comparison = (next.monthly_comparison as Array<Record<string, unknown>>)
      .filter((item) => {
        if (requestedMonths.length === 0) return true;
        return requestedMonths.includes(String(item.month || ""));
      })
      .map((item) => ({
        ...item,
        years: Array.isArray(item.years)
          ? (item.years as Array<Record<string, unknown>>).filter((yearItem) => {
            if (requestedYears.length === 0) return true;
            return requestedYears.includes(String(yearItem.year || ""));
          })
          : item.years,
      }));
  }

  return next;
}

function getPrimarySectionKey(functionName: string, result: Record<string, unknown>, question?: string) {
  const requestedMonths = extractRequestedMonths(question);

  if (functionName === "yearOverYear") {
    if (requestedMonths.length > 0 && Array.isArray(result.monthly_comparison)) return "monthly_comparison";
    if (Array.isArray(result.years) && (result.years as unknown[]).length > 0) return "years";
  }

  const preferredOrder: Record<string, string[]> = {
    compareMarketplaces: ["comparison"],
    ordersByMarketplace: ["marketplaces"],
    salesByMonth: ["months"],
    executiveSummary: ["channels", "status_breakdown", "overview"],
    customerCount: ["by_marketplace"],
    topBuyers: ["top_buyers"],
    inactiveCustomers: ["inactive_customers"],
    newCustomers: ["by_marketplace"],
    customerPurchasePatterns: ["lifecycle", "channel_distribution"],
  };

  const preferred = preferredOrder[functionName] || [];
  const matched = preferred.find((key) => result[key] !== undefined);
  if (matched) return matched;

  const candidates = Object.entries(result)
    .filter(([key, value]) => key !== "filters" && !isScalar(value))
    .map(([key, value]) => ({
      key,
      score: Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value as Record<string, unknown>).length
          : 0,
    }))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.key || null;
}

function buildDashboardParams(window: { startDate: string; endDate: string }, filters: ReportFiltersInput): DashboardParams {
  return {
    start_date: window.startDate,
    end_date: window.endDate,
    status: filters.status || undefined,
  };
}

function selectPreviewRows(sheets: GeneratedSheet[]) {
  const sorted = [...sheets].sort((left, right) => (right.rows.length || 0) - (left.rows.length || 0));
  return sorted[0]?.rows || sheets[0]?.rows || [];
}

async function buildSalesDocument(schedule: Pick<ScheduledReportRow, "report_type" | "filters" | "tenant_id" | "name">): Promise<ReportDocument> {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const aggregated = await fetchDashboardAggregated(buildDashboardParams(window, filters), schedule.tenant_id);

  const cancellationRate =
    aggregated.overview.total_orders > 0
      ? (aggregated.overview.cancelled_orders / aggregated.overview.total_orders) * 100
      : 0;

  const summaryRows: GeneratedSheet["rows"] = [
    { Métrica: "Pedidos", Valor: aggregated.overview.total_orders },
    { Métrica: "Faturamento Total", Valor: formatCurrency(aggregated.overview.total_revenue) },
    { Métrica: "Ticket Médio", Valor: formatCurrency(aggregated.overview.avg_ticket) },
    { Métrica: "Pedidos Pagos", Valor: aggregated.overview.paid_orders },
    { Métrica: "Receita Paga", Valor: formatCurrency(aggregated.overview.paid_revenue) },
    { Métrica: "Pedidos Cancelados", Valor: aggregated.overview.cancelled_orders },
    { Métrica: "Taxa de Cancelamento", Valor: formatPercent(cancellationRate) },
    { Métrica: "Tendência MoM", Valor: aggregated.trends.momTrend !== null ? formatPercent(aggregated.trends.momTrend) : "N/A" },
  ];

  const channels = Object.entries(aggregated.paidByMkt).map(([marketplace, revenue]) => ({
    Marketplace: marketplace,
    Receita: formatCurrency(revenue),
  }));

  const monthly = aggregated.months.map((month) => ({
    Mês: month.month,
    Pago: formatCurrency(month.paid),
    Cancelado: formatCurrency(month.cancelled),
    Pedidos: month.count,
    "Ticket Médio": formatCurrency(month.avgTicket),
  }));

  const sheets = [
    { name: "Resumo", rows: summaryRows },
    { name: "Canais", rows: channels },
    { name: "Mensal", rows: monthly },
  ];

  return {
    title: schedule.name,
    reportType: "sales",
    periodLabel: window.label,
    sheets,
    summaryRows,
    previewRows: selectPreviewRows(sheets),
    metadata: {
      filters,
      comparedMonths: aggregated.trends.comparedMonths,
    },
  };
}

async function buildFinanceDocument(schedule: Pick<ScheduledReportRow, "report_type" | "filters" | "tenant_id" | "name">): Promise<ReportDocument> {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const aggregated = await fetchDashboardAggregated(buildDashboardParams(window, filters), schedule.tenant_id);
  const cancelledRate =
    aggregated.overview.total_orders > 0
      ? (aggregated.overview.cancelled_orders / aggregated.overview.total_orders) * 100
      : 0;

  const summaryRows: GeneratedSheet["rows"] = [
    { Indicador: "Receita total", Valor: formatCurrency(aggregated.overview.total_revenue) },
    { Indicador: "Receita paga", Valor: formatCurrency(aggregated.overview.paid_revenue) },
    { Indicador: "Receita cancelada", Valor: formatCurrency(aggregated.overview.cancelled_revenue) },
    { Indicador: "Pedidos pagos", Valor: aggregated.overview.paid_orders },
    { Indicador: "Pedidos cancelados", Valor: aggregated.overview.cancelled_orders },
    { Indicador: "Ticket médio", Valor: formatCurrency(aggregated.overview.avg_ticket) },
    { Indicador: "Taxa de cancelamento", Valor: formatPercent(cancelledRate) },
  ];

  const monthly = aggregated.months.map((month) => ({
    Mês: month.month,
    "Receita Paga": formatCurrency(month.paid),
    "Receita Cancelada": formatCurrency(month.cancelled),
    Pedidos: month.count,
  }));

  const sheets = [
    { name: "Financeiro", rows: summaryRows },
    { name: "Mensal", rows: monthly },
  ];

  return {
    title: schedule.name,
    reportType: "finance",
    periodLabel: window.label,
    sheets,
    summaryRows,
    previewRows: selectPreviewRows(sheets),
    metadata: {
      filters,
      comparedMonths: aggregated.trends.comparedMonths,
    },
  };
}

async function buildProductDocument(schedule: Pick<ScheduledReportRow, "report_type" | "filters" | "tenant_id" | "name">): Promise<ReportDocument> {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const optimusFilters: OptimusFilters = {
    tenantId: schedule.tenant_id,
    category: filters.category || undefined,
    lowStock: Boolean(filters.low_stock),
    outOfStock: Boolean(filters.out_of_stock),
    excessStock: Boolean(filters.excess_stock),
    includeSummary: true,
    limit: 250,
    exportMode: true,
  };

  const [result, summary] = await Promise.all([
    ProductAnalyzer.queryProducts(optimusFilters),
    ProductAnalyzer.getInventoryHealth(schedule.tenant_id, optimusFilters),
  ]);

  const summaryRows: GeneratedSheet["rows"] = [
    { Indicador: "Produtos", Valor: summary.total_products },
    { Indicador: "Sem estoque", Valor: summary.out_of_stock },
    { Indicador: "Estoque baixo", Valor: summary.low_stock },
    { Indicador: "Excesso de estoque", Valor: summary.excess_stock },
    { Indicador: "Produtos sem venda", Valor: summary.stale_products },
    { Indicador: "Valor em custo", Valor: formatCurrency(summary.stock_value_cost) },
    { Indicador: "Valor em venda", Valor: formatCurrency(summary.stock_value_sale) },
  ];

  const productRows = result.products.map((product) => ({
    Produto: product.name,
    SKU: product.sku,
    Categoria: product.category_name || product.category || "Sem categoria",
    "Preço Venda": formatCurrency(product.sale_price),
    "Margem %": formatPercent(product.margin_percent),
    Estoque: product.stock_level,
    Status: product.stock_status,
    "Vendidos 30d": product.units_sold_30d,
    "Receita 90d": formatCurrency(product.revenue_90d),
  }));

  const sheets = [
    { name: "Resumo", rows: summaryRows },
    { name: "Produtos", rows: productRows },
  ];

  return {
    title: schedule.name,
    reportType: "products",
    periodLabel: "Snapshot atual de produtos",
    sheets,
    summaryRows,
    previewRows: selectPreviewRows(sheets),
    metadata: {
      filters,
      summary,
    },
  };
}

async function buildCustomerDocument(schedule: Pick<ScheduledReportRow, "report_type" | "filters" | "tenant_id" | "name">): Promise<ReportDocument> {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const params = {
    _tenant_id: schedule.tenant_id,
    start_date: window.startDate,
    end_date: window.endDate,
    marketplace: filters.marketplace || undefined,
  };

  const [countResult, topBuyersResult, newCustomersResult, patternsResult] = await Promise.all([
    queryFunctions.customerCount(params as never),
    queryFunctions.topBuyers({ ...params, limit: 15 } as never),
    queryFunctions.newCustomers(params as never),
    queryFunctions.customerPurchasePatterns(params as never),
  ]);

  const countData = countResult as {
    total_distinct_buyers?: number;
    total_orders?: number;
    total_revenue?: number;
    by_marketplace?: Record<string, { distinct_buyers: number; orders: number; revenue: number }>;
  };
  const topBuyers = (topBuyersResult as { top_buyers?: Array<Record<string, unknown>> }).top_buyers || [];
  const newCustomers = newCustomersResult as {
    total_new_buyers?: number;
    total_new_revenue?: number;
  };
  const patterns = patternsResult as {
    frequency?: { avg_orders_per_buyer: number; repeat_rate: number };
    lifecycle?: Record<string, number>;
  };

  const summaryRows: GeneratedSheet["rows"] = [
    { Indicador: "Clientes distintos", Valor: countData.total_distinct_buyers || 0 },
    { Indicador: "Pedidos", Valor: countData.total_orders || 0 },
    { Indicador: "Receita", Valor: formatCurrency(countData.total_revenue || 0) },
    { Indicador: "Novos clientes", Valor: newCustomers.total_new_buyers || 0 },
    { Indicador: "Receita de novos clientes", Valor: formatCurrency(newCustomers.total_new_revenue || 0) },
    { Indicador: "Pedidos médios por cliente", Valor: patterns.frequency?.avg_orders_per_buyer || 0 },
    { Indicador: "Taxa de recompra", Valor: formatPercent(patterns.frequency?.repeat_rate || 0) },
  ];

  const topBuyerRows = topBuyers.map((buyer) => ({
    Cliente: String(buyer.name || ""),
    Marketplace: String(buyer.marketplace || ""),
    Pedidos: Number(buyer.total_orders || 0),
    "Gasto Total": formatCurrency(Number(buyer.total_spent || 0)),
    "Ticket Médio": formatCurrency(Number(buyer.avg_ticket || 0)),
    Status: String(buyer.status || ""),
  }));

  const lifecycleRows = Object.entries(patterns.lifecycle || {}).map(([stage, count]) => ({
    Estágio: stage,
    Clientes: count,
  }));

  const channelRows = Object.entries(countData.by_marketplace || {}).map(([marketplace, data]) => ({
    Marketplace: marketplace,
    Clientes: data.distinct_buyers,
    Pedidos: data.orders,
    Receita: formatCurrency(data.revenue),
  }));

  const sheets = [
    { name: "Resumo", rows: summaryRows },
    { name: "Top Clientes", rows: topBuyerRows },
    { name: "Canais", rows: channelRows },
    { name: "Ciclo de Vida", rows: lifecycleRows },
  ];

  return {
    title: schedule.name,
    reportType: "customers",
    periodLabel: window.label,
    sheets,
    summaryRows,
    previewRows: selectPreviewRows(sheets),
    metadata: {
      filters,
      patterns,
    },
  };
}

export async function buildCustomDefinitionDocument(params: {
  tenantId: string;
  name: string;
  description?: string | null;
  definition: CustomReportDefinition;
}): Promise<ReportDocument> {
  const preview = await CustomReportBuilderService.preview(params.definition, params.tenantId);
  const rows = preview.rows as Array<Record<string, string | number | null>>;
  const sheets = [
    {
      name: params.name.slice(0, 31) || "Customizado",
      rows,
    },
  ];

  return {
    title: params.name,
    reportType: "custom_builder",
    periodLabel: `Snapshot customizado • ${new Date().toLocaleDateString("pt-BR", { timeZone: REPORT_TIMEZONE })}`,
    sheets,
    summaryRows: [],
    previewRows: rows,
    metadata: {
      description: params.description || null,
      definition: params.definition,
      sql: preview.sql,
      rowCount: preview.rowCount,
    },
  };
}

export function buildGenericAnalysisDocument(params: {
  title: string;
  functionName: string;
  result: unknown;
  question?: string;
}): ReportDocument {
  const rawTopLevel = params.result && typeof params.result === "object" && !Array.isArray(params.result)
    ? (params.result as Record<string, unknown>)
    : { resultado: params.result };
  const topLevel = filterGenericResult(params.functionName, rawTopLevel, params.question);

  // Build summary from all scalar (key-value) fields
  const summaryRows = Object.entries(topLevel)
    .filter(([key, value]) => key !== "filters" && isScalar(value))
    .map(([field, value]) => ({
      Indicador: translateFieldLabel(field, params.functionName),
      Valor: normalizeCellValue(value, field),
    }));

  // Build sheets from ALL non-scalar sections (not just the primary one)
  const dataSheets = Object.entries(topLevel)
    .filter(([key]) => key !== "filters")
    .filter(([, value]) => !isScalar(value) && value !== undefined && value !== null)
    .map(([key, value]) => toSheet(
      (translateFieldLabel(key, params.functionName)).slice(0, 31) || "Dados",
      value,
      params.functionName,
    ))
    .filter((sheet) => sheet.rows.length > 0);

  // Always include a "Resumo" sheet with scalar indicators if we have any
  const sheets: GeneratedSheet[] = [];
  if (summaryRows.length > 0) {
    sheets.push({ name: "Resumo", rows: summaryRows });
  }
  sheets.push(...dataSheets);

  if (sheets.length === 0) {
    sheets.push({
      name: "Dados",
      rows: [{ Valor: normalizeCellValue(params.result) }],
    });
  }

  const primaryPreview = sheets.find((sheet) => sheet.rows.length > 1)?.rows
    || sheets.find((sheet) => sheet.rows.length > 0)?.rows
    || [];

  return {
    title: params.title && params.title.trim().length >= 12
      ? params.title.trim()
      : (FUNCTION_LABELS[params.functionName] || params.title),
    reportType: "custom_builder",
    periodLabel: params.question?.trim()
      ? `Gerado a partir do pedido: ${params.question.trim()}`
      : `Gerado a partir da análise ${FUNCTION_LABELS[params.functionName] || params.functionName}`,
    sheets,
    summaryRows,
    previewRows: primaryPreview,
    metadata: {
      function_name: params.functionName,
      question: params.question || null,
    },
  };
}

async function buildCustomScheduledDocument(schedule: Pick<ScheduledReportRow, "tenant_id" | "custom_report_id" | "name">): Promise<ReportDocument> {
  if (!schedule.custom_report_id) {
    throw new Error("Agendamento customizado sem definição vinculada");
  }

  const preview = await CustomReportBuilderService.previewStoredDefinition(schedule.custom_report_id, schedule.tenant_id);
  const rows = preview.rows as Array<Record<string, string | number | null>>;
  const sheets = [
    {
      name: preview.definition.name.slice(0, 31) || "Customizado",
      rows,
    },
  ];

  return {
    title: schedule.name,
    reportType: "custom",
    periodLabel: `Snapshot customizado • ${new Date().toLocaleDateString("pt-BR", { timeZone: REPORT_TIMEZONE })}`,
    sheets,
    summaryRows: [],
    previewRows: rows,
    metadata: {
      custom_report_id: schedule.custom_report_id,
      custom_report_name: preview.definition.name,
      definition: preview.definition.definition,
      sql: preview.sql,
      rowCount: preview.rowCount,
    },
  };
}

export async function buildScheduledReportDocument(schedule: ScheduledReportRow): Promise<ReportDocument> {
  switch (schedule.report_type) {
    case "sales":
      return buildSalesDocument(schedule);
    case "finance":
      return buildFinanceDocument(schedule);
    case "products":
      return buildProductDocument(schedule);
    case "customers":
      return buildCustomerDocument(schedule);
    case "custom":
      return buildCustomScheduledDocument(schedule);
    default:
      throw new Error("Tipo de relatório não suportado");
  }
}

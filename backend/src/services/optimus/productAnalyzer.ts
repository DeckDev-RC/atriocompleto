import { supabaseAdmin } from "../../config/supabase";

export type ProductTrend = "accelerating" | "stable" | "decelerating";
export type ProductStockStatus = "OK" | "WARNING" | "CRITICAL" | "OUT" | "EXCESS";
export type ProductSortField =
  | "name"
  | "sale_price"
  | "stock_level"
  | "margin_percent"
  | "last_sale_at"
  | "days_since_last_sale"
  | "units_sold_30d"
  | "revenue_90d"
  | "stock_coverage_days";

export interface OptimusFilters {
  tenantId?: string;
  productId?: string;
  category?: string;
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
  minMargin?: number;
  maxMargin?: number;
  lowStock?: boolean;
  outOfStock?: boolean;
  excessStock?: boolean;
  stockBelow?: number;
  stockAbove?: number;
  withoutSalesDays?: number;
  trend?: ProductTrend;
  nameSearch?: string;
  sku?: string;
  limit?: number;
  offset?: number;
  includeHealth?: boolean;
  includeSummary?: boolean;
  includeSimilar?: boolean;
  sortBy?: ProductSortField;
  sortOrder?: "asc" | "desc";
  exportMode?: boolean;
}

export interface ProductInsight {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  category: string | null;
  category_id: string | null;
  category_name: string | null;
  sale_price: number;
  cost_price: number;
  markup_value: number;
  margin_percent: number;
  stock_level: number;
  min_stock_level: number;
  max_stock_level: number | null;
  stock_value_cost: number;
  stock_value_sale: number;
  last_sale_at: string | null;
  days_since_last_sale: number | null;
  total_units_sold: number;
  total_revenue: number;
  units_sold_7d: number;
  units_sold_30d: number;
  units_sold_90d: number;
  revenue_30d: number;
  revenue_90d: number;
  sales_velocity_daily: number;
  stock_coverage_days: number | null;
  stock_status: ProductStockStatus;
  demand_trend: ProductTrend;
  search_score?: number | null;
}

export interface CategoryRollup {
  category_name: string;
  total_products: number;
  stock_value_cost: number;
  units_sold_30d: number;
}

export interface InventoryHealthSnapshot {
  total_products: number;
  out_of_stock: number;
  low_stock: number;
  excess_stock: number;
  stale_products: number;
  accelerating_products: number;
  decelerating_products: number;
  stock_value_cost: number;
  stock_value_sale: number;
  avg_margin_percent: number;
  min_price: number;
  avg_price: number;
  max_price: number;
  categories: CategoryRollup[];
}

export interface OptimusActionLink {
  label: string;
  action_slug: string;
  deep_link: string;
  filters?: Record<string, unknown>;
}

export interface ProductSuggestionContext {
  summary: InventoryHealthSnapshot;
  low_stock: ProductInsight[];
  stale: ProductInsight[];
  accelerating: ProductInsight[];
}

export interface ProductQueryResult {
  products: ProductInsight[];
  count: number;
  total: number;
  summary?: InventoryHealthSnapshot;
  similar_products?: Array<Pick<ProductInsight, "id" | "name" | "sku" | "category_name" | "search_score">>;
  recommendations: OptimusActionLink[];
  filters: Record<string, unknown>;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 2_000;
const SEARCH_THRESHOLD_NAME = 0.22;
const SEARCH_THRESHOLD_SKU = 0.3;

const SORT_SQL: Record<ProductSortField, string> = {
  name: "name",
  sale_price: "sale_price",
  stock_level: "stock_level",
  margin_percent: "margin_percent",
  last_sale_at: "COALESCE(last_sale_at, '1970-01-01'::timestamptz)",
  days_since_last_sale: "COALESCE(days_since_last_sale, 999999)",
  units_sold_30d: "units_sold_30d",
  revenue_90d: "revenue_90d",
  stock_coverage_days: "COALESCE(stock_coverage_days, 999999)",
};

function escapeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function escapeLike(value: string): string {
  return escapeLiteral(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clampLimit(limit?: number, exportMode = false): number {
  const max = exportMode ? EXPORT_LIMIT : MAX_LIMIT;
  const base = exportMode ? EXPORT_LIMIT : DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.round(limit || base), max));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function productPromptLink(prompt: string): string {
  return `/agente?prompt=${encodeURIComponent(prompt)}`;
}

async function runReadonlyQuery<T>(queryText: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", {
    query_text: queryText,
  });

  if (error) {
    throw new Error(`SQL error: ${error.message}`);
  }

  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function buildConditions(filters: OptimusFilters): string[] {
  if (!filters.tenantId) {
    throw new Error("Tenant ID obrigatorio para consultas de produtos");
  }

  const clauses: string[] = [`tenant_id = '${escapeLiteral(filters.tenantId)}'::uuid`];

  if (filters.productId) {
    clauses.push(`id = '${escapeLiteral(filters.productId)}'::uuid`);
  }

  if (filters.category) {
    clauses.push(`LOWER(COALESCE(category_name, category, '')) LIKE LOWER('%${escapeLike(filters.category)}%')`);
  }

  if (filters.categories && filters.categories.length > 0) {
    const values = filters.categories
      .filter(Boolean)
      .map((item) => `'${escapeLiteral(item)}'`)
      .join(", ");

    if (values) {
      clauses.push(`COALESCE(category_name, category, '') IN (${values})`);
    }
  }

  if (filters.sku) {
    clauses.push(`LOWER(COALESCE(sku, '')) = LOWER('${escapeLiteral(filters.sku)}')`);
  }

  if (filters.minPrice !== undefined) {
    clauses.push(`sale_price >= ${toNumber(filters.minPrice)}`);
  }

  if (filters.maxPrice !== undefined) {
    clauses.push(`sale_price <= ${toNumber(filters.maxPrice)}`);
  }

  if (filters.minMargin !== undefined) {
    clauses.push(`margin_percent >= ${toNumber(filters.minMargin)}`);
  }

  if (filters.maxMargin !== undefined) {
    clauses.push(`margin_percent <= ${toNumber(filters.maxMargin)}`);
  }

  if (filters.stockBelow !== undefined) {
    clauses.push(`stock_level < ${Math.max(0, Math.round(toNumber(filters.stockBelow)))}`);
  }

  if (filters.stockAbove !== undefined) {
    clauses.push(`stock_level > ${Math.max(0, Math.round(toNumber(filters.stockAbove)))}`);
  }

  if (filters.outOfStock) {
    clauses.push(`stock_status = 'OUT'`);
  }

  if (filters.lowStock) {
    clauses.push(`stock_status IN ('OUT', 'CRITICAL', 'WARNING')`);
  }

  if (filters.excessStock) {
    clauses.push(`stock_status = 'EXCESS'`);
  }

  if (filters.withoutSalesDays !== undefined) {
    const days = Math.max(1, Math.round(toNumber(filters.withoutSalesDays)));
    clauses.push(`(last_sale_at IS NULL OR days_since_last_sale >= ${days})`);
  }

  if (filters.trend) {
    clauses.push(`demand_trend = '${escapeLiteral(filters.trend)}'`);
  }

  return clauses;
}

function buildSearchClause(filters: OptimusFilters): { clause: string; scoreSql: string; hasSearch: boolean } {
  const term = filters.nameSearch?.trim();
  if (!term) {
    return {
      clause: "",
      scoreSql: "NULL::float AS search_score",
      hasSearch: false,
    };
  }

  const escapedTerm = escapeLiteral(term);
  const escapedLike = escapeLike(term);

  return {
    clause: `
      AND (
        LOWER(name) LIKE LOWER('%${escapedLike}%')
        OR LOWER(COALESCE(sku, '')) LIKE LOWER('%${escapedLike}%')
        OR similarity(name, '${escapedTerm}') > ${SEARCH_THRESHOLD_NAME}
        OR similarity(COALESCE(sku, ''), '${escapedTerm}') > ${SEARCH_THRESHOLD_SKU}
      )
    `,
    scoreSql: `GREATEST(similarity(name, '${escapedTerm}'), similarity(COALESCE(sku, ''), '${escapedTerm}')) AS search_score`,
    hasSearch: true,
  };
}

function buildOrderBy(filters: OptimusFilters, hasSearch: boolean): string {
  if (hasSearch) {
    return "COALESCE(search_score, 0) DESC, units_sold_30d DESC, stock_level ASC, name ASC";
  }

  const sortBy = filters.sortBy || (filters.lowStock || filters.outOfStock ? "stock_level" : "name");
  const sortOrder = filters.sortOrder || (sortBy === "name" ? "asc" : "desc");
  const sortSql = SORT_SQL[sortBy] || SORT_SQL.name;
  const normalizedOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";
  return `${sortSql} ${normalizedOrder}, name ASC`;
}

function mapProductRow(row: Record<string, unknown>): ProductInsight {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name || ""),
    sku: String(row.sku || ""),
    category: row.category ? String(row.category) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: row.category_name ? String(row.category_name) : null,
    sale_price: toNumber(row.sale_price),
    cost_price: toNumber(row.cost_price),
    markup_value: toNumber(row.markup_value),
    margin_percent: toNumber(row.margin_percent),
    stock_level: Math.round(toNumber(row.stock_level)),
    min_stock_level: Math.round(toNumber(row.min_stock_level)),
    max_stock_level: row.max_stock_level !== null && row.max_stock_level !== undefined ? Math.round(toNumber(row.max_stock_level)) : null,
    stock_value_cost: toNumber(row.stock_value_cost),
    stock_value_sale: toNumber(row.stock_value_sale),
    last_sale_at: row.last_sale_at ? String(row.last_sale_at) : null,
    days_since_last_sale: row.days_since_last_sale !== null && row.days_since_last_sale !== undefined ? Math.round(toNumber(row.days_since_last_sale)) : null,
    total_units_sold: Math.round(toNumber(row.total_units_sold)),
    total_revenue: toNumber(row.total_revenue),
    units_sold_7d: Math.round(toNumber(row.units_sold_7d)),
    units_sold_30d: Math.round(toNumber(row.units_sold_30d)),
    units_sold_90d: Math.round(toNumber(row.units_sold_90d)),
    revenue_30d: toNumber(row.revenue_30d),
    revenue_90d: toNumber(row.revenue_90d),
    sales_velocity_daily: toNumber(row.sales_velocity_daily),
    stock_coverage_days: row.stock_coverage_days !== null && row.stock_coverage_days !== undefined ? toNumber(row.stock_coverage_days) : null,
    stock_status: String(row.stock_status || "OK") as ProductStockStatus,
    demand_trend: String(row.demand_trend || "stable") as ProductTrend,
    search_score: row.search_score !== null && row.search_score !== undefined ? toNumber(row.search_score) : null,
  };
}

function toHealthSnapshot(
  row: Record<string, unknown> | undefined,
  categories: CategoryRollup[],
): InventoryHealthSnapshot {
  return {
    total_products: Math.round(toNumber(row?.total_products)),
    out_of_stock: Math.round(toNumber(row?.out_of_stock)),
    low_stock: Math.round(toNumber(row?.low_stock)),
    excess_stock: Math.round(toNumber(row?.excess_stock)),
    stale_products: Math.round(toNumber(row?.stale_products)),
    accelerating_products: Math.round(toNumber(row?.accelerating_products)),
    decelerating_products: Math.round(toNumber(row?.decelerating_products)),
    stock_value_cost: toNumber(row?.stock_value_cost),
    stock_value_sale: toNumber(row?.stock_value_sale),
    avg_margin_percent: toNumber(row?.avg_margin_percent),
    min_price: toNumber(row?.min_price),
    avg_price: toNumber(row?.avg_price),
    max_price: toNumber(row?.max_price),
    categories,
  };
}

function buildRecommendations(summary: InventoryHealthSnapshot): OptimusActionLink[] {
  const actions: OptimusActionLink[] = [];

  if (summary.out_of_stock > 0) {
    actions.push({
      label: "Ver produtos sem estoque",
      action_slug: "view_out_of_stock",
      deep_link: productPromptLink("Mostre os produtos sem estoque."),
      filters: { outOfStock: true },
    });
  }

  if (summary.low_stock > 0) {
    actions.push({
      label: "Priorizar reposicao",
      action_slug: "view_low_stock",
      deep_link: productPromptLink("Quais produtos estao acabando ou em estoque critico?"),
      filters: { lowStock: true },
    });
  }

  if (summary.excess_stock > 0) {
    actions.push({
      label: "Revisar excesso de estoque",
      action_slug: "view_excess_stock",
      deep_link: productPromptLink("Quais produtos estao com excesso de estoque e precisam de acao?"),
      filters: { excessStock: true },
    });
  }

  if (summary.stale_products > 0) {
    actions.push({
      label: "Analisar produtos sem venda",
      action_slug: "view_stale_products",
      deep_link: productPromptLink("Quais produtos estao sem venda ha 90 dias ou mais?"),
      filters: { withoutSalesDays: 90 },
    });
  }

  if (summary.accelerating_products > 0) {
    actions.push({
      label: "Ver produtos em crescimento",
      action_slug: "view_accelerating_products",
      deep_link: productPromptLink("Quais produtos estao acelerando nas vendas?"),
      filters: { trend: "accelerating" },
    });
  }

  actions.push({
    label: "Abrir simulacao de estoque",
    action_slug: "open_inventory_simulation",
    deep_link: "/simulacoes/inventory",
  });

  return actions.slice(0, 4);
}

export class ProductAnalyzer {
  static async queryProducts(filters: OptimusFilters): Promise<ProductQueryResult> {
    if (!filters.tenantId) {
      throw new Error("Tenant ID obrigatorio para consultar produtos");
    }

    const whereClauses = buildConditions(filters);
    const search = buildSearchClause(filters);
    const limit = clampLimit(filters.limit, filters.exportMode);
    const offset = Math.max(0, Math.round(filters.offset || 0));
    const whereSql = whereClauses.join(" AND ");
    const orderBy = buildOrderBy(filters, search.hasSearch);

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.product_insights
      WHERE ${whereSql}
      ${search.clause}
    `;

    const dataSql = `
      WITH ranked AS (
        SELECT
          *,
          ${search.scoreSql}
        FROM public.product_insights
        WHERE ${whereSql}
        ${search.clause}
      )
      SELECT *
      FROM ranked
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [countRows, dataRows, summary, similar] = await Promise.all([
      runReadonlyQuery<{ total: number }>(countSql),
      runReadonlyQuery<Record<string, unknown>>(dataSql),
      filters.includeHealth || filters.includeSummary !== false
        ? this.getInventoryHealth(filters.tenantId, filters)
        : Promise.resolve(undefined),
      search.hasSearch && filters.includeSimilar !== false
        ? this.getSimilarProducts(filters.tenantId, filters.nameSearch!)
        : Promise.resolve(undefined),
    ]);

    const products = dataRows.map(mapProductRow);
    const total = Math.round(toNumber(countRows[0]?.total));
    const similarProducts = similar
      ?.filter((item) => !products.some((product) => product.id === item.id))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        category_name: item.category_name,
        search_score: item.search_score,
      }));

    return {
      products,
      count: products.length,
      total,
      summary,
      similar_products: similarProducts && similarProducts.length > 0 ? similarProducts : undefined,
      recommendations: summary ? buildRecommendations(summary) : [],
      filters: {
        category: filters.category,
        nameSearch: filters.nameSearch,
        sku: filters.sku,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minMargin: filters.minMargin,
        maxMargin: filters.maxMargin,
        lowStock: filters.lowStock,
        outOfStock: filters.outOfStock,
        excessStock: filters.excessStock,
        withoutSalesDays: filters.withoutSalesDays,
        trend: filters.trend,
        limit,
        offset,
      },
    };
  }

  static async getInventoryHealth(tenantId: string, baseFilters: Partial<OptimusFilters> = {}): Promise<InventoryHealthSnapshot> {
    const filters: OptimusFilters = {
      ...baseFilters,
      tenantId,
      limit: undefined,
      offset: undefined,
      includeHealth: undefined,
      includeSummary: undefined,
      includeSimilar: false,
      exportMode: false,
    };

    const whereSql = buildConditions(filters).join(" AND ");

    const summarySql = `
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE stock_status = 'OUT')::int AS out_of_stock,
        COUNT(*) FILTER (WHERE stock_status IN ('OUT', 'CRITICAL', 'WARNING'))::int AS low_stock,
        COUNT(*) FILTER (WHERE stock_status = 'EXCESS')::int AS excess_stock,
        COUNT(*) FILTER (WHERE last_sale_at IS NULL OR days_since_last_sale >= 90)::int AS stale_products,
        COUNT(*) FILTER (WHERE demand_trend = 'accelerating')::int AS accelerating_products,
        COUNT(*) FILTER (WHERE demand_trend = 'decelerating')::int AS decelerating_products,
        COALESCE(SUM(stock_value_cost), 0)::float AS stock_value_cost,
        COALESCE(SUM(stock_value_sale), 0)::float AS stock_value_sale,
        COALESCE(AVG(margin_percent), 0)::float AS avg_margin_percent,
        COALESCE(MIN(sale_price), 0)::float AS min_price,
        COALESCE(AVG(sale_price), 0)::float AS avg_price,
        COALESCE(MAX(sale_price), 0)::float AS max_price
      FROM public.product_insights
      WHERE ${whereSql}
    `;

    const categoriesSql = `
      SELECT
        COALESCE(category_name, 'Sem categoria') AS category_name,
        COUNT(*)::int AS total_products,
        COALESCE(SUM(stock_value_cost), 0)::float AS stock_value_cost,
        COALESCE(SUM(units_sold_30d), 0)::int AS units_sold_30d
      FROM public.product_insights
      WHERE ${whereSql}
      GROUP BY COALESCE(category_name, 'Sem categoria')
      ORDER BY total_products DESC, stock_value_cost DESC
      LIMIT 8
    `;

    const [summaryRows, categoryRows] = await Promise.all([
      runReadonlyQuery<Record<string, unknown>>(summarySql),
      runReadonlyQuery<Record<string, unknown>>(categoriesSql),
    ]);

    const categories = categoryRows.map((row) => ({
      category_name: String(row.category_name || "Sem categoria"),
      total_products: Math.round(toNumber(row.total_products)),
      stock_value_cost: toNumber(row.stock_value_cost),
      units_sold_30d: Math.round(toNumber(row.units_sold_30d)),
    }));

    return toHealthSnapshot(summaryRows[0], categories);
  }

  static async getSuggestionContext(tenantId: string): Promise<ProductSuggestionContext> {
    const [summary, lowStock, stale, accelerating] = await Promise.all([
      this.getInventoryHealth(tenantId),
      this.queryProducts({ tenantId, lowStock: true, sortBy: "stock_level", sortOrder: "asc", limit: 5, includeSummary: false }),
      this.queryProducts({ tenantId, withoutSalesDays: 90, sortBy: "days_since_last_sale", sortOrder: "desc", limit: 5, includeSummary: false }),
      this.queryProducts({ tenantId, trend: "accelerating", sortBy: "units_sold_30d", sortOrder: "desc", limit: 5, includeSummary: false }),
    ]);

    return {
      summary,
      low_stock: lowStock.products,
      stale: stale.products,
      accelerating: accelerating.products,
    };
  }

  static async getSimilarProducts(
    tenantId: string,
    term: string,
  ): Promise<ProductInsight[]> {
    const escaped = escapeLiteral(term.trim());
    const sql = `
      SELECT
        *,
        GREATEST(similarity(name, '${escaped}'), similarity(COALESCE(sku, ''), '${escaped}')) AS search_score
      FROM public.product_insights
      WHERE tenant_id = '${escapeLiteral(tenantId)}'::uuid
        AND (
          similarity(name, '${escaped}') > ${SEARCH_THRESHOLD_NAME}
          OR similarity(COALESCE(sku, ''), '${escaped}') > ${SEARCH_THRESHOLD_SKU}
        )
      ORDER BY search_score DESC, units_sold_30d DESC, name ASC
      LIMIT 10
    `;

    const rows = await runReadonlyQuery<Record<string, unknown>>(sql);
    return rows.map(mapProductRow);
  }

  static async exportProductsCsv(filters: OptimusFilters): Promise<{ filename: string; csv: string; count: number }> {
    const result = await this.queryProducts({
      ...filters,
      includeSummary: false,
      includeSimilar: false,
      exportMode: true,
      limit: clampLimit(filters.limit, true),
      offset: 0,
    });

    const header = [
      "Nome",
      "SKU",
      "Categoria",
      "Preco Venda",
      "Preco Custo",
      "Margem %",
      "Estoque",
      "Minimo",
      "Maximo",
      "Status Estoque",
      "Ultima Venda",
      "Dias sem Venda",
      "Vendidos 30d",
      "Receita 90d",
      "Cobertura (dias)",
      "Tendencia",
    ];

    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = result.products.map((product) => [
      product.name,
      product.sku,
      product.category_name || product.category || "Sem categoria",
      product.sale_price.toFixed(2),
      product.cost_price.toFixed(2),
      product.margin_percent.toFixed(2),
      product.stock_level,
      product.min_stock_level,
      product.max_stock_level ?? "",
      product.stock_status,
      product.last_sale_at || "",
      product.days_since_last_sale ?? "",
      product.units_sold_30d,
      product.revenue_90d.toFixed(2),
      product.stock_coverage_days ?? "",
      product.demand_trend,
    ].map(escapeCsv).join(";"));

    const csv = `\uFEFF${header.join(";")}\n${lines.join("\n")}`;
    const date = new Date().toISOString().slice(0, 10);

    return {
      filename: `optimus_produtos_${date}.csv`,
      csv,
      count: result.products.length,
    };
  }
}

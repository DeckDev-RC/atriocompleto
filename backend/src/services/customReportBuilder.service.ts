import { supabaseAdmin } from "../config/supabase";

export type DatasetKey = "sales" | "products" | "customers";
export type Operator = "eq" | "in" | "between" | "gte" | "lte";

export interface CustomReportDefinition {
  dataset: DatasetKey;
  dimensions: string[];
  metrics: string[];
  filters?: Array<{
    field: string;
    operator: Operator;
    value: string | number | Array<string | number>;
  }>;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
}

export interface StoredCustomReportDefinition {
  id: string;
  tenant_id: string;
  created_by: string;
  updated_by: string | null;
  name: string;
  description: string | null;
  definition: CustomReportDefinition;
  created_at: string;
  updated_at: string;
}

interface DatasetOption {
  key: string;
  label: string;
}

interface DatasetConfig {
  label: string;
  description: string;
  dimensions: Record<string, DatasetOption & { sql: string }>;
  metrics: Record<string, DatasetOption & { sql: string }>;
  filters: Record<string, DatasetOption & { sql: string; type: "text" | "number" | "date" }>;
  buildBaseSql: (tenantId: string, whereClauses: string[]) => string;
}

const SALES_DIMENSIONS = {
  marketplace: { key: "marketplace", label: "Marketplace", sql: "COALESCE(marketplace, 'Sem marketplace')" },
  status: { key: "status", label: "Status", sql: "COALESCE(status, 'unknown')" },
  month: { key: "month", label: "Mês", sql: "TO_CHAR(local_order_date, 'YYYY-MM')" },
  day_of_week: { key: "day_of_week", label: "Dia da semana", sql: "TO_CHAR(local_order_date, 'Dy')" },
} as const;

const SALES_METRICS = {
  orders_count: { key: "orders_count", label: "Pedidos", sql: "COUNT(*)::int" },
  total_revenue: { key: "total_revenue", label: "Receita total", sql: "COALESCE(SUM(total_amount), 0)::float" },
  avg_ticket: { key: "avg_ticket", label: "Ticket médio", sql: "COALESCE(AVG(total_amount), 0)::float" },
  paid_revenue: {
    key: "paid_revenue",
    label: "Receita paga",
    sql: "COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0)::float",
  },
  cancelled_revenue: {
    key: "cancelled_revenue",
    label: "Receita cancelada",
    sql: "COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END), 0)::float",
  },
} as const;

const PRODUCTS_DIMENSIONS = {
  category: { key: "category", label: "Categoria", sql: "COALESCE(category_name, category, 'Sem categoria')" },
  stock_status: { key: "stock_status", label: "Status de estoque", sql: "stock_status" },
  demand_trend: { key: "demand_trend", label: "Tendência de demanda", sql: "demand_trend" },
} as const;

const PRODUCTS_METRICS = {
  products_count: { key: "products_count", label: "Produtos", sql: "COUNT(*)::int" },
  stock_value_cost: { key: "stock_value_cost", label: "Valor em custo", sql: "COALESCE(SUM(stock_value_cost), 0)::float" },
  stock_value_sale: { key: "stock_value_sale", label: "Valor em venda", sql: "COALESCE(SUM(stock_value_sale), 0)::float" },
  units_sold_30d: { key: "units_sold_30d", label: "Unidades vendidas 30d", sql: "COALESCE(SUM(units_sold_30d), 0)::int" },
  revenue_90d: { key: "revenue_90d", label: "Receita 90d", sql: "COALESCE(SUM(revenue_90d), 0)::float" },
  avg_margin_percent: { key: "avg_margin_percent", label: "Margem média %", sql: "COALESCE(AVG(margin_percent), 0)::float" },
} as const;

const CUSTOMERS_DIMENSIONS = {
  marketplace: { key: "marketplace", label: "Marketplace", sql: "marketplace" },
  lifecycle_stage: { key: "lifecycle_stage", label: "Ciclo de vida", sql: "lifecycle_stage" },
} as const;

const CUSTOMERS_METRICS = {
  buyers_count: { key: "buyers_count", label: "Clientes", sql: "COUNT(*)::int" },
  total_revenue: { key: "total_revenue", label: "Receita", sql: "COALESCE(SUM(total_spent), 0)::float" },
  avg_total_spent: { key: "avg_total_spent", label: "Gasto médio", sql: "COALESCE(AVG(total_spent), 0)::float" },
  avg_ticket: { key: "avg_ticket", label: "Ticket médio", sql: "COALESCE(AVG(avg_ticket), 0)::float" },
} as const;

const DATASETS: Record<DatasetKey, DatasetConfig> = {
  sales: {
    label: "Vendas",
    description: "Pedidos e receita derivados da tabela de pedidos.",
    dimensions: SALES_DIMENSIONS,
    metrics: SALES_METRICS,
    filters: {
      marketplace: { key: "marketplace", label: "Marketplace", sql: "marketplace", type: "text" },
      status: { key: "status", label: "Status", sql: "status", type: "text" },
      order_date: { key: "order_date", label: "Data do pedido", sql: "local_order_date::date", type: "date" },
    },
    buildBaseSql: (tenantId, whereClauses) => `
      WITH base_orders AS (
        SELECT
          marketplace,
          LOWER(status) AS status,
          order_date AT TIME ZONE 'America/Sao_Paulo' AS local_order_date,
          total_amount
        FROM public.orders
        WHERE tenant_id = '${tenantId}'::uuid
          ${whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""}
      )
      SELECT * FROM base_orders
    `,
  },
  products: {
    label: "Produtos",
    description: "Catálogo, margem e saúde de estoque a partir de product_insights.",
    dimensions: PRODUCTS_DIMENSIONS,
    metrics: PRODUCTS_METRICS,
    filters: {
      category: { key: "category", label: "Categoria", sql: "COALESCE(category_name, category, '')", type: "text" },
      stock_status: { key: "stock_status", label: "Status de estoque", sql: "stock_status", type: "text" },
      demand_trend: { key: "demand_trend", label: "Tendência", sql: "demand_trend", type: "text" },
    },
    buildBaseSql: (tenantId, whereClauses) => `
      SELECT *
      FROM public.product_insights
      WHERE tenant_id = '${tenantId}'::uuid
      ${whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""}
    `,
  },
  customers: {
    label: "Clientes",
    description: "Clientes derivados dos pedidos por marketplace e estágio de ciclo de vida.",
    dimensions: CUSTOMERS_DIMENSIONS,
    metrics: CUSTOMERS_METRICS,
    filters: {
      marketplace: { key: "marketplace", label: "Marketplace", sql: "marketplace", type: "text" },
      lifecycle_stage: { key: "lifecycle_stage", label: "Ciclo de vida", sql: "lifecycle_stage", type: "text" },
      order_date: { key: "order_date", label: "Data do pedido", sql: "last_order::date", type: "date" },
    },
    buildBaseSql: (tenantId, whereClauses) => `
      WITH recent_orders AS (
        SELECT o.tenant_id, o.external_order_id AS order_id, o.marketplace, o.order_date, o.total_amount, LOWER(o.status) AS status
        FROM public.orders o
        WHERE o.tenant_id = '${tenantId}'::uuid
      ),
      customer_orders AS (
        SELECT
          r.order_id,
          r.marketplace,
          r.order_date,
          r.total_amount,
          r.status,
          COALESCE(
            bg.raw_json->>'nome',
            ml.raw_json->'buyer'->>'nickname',
            sh.raw_json->>'buyer_username'
          ) AS customer_name,
          COALESCE(
            NULLIF(bg.raw_json->>'nome', ''),
            NULLIF(ml.raw_json->'buyer'->>'id', ''),
            NULLIF(sh.raw_json->>'buyer_username', '')
          ) AS customer_id
        FROM recent_orders r
        LEFT JOIN public.bagy_raw_orders bg ON r.order_id = bg.id AND r.marketplace = 'bagy' AND bg.tenant_id = '${tenantId}'::uuid
        LEFT JOIN public.ml_raw_orders ml ON r.order_id = ml.id AND r.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        LEFT JOIN public.shopee_raw_orders sh ON r.order_id = sh.id AND r.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
      ),
      customer_stats AS (
        SELECT
          customer_id,
          MAX(customer_name) AS customer_name,
          MAX(marketplace) AS marketplace,
          COUNT(order_id)::int AS total_orders,
          COALESCE(SUM(total_amount), 0)::float AS total_spent,
          COALESCE(AVG(total_amount), 0)::float AS avg_ticket,
          MAX(order_date) AS last_order,
          CASE
            WHEN COUNT(order_id) = 1 THEN 'Novo'
            WHEN COUNT(order_id) <= 3 THEN 'Em Desenvolvimento'
            WHEN COUNT(order_id) <= 10 THEN 'Fiel'
            ELSE 'VIP'
          END AS lifecycle_stage
        FROM customer_orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      )
      SELECT *
      FROM customer_stats
      WHERE 1=1
      ${whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""}
    `,
  },
};

function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/[^a-f0-9-]/gi, "");
}

function escapeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function ensureDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Data inválida: ${value}`);
  }
  return value;
}

function toNumber(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Valor numérico inválido");
  }
  return parsed;
}

function buildFilterClause(dataset: DatasetConfig, filter: NonNullable<CustomReportDefinition["filters"]>[number]): string {
  const field = dataset.filters[filter.field];
  if (!field) {
    throw new Error(`Filtro não suportado: ${filter.field}`);
  }

  if (filter.operator === "eq") {
    if (field.type === "number") return `${field.sql} = ${toNumber(filter.value as string | number)}`;
    if (field.type === "date") return `${field.sql} = '${ensureDate(String(filter.value))}'::date`;
    return `LOWER(${field.sql}) = LOWER('${escapeLiteral(String(filter.value))}')`;
  }

  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw new Error(`Filtro IN inválido para ${filter.field}`);
    }
    const values = filter.value.map((item) => `'${escapeLiteral(String(item))}'`).join(", ");
    return `${field.sql} IN (${values})`;
  }

  if (filter.operator === "between") {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) {
      throw new Error(`Filtro BETWEEN inválido para ${filter.field}`);
    }
    if (field.type === "date") {
      return `${field.sql} BETWEEN '${ensureDate(String(filter.value[0]))}'::date AND '${ensureDate(String(filter.value[1]))}'::date`;
    }
    return `${field.sql} BETWEEN ${toNumber(filter.value[0])} AND ${toNumber(filter.value[1])}`;
  }

  if (filter.operator === "gte") {
    return field.type === "date"
      ? `${field.sql} >= '${ensureDate(String(filter.value))}'::date`
      : `${field.sql} >= ${toNumber(filter.value as string | number)}`;
  }

  if (filter.operator === "lte") {
    return field.type === "date"
      ? `${field.sql} <= '${ensureDate(String(filter.value))}'::date`
      : `${field.sql} <= ${toNumber(filter.value as string | number)}`;
  }

  throw new Error(`Operador não suportado: ${filter.operator}`);
}

async function runReadonlyQuery<T>(sql: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", {
    query_text: sql.trim(),
  });

  if (error) {
    throw new Error(`Erro SQL: ${error.message}`);
  }

  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

export function buildDefinitionSql(definition: CustomReportDefinition, tenantId: string) {
  const dataset = DATASETS[definition.dataset];
  if (!dataset) {
    throw new Error("Dataset inválido");
  }
  if (definition.dimensions.length === 0) {
    throw new Error("Selecione ao menos uma dimensão");
  }
  if (definition.metrics.length === 0) {
    throw new Error("Selecione ao menos uma métrica");
  }

  const dimensions = definition.dimensions.map((key) => {
    const dimension = dataset.dimensions[key];
    if (!dimension) throw new Error(`Dimensão não suportada: ${key}`);
    return dimension;
  });

  const metrics = definition.metrics.map((key) => {
    const metric = dataset.metrics[key];
    if (!metric) throw new Error(`Métrica não suportada: ${key}`);
    return metric;
  });

  const whereClauses = (definition.filters || []).map((filter) => buildFilterClause(dataset, filter));
  const baseSql = dataset.buildBaseSql(sanitizeTenantId(tenantId), whereClauses);

  const selectSql = [
    ...dimensions.map((dimension) => `${dimension.sql} AS ${dimension.key}`),
    ...metrics.map((metric) => `${metric.sql} AS ${metric.key}`),
  ].join(",\n        ");

  const groupBySql = dimensions.map((dimension) => dimension.sql).join(", ");
  const sortField = definition.sort?.field || metrics[0].key;
  const sortDirection = definition.sort?.direction === "asc" ? "ASC" : "DESC";
  const limit = Math.max(1, Math.min(Math.round(definition.limit || 50), 200));

  return `
    WITH dataset_rows AS (
      ${baseSql}
    )
    SELECT
      ${selectSql}
    FROM dataset_rows
    GROUP BY ${groupBySql}
    ORDER BY ${sortField} ${sortDirection}
    LIMIT ${limit}
  `;
}

export class CustomReportBuilderService {
  static getMetadata() {
    return {
      datasets: Object.entries(DATASETS).map(([key, config]) => ({
        key,
        label: config.label,
        description: config.description,
        dimensions: Object.values(config.dimensions),
        metrics: Object.values(config.metrics),
        filters: Object.values(config.filters).map((filter) => ({
          key: filter.key,
          label: filter.label,
          type: filter.type,
        })),
      })),
    };
  }

  static async preview(definition: CustomReportDefinition, tenantId: string) {
    const sql = buildDefinitionSql(definition, tenantId);
    const rows = await runReadonlyQuery<Record<string, string | number | null>>(sql);
    return {
      sql,
      rowCount: rows.length,
      rows,
    };
  }

  static async listDefinitions(tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from("custom_report_definitions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar definições customizadas: ${error.message}`);
    }

    return ((data || []) as unknown as Array<Omit<StoredCustomReportDefinition, "definition"> & { definition: CustomReportDefinition }>).map((item) => ({
      ...item,
      definition: item.definition,
    }));
  }

  static async getDefinition(definitionId: string, tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from("custom_report_definitions")
      .select("*")
      .eq("id", definitionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar definição customizada: ${error.message}`);
    }

    return (data as unknown as StoredCustomReportDefinition | null) || null;
  }

  static async createDefinition(params: {
    tenantId: string;
    userId: string;
    name: string;
    description?: string | null;
    definition: CustomReportDefinition;
  }) {
    buildDefinitionSql(params.definition, params.tenantId);

    const { data, error } = await supabaseAdmin
      .from("custom_report_definitions")
      .insert({
        tenant_id: params.tenantId,
        created_by: params.userId,
        updated_by: params.userId,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        definition: params.definition,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao salvar definição customizada: ${error?.message || "desconhecido"}`);
    }

    return data as unknown as StoredCustomReportDefinition;
  }

  static async updateDefinition(params: {
    definitionId: string;
    tenantId: string;
    userId: string;
    name: string;
    description?: string | null;
    definition: CustomReportDefinition;
  }) {
    buildDefinitionSql(params.definition, params.tenantId);

    const { data, error } = await supabaseAdmin
      .from("custom_report_definitions")
      .update({
        name: params.name.trim(),
        description: params.description?.trim() || null,
        definition: params.definition,
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.definitionId)
      .eq("tenant_id", params.tenantId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao atualizar definição customizada: ${error?.message || "desconhecido"}`);
    }

    return data as unknown as StoredCustomReportDefinition;
  }

  static async deleteDefinition(definitionId: string, tenantId: string) {
    const { error } = await supabaseAdmin
      .from("custom_report_definitions")
      .delete()
      .eq("id", definitionId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new Error(`Erro ao excluir definição customizada: ${error.message}`);
    }
  }

  static async previewStoredDefinition(definitionId: string, tenantId: string) {
    const definition = await this.getDefinition(definitionId, tenantId);
    if (!definition) {
      throw new Error("Definição customizada não encontrada");
    }

    const preview = await this.preview(definition.definition, tenantId);
    return {
      definition,
      ...preview,
    };
  }
}

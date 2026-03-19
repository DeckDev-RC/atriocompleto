-- Report templates catalog for reusable report starters.
-- Separates reusable templates from scheduled report instances.

CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL
    CHECK (scope IN ('system', 'tenant', 'user')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  icon TEXT,
  preview_image_url TEXT,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_schedule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  featured BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0
    CHECK (use_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_templates_scope_tenant_check CHECK (
    (scope = 'system' AND tenant_id IS NULL)
    OR (scope IN ('tenant', 'user') AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT report_templates_user_creator_check CHECK (
    scope <> 'user' OR created_by IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_report_templates_scope
  ON public.report_templates(scope, featured DESC, use_count DESC);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant
  ON public.report_templates(tenant_id, category, updated_at DESC);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_templates_select_visible" ON public.report_templates;
CREATE POLICY "report_templates_select_visible" ON public.report_templates
  FOR SELECT
  TO authenticated
  USING (
    scope = 'system'
    OR tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "report_templates_insert_own_tenant" ON public.report_templates;
CREATE POLICY "report_templates_insert_own_tenant" ON public.report_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    scope IN ('tenant', 'user')
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "report_templates_update_own_tenant" ON public.report_templates;
CREATE POLICY "report_templates_update_own_tenant" ON public.report_templates
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "report_templates_delete_own_tenant" ON public.report_templates;
CREATE POLICY "report_templates_delete_own_tenant" ON public.report_templates
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

INSERT INTO public.report_templates (
  key,
  scope,
  tenant_id,
  created_by,
  updated_by,
  name,
  description,
  category,
  tags,
  icon,
  preview_image_url,
  definition_json,
  default_schedule_json,
  featured,
  use_count
)
VALUES
  (
    'sales-marketplace-overview',
    'system',
    NULL,
    NULL,
    NULL,
    'Receita por Marketplace',
    'Faturamento, pedidos e ticket médio por canal com foco em vendas pagas.',
    'Vendas',
    '["Vendas", "Marketplace", "Receita"]'::jsonb,
    'TrendingUp',
    NULL,
    $${
      "dataset": "sales",
      "dimensions": ["marketplace"],
      "metrics": ["total_revenue", "orders_count", "avg_ticket"],
      "filters": [
        { "field": "status", "operator": "eq", "value": "paid" }
      ],
      "sort": { "field": "total_revenue", "direction": "desc" },
      "limit": 10
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "weekly", "time": "08:00", "day_of_week": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  ),
  (
    'sales-status-breakdown',
    'system',
    NULL,
    NULL,
    NULL,
    'Distribuição por Status',
    'Pedidos e receita agrupados por status para identificar aprovação e cancelamentos.',
    'Vendas',
    '["Vendas", "Status", "Operação"]'::jsonb,
    'BadgeAlert',
    NULL,
    $${
      "dataset": "sales",
      "dimensions": ["status"],
      "metrics": ["orders_count", "total_revenue", "cancelled_revenue"],
      "sort": { "field": "orders_count", "direction": "desc" },
      "limit": 10
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "daily", "time": "07:30", "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    false,
    0
  ),
  (
    'sales-weekday-performance',
    'system',
    NULL,
    NULL,
    NULL,
    'Performance por Dia da Semana',
    'Evolução de vendas por dia da semana para descobrir padrões de pico.',
    'Vendas',
    '["Vendas", "Semana", "Padrões"]'::jsonb,
    'CalendarDays',
    NULL,
    $${
      "dataset": "sales",
      "dimensions": ["day_of_week"],
      "metrics": ["total_revenue", "orders_count", "avg_ticket"],
      "filters": [
        { "field": "status", "operator": "eq", "value": "paid" }
      ],
      "sort": { "field": "day_of_week", "direction": "asc" },
      "limit": 7
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "weekly", "time": "08:15", "day_of_week": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  ),
  (
    'sales-monthly-trend',
    'system',
    NULL,
    NULL,
    NULL,
    'Tendência Mensal de Receita',
    'Receita e pedidos mês a mês para acompanhar evolução histórica.',
    'Vendas',
    '["Vendas", "Mensal", "Histórico"]'::jsonb,
    'LineChart',
    NULL,
    $${
      "dataset": "sales",
      "dimensions": ["month"],
      "metrics": ["total_revenue", "orders_count", "avg_ticket"],
      "filters": [
        { "field": "status", "operator": "eq", "value": "paid" }
      ],
      "sort": { "field": "month", "direction": "asc" },
      "limit": 24
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "monthly", "time": "08:00", "day_of_month": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  ),
  (
    'products-stock-by-category',
    'system',
    NULL,
    NULL,
    NULL,
    'Saúde de Estoque por Categoria',
    'Quantidade de produtos, valor em estoque e giro recente por categoria.',
    'Produtos',
    '["Produtos", "Estoque", "Categoria"]'::jsonb,
    'PackageSearch',
    NULL,
    $${
      "dataset": "products",
      "dimensions": ["category"],
      "metrics": ["products_count", "stock_value_cost", "units_sold_30d"],
      "sort": { "field": "products_count", "direction": "desc" },
      "limit": 20
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "weekly", "time": "08:00", "day_of_week": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  ),
  (
    'products-stock-status-overview',
    'system',
    NULL,
    NULL,
    NULL,
    'Status de Estoque',
    'Concentração de produtos por status de estoque com valor em custo e venda.',
    'Produtos',
    '["Produtos", "Estoque", "Risco"]'::jsonb,
    'Boxes',
    NULL,
    $${
      "dataset": "products",
      "dimensions": ["stock_status"],
      "metrics": ["products_count", "stock_value_cost", "stock_value_sale"],
      "sort": { "field": "products_count", "direction": "desc" },
      "limit": 10
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "daily", "time": "07:45", "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    false,
    0
  ),
  (
    'products-margin-by-category',
    'system',
    NULL,
    NULL,
    NULL,
    'Margem por Categoria',
    'Margem média, receita recente e valor de estoque agrupados por categoria.',
    'Produtos',
    '["Produtos", "Margem", "Categoria"]'::jsonb,
    'PercentCircle',
    NULL,
    $${
      "dataset": "products",
      "dimensions": ["category"],
      "metrics": ["avg_margin_percent", "revenue_90d", "stock_value_sale"],
      "sort": { "field": "revenue_90d", "direction": "desc" },
      "limit": 20
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "monthly", "time": "08:10", "day_of_month": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    false,
    0
  ),
  (
    'customers-base-by-marketplace',
    'system',
    NULL,
    NULL,
    NULL,
    'Base de Clientes por Canal',
    'Clientes distintos, receita e ticket médio por marketplace.',
    'Clientes',
    '["Clientes", "Marketplace", "Base"]'::jsonb,
    'Users',
    NULL,
    $${
      "dataset": "customers",
      "dimensions": ["marketplace"],
      "metrics": ["buyers_count", "total_revenue", "avg_ticket"],
      "sort": { "field": "total_revenue", "direction": "desc" },
      "limit": 10
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "weekly", "time": "08:30", "day_of_week": 1, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  ),
  (
    'customers-lifecycle-overview',
    'system',
    NULL,
    NULL,
    NULL,
    'Ciclo de Vida de Clientes',
    'Distribuição da base por estágio de relacionamento e valor acumulado.',
    'Clientes',
    '["Clientes", "Lifecycle", "Relacionamento"]'::jsonb,
    'HeartHandshake',
    NULL,
    $${
      "dataset": "customers",
      "dimensions": ["lifecycle_stage"],
      "metrics": ["buyers_count", "total_revenue", "avg_total_spent"],
      "sort": { "field": "total_revenue", "direction": "desc" },
      "limit": 10
    }$$::jsonb,
    $${
      "format": "xlsx",
      "schedule": { "frequency": "weekly", "time": "08:45", "day_of_week": 2, "timezone": "America/Sao_Paulo" }
    }$$::jsonb,
    true,
    0
  )
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  icon = EXCLUDED.icon,
  preview_image_url = EXCLUDED.preview_image_url,
  definition_json = EXCLUDED.definition_json,
  default_schedule_json = EXCLUDED.default_schedule_json,
  featured = EXCLUDED.featured,
  updated_at = NOW();

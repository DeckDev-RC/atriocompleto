-- Expand Optimus catalog to be tenant-aware and sales-aware.
-- This migration is intentionally idempotent because the repository also
-- keeps SQL snapshots in /supabase for manual execution.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- ── Categories (normalized catalog metadata) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_name
  ON public.categories(tenant_id, name);

-- ── Products / Inventory hardening ──────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_stock_level INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sku_key;

UPDATE public.inventory i
SET tenant_id = p.tenant_id
FROM public.products p
WHERE i.product_id = p.id
  AND i.tenant_id IS NULL;

INSERT INTO public.categories (tenant_id, name, slug)
SELECT DISTINCT
  p.tenant_id,
  BTRIM(p.category) AS name,
  LOWER(REGEXP_REPLACE(BTRIM(p.category), '[^a-zA-Z0-9]+', '-', 'g')) AS slug
FROM public.products p
WHERE p.tenant_id IS NOT NULL
  AND p.category IS NOT NULL
  AND BTRIM(p.category) <> ''
ON CONFLICT (tenant_id, name)
DO UPDATE SET slug = EXCLUDED.slug;

UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category_id IS NULL
  AND p.tenant_id = c.tenant_id
  AND p.category IS NOT NULL
  AND BTRIM(p.category) = c.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku
  ON public.products(tenant_id, sku);

CREATE INDEX IF NOT EXISTS idx_products_tenant_category
  ON public.products(tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_products_tenant_category_id
  ON public.products(tenant_id, category_id);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON public.products USING gin (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant_product
  ON public.inventory(tenant_id, product_id);

-- ── Tenant policies ─────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_tenant_isolation" ON public.products;
CREATE POLICY "products_tenant_isolation" ON public.products
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  );

DROP POLICY IF EXISTS "inventory_tenant_isolation" ON public.inventory;
CREATE POLICY "inventory_tenant_isolation" ON public.inventory
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  );

DROP POLICY IF EXISTS "categories_tenant_isolation" ON public.categories;
CREATE POLICY "categories_tenant_isolation" ON public.categories
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master')
  );

-- ── Product sales bridge ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.product_insights;
DROP VIEW IF EXISTS public.product_sales_facts;

CREATE VIEW public.product_sales_facts AS
WITH recent_orders AS (
  SELECT o.tenant_id, o.external_order_id, o.marketplace, o.order_date
  FROM public.orders o
  WHERE LOWER(o.status) = 'paid'
),
ml_items AS (
  SELECT
    r.tenant_id,
    'ml'::TEXT AS marketplace,
    r.external_order_id AS order_id,
    r.order_date,
    NULLIF(BTRIM(item->'item'->>'seller_sku'), '') AS sku,
    NULLIF(BTRIM(item->'item'->>'title'), '') AS product_name,
    COALESCE(NULLIF(item->>'quantity', '')::INTEGER, 1) AS quantity,
    COALESCE(NULLIF(item->>'unit_price', '')::NUMERIC, 0) AS unit_price
  FROM recent_orders r
  JOIN public.ml_raw_orders ml
    ON r.external_order_id = ml.id
   AND r.marketplace = 'ml'
   AND ml.tenant_id = r.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ml.raw_json->'order_items', '[]'::jsonb)) AS item
),
shopee_items AS (
  SELECT
    r.tenant_id,
    'shopee'::TEXT AS marketplace,
    r.external_order_id AS order_id,
    r.order_date,
    NULLIF(BTRIM(item->>'item_sku'), '') AS sku,
    NULLIF(BTRIM(item->>'item_name'), '') AS product_name,
    COALESCE(NULLIF(item->>'model_quantity_purchased', '')::INTEGER, 1) AS quantity,
    COALESCE(NULLIF(item->>'model_discounted_price', '')::NUMERIC, 0) AS unit_price
  FROM recent_orders r
  JOIN public.shopee_raw_orders sh
    ON r.external_order_id = sh.id
   AND r.marketplace = 'shopee'
   AND sh.tenant_id = r.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sh.raw_json->'item_list', '[]'::jsonb)) AS item
),
shein_items AS (
  SELECT
    r.tenant_id,
    'shein'::TEXT AS marketplace,
    r.external_order_id AS order_id,
    r.order_date,
    NULLIF(BTRIM(item->>'sellerSku'), '') AS sku,
    NULLIF(BTRIM(item->>'goodsTitle'), '') AS product_name,
    1 AS quantity,
    COALESCE(NULLIF(item->>'sellerCurrencyPrice', '')::NUMERIC, 0) AS unit_price
  FROM recent_orders r
  JOIN public.shein_raw_orders sn
    ON r.external_order_id = sn.id
   AND r.marketplace = 'shein'
   AND sn.tenant_id = r.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sn.raw_json->'orderGoodsInfoList', '[]'::jsonb)) AS item
)
SELECT
  tenant_id,
  marketplace,
  order_id,
  order_date,
  sku,
  product_name,
  quantity,
  unit_price,
  ROUND((quantity * unit_price)::NUMERIC, 2) AS line_total
FROM (
  SELECT * FROM ml_items
  UNION ALL
  SELECT * FROM shopee_items
  UNION ALL
  SELECT * FROM shein_items
) items
WHERE product_name IS NOT NULL;

CREATE VIEW public.product_insights AS
WITH sales_rollup AS (
  SELECT
    p.id AS product_id,
    MAX(psf.order_date) AS last_sale_at,
    COALESCE(SUM(psf.quantity), 0)::INTEGER AS total_units_sold,
    COALESCE(SUM(psf.line_total), 0)::NUMERIC(14, 2) AS total_revenue,
    COALESCE(SUM(psf.quantity) FILTER (WHERE psf.order_date >= NOW() - INTERVAL '7 days'), 0)::INTEGER AS units_sold_7d,
    COALESCE(SUM(psf.quantity) FILTER (WHERE psf.order_date >= NOW() - INTERVAL '30 days'), 0)::INTEGER AS units_sold_30d,
    COALESCE(SUM(psf.quantity) FILTER (WHERE psf.order_date >= NOW() - INTERVAL '90 days'), 0)::INTEGER AS units_sold_90d,
    COALESCE(SUM(psf.line_total) FILTER (WHERE psf.order_date >= NOW() - INTERVAL '30 days'), 0)::NUMERIC(14, 2) AS revenue_30d,
    COALESCE(SUM(psf.line_total) FILTER (WHERE psf.order_date >= NOW() - INTERVAL '90 days'), 0)::NUMERIC(14, 2) AS revenue_90d,
    COALESCE(SUM(psf.quantity) FILTER (
      WHERE psf.order_date >= NOW() - INTERVAL '7 days'
        AND psf.order_date < NOW() - INTERVAL '3 days'
    ), 0)::INTEGER AS units_prev_window
  FROM public.products p
  LEFT JOIN public.product_sales_facts psf
    ON psf.tenant_id = p.tenant_id
   AND (
     (psf.sku IS NOT NULL AND LOWER(psf.sku) = LOWER(p.sku))
     OR (
       psf.sku IS NULL
       AND LOWER(BTRIM(psf.product_name)) = LOWER(BTRIM(p.name))
     )
   )
  GROUP BY p.id
)
SELECT
  p.id,
  p.tenant_id,
  p.name,
  p.sku,
  p.category,
  p.category_id,
  COALESCE(c.name, p.category) AS category_name,
  p.sale_price,
  p.cost_price,
  ROUND((p.sale_price - p.cost_price)::NUMERIC, 2) AS markup_value,
  CASE
    WHEN p.sale_price > 0 THEN ROUND((((p.sale_price - p.cost_price) / p.sale_price) * 100)::NUMERIC, 2)
    ELSE 0
  END AS margin_percent,
  COALESCE(i.quantity, 0) AS stock_level,
  p.min_stock_level,
  p.max_stock_level,
  ROUND((COALESCE(i.quantity, 0) * p.cost_price)::NUMERIC, 2) AS stock_value_cost,
  ROUND((COALESCE(i.quantity, 0) * p.sale_price)::NUMERIC, 2) AS stock_value_sale,
  sr.last_sale_at,
  CASE
    WHEN sr.last_sale_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM NOW() - sr.last_sale_at)::INTEGER
  END AS days_since_last_sale,
  sr.total_units_sold,
  ROUND(sr.total_revenue::NUMERIC, 2) AS total_revenue,
  sr.units_sold_7d,
  sr.units_sold_30d,
  sr.units_sold_90d,
  ROUND(sr.revenue_30d::NUMERIC, 2) AS revenue_30d,
  ROUND(sr.revenue_90d::NUMERIC, 2) AS revenue_90d,
  ROUND((sr.units_sold_30d / 30.0)::NUMERIC, 2) AS sales_velocity_daily,
  CASE
    WHEN sr.units_sold_30d > 0 THEN ROUND((COALESCE(i.quantity, 0) / NULLIF(sr.units_sold_30d / 30.0, 0))::NUMERIC, 1)
    ELSE NULL
  END AS stock_coverage_days,
  CASE
    WHEN COALESCE(i.quantity, 0) <= 0 THEN 'OUT'
    WHEN COALESCE(i.quantity, 0) <= p.min_stock_level THEN 'CRITICAL'
    WHEN p.max_stock_level IS NOT NULL AND COALESCE(i.quantity, 0) >= p.max_stock_level THEN 'EXCESS'
    WHEN COALESCE(i.quantity, 0) <= CEIL(p.min_stock_level * 1.5) THEN 'WARNING'
    ELSE 'OK'
  END AS stock_status,
  CASE
    WHEN sr.units_sold_30d = 0 AND sr.units_prev_window = 0 THEN 'stable'
    WHEN sr.units_sold_7d > GREATEST(sr.units_prev_window, 1) THEN 'accelerating'
    WHEN sr.units_prev_window > sr.units_sold_7d THEN 'decelerating'
    ELSE 'stable'
  END AS demand_trend
FROM public.products p
LEFT JOIN public.inventory i
  ON i.product_id = p.id
LEFT JOIN public.categories c
  ON c.id = p.category_id
LEFT JOIN sales_rollup sr
  ON sr.product_id = p.id
WHERE p.archived_at IS NULL;

-- ── Benchmarking Tables ─────────────────────────────────
-- Competitors, their products, and price history for manual benchmarking.

-- 1. competitors
CREATE TABLE IF NOT EXISTS competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  category TEXT NOT NULL DEFAULT 'direto'
    CHECK (category IN ('direto', 'indireto')),
  region TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitors_tenant
  ON competitors(tenant_id, created_at DESC);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

-- 2. competitor_products
CREATE TABLE IF NOT EXISTS competitor_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  your_product_name TEXT,
  current_price NUMERIC DEFAULT 0,
  your_price NUMERIC DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_products_tenant
  ON competitor_products(tenant_id, competitor_id);

ALTER TABLE competitor_products ENABLE ROW LEVEL SECURITY;

-- 3. competitor_price_history
CREATE TABLE IF NOT EXISTS competitor_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_product_id UUID NOT NULL REFERENCES competitor_products(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  your_price_at_time NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_price_history_product
  ON competitor_price_history(competitor_product_id, recorded_at DESC);

ALTER TABLE competitor_price_history ENABLE ROW LEVEL SECURITY;

-- 4. benchmarking_swot (persisted SWOT analyses)
CREATE TABLE IF NOT EXISTS benchmarking_swot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  swot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_suggestions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmarking_swot_tenant
  ON benchmarking_swot(tenant_id, created_at DESC);

ALTER TABLE benchmarking_swot ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Tabelas de benchmarking criadas com sucesso';
END;
$$;

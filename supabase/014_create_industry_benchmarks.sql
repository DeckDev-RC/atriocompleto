-- ── Industry Benchmarks Reference Table ──────────────────
-- Static sector benchmarks by company size tier.
-- Updated manually 1-2x/year from SEBRAE/IBGE/ABComm reports.

CREATE TABLE IF NOT EXISTS industry_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sector TEXT NOT NULL DEFAULT 'ecommerce',
  size_tier TEXT NOT NULL CHECK (size_tier IN ('micro','pequena','media','grande')),
  metric_key TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  reference_value NUMERIC NOT NULL,
  unit TEXT DEFAULT '',
  percentile_25 NUMERIC,
  percentile_75 NUMERIC,
  source TEXT DEFAULT 'SEBRAE/ABComm 2024',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sector, size_tier, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_industry_benchmarks_lookup
  ON industry_benchmarks(sector, size_tier);

ALTER TABLE industry_benchmarks ENABLE ROW LEVEL SECURITY;

-- ── Seed: E-commerce benchmarks by size tier ─────────────

-- MICRO (<R$360k/ano)
INSERT INTO industry_benchmarks (sector, size_tier, metric_key, metric_label, reference_value, unit, percentile_25, percentile_75, source) VALUES
  ('ecommerce', 'micro', 'avg_ticket',         'Ticket Médio',           85,    'BRL', 55,   120,  'SEBRAE/ABComm 2024'),
  ('ecommerce', 'micro', 'cancellation_rate',   'Taxa de Cancelamento',   8,     '%',   5,    12,   'SEBRAE/ABComm 2024'),
  ('ecommerce', 'micro', 'yoy_growth',          'Crescimento YoY',        12,    '%',   5,    25,   'SEBRAE/ABComm 2024'),
  ('ecommerce', 'micro', 'avg_orders_month',    'Pedidos/Mês',            120,   'un',  50,   250,  'SEBRAE/ABComm 2024'),
  ('ecommerce', 'micro', 'revenue_per_order',   'Receita/Pedido',         78,    'BRL', 45,   110,  'SEBRAE/ABComm 2024')
ON CONFLICT (sector, size_tier, metric_key) DO NOTHING;

-- PEQUENA (R$360k - R$4.8M/ano)
INSERT INTO industry_benchmarks (sector, size_tier, metric_key, metric_label, reference_value, unit, percentile_25, percentile_75, source) VALUES
  ('ecommerce', 'pequena', 'avg_ticket',        'Ticket Médio',           120,   'BRL', 80,   180,  'SEBRAE/ABComm 2024'),
  ('ecommerce', 'pequena', 'cancellation_rate',  'Taxa de Cancelamento',   6,     '%',   3,    9,    'SEBRAE/ABComm 2024'),
  ('ecommerce', 'pequena', 'yoy_growth',         'Crescimento YoY',        18,    '%',   8,    30,   'SEBRAE/ABComm 2024'),
  ('ecommerce', 'pequena', 'avg_orders_month',   'Pedidos/Mês',            800,   'un',  300,  1500, 'SEBRAE/ABComm 2024'),
  ('ecommerce', 'pequena', 'revenue_per_order',  'Receita/Pedido',         105,   'BRL', 70,   150,  'SEBRAE/ABComm 2024')
ON CONFLICT (sector, size_tier, metric_key) DO NOTHING;

-- MÉDIA (R$4.8M - R$300M/ano)
INSERT INTO industry_benchmarks (sector, size_tier, metric_key, metric_label, reference_value, unit, percentile_25, percentile_75, source) VALUES
  ('ecommerce', 'media', 'avg_ticket',          'Ticket Médio',           150,   'BRL', 100,  220,  'SEBRAE/ABComm 2024'),
  ('ecommerce', 'media', 'cancellation_rate',    'Taxa de Cancelamento',   4.5,   '%',   2,    7,    'SEBRAE/ABComm 2024'),
  ('ecommerce', 'media', 'yoy_growth',           'Crescimento YoY',        22,    '%',   10,   35,   'SEBRAE/ABComm 2024'),
  ('ecommerce', 'media', 'avg_orders_month',     'Pedidos/Mês',            5000,  'un',  2000, 12000,'SEBRAE/ABComm 2024'),
  ('ecommerce', 'media', 'revenue_per_order',    'Receita/Pedido',         135,   'BRL', 90,   200,  'SEBRAE/ABComm 2024')
ON CONFLICT (sector, size_tier, metric_key) DO NOTHING;

-- GRANDE (>R$300M/ano)
INSERT INTO industry_benchmarks (sector, size_tier, metric_key, metric_label, reference_value, unit, percentile_25, percentile_75, source) VALUES
  ('ecommerce', 'grande', 'avg_ticket',          'Ticket Médio',           200,   'BRL', 130,  300,  'SEBRAE/ABComm 2024'),
  ('ecommerce', 'grande', 'cancellation_rate',    'Taxa de Cancelamento',   3,     '%',   1.5,  5,    'SEBRAE/ABComm 2024'),
  ('ecommerce', 'grande', 'yoy_growth',           'Crescimento YoY',        15,    '%',   8,    25,   'SEBRAE/ABComm 2024'),
  ('ecommerce', 'grande', 'avg_orders_month',     'Pedidos/Mês',            50000, 'un',  15000,100000,'SEBRAE/ABComm 2024'),
  ('ecommerce', 'grande', 'revenue_per_order',    'Receita/Pedido',         180,   'BRL', 120,  260,  'SEBRAE/ABComm 2024')
ON CONFLICT (sector, size_tier, metric_key) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '✅ Tabela industry_benchmarks criada e populada com sucesso';
END;
$$;

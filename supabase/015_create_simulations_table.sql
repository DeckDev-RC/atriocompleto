-- ── Scenario Simulations Table ─────────────────────────────
-- Stores saved What-If simulation scenarios for each tenant

CREATE TABLE IF NOT EXISTS simulations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  scenario_data JSONB NOT NULL,    
  baseline_metrics JSONB NOT NULL, 
  projected_metrics JSONB NOT NULL,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_simulations_tenant_id ON simulations(tenant_id);

-- Enable RLS
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;

-- Standard tenant isolation policies
CREATE POLICY "Tenants can view their own simulations"
ON simulations FOR SELECT
USING (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenants can insert their own simulations"
ON simulations FOR INSERT
WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenants can update their own simulations"
ON simulations FOR UPDATE
USING (tenant_id = (SELECT auth.uid()))
WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "Tenants can delete their own simulations"
ON simulations FOR DELETE
USING (tenant_id = (SELECT auth.uid()));

DO $$
BEGIN
  RAISE NOTICE '✅ Tabela simulations criada com sucesso';
END;
$$;

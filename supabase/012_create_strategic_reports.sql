-- ── strategic_reports table ──────────────────────────────
CREATE TABLE IF NOT EXISTS strategic_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  bcg_data JSONB DEFAULT '{}'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  period_start DATE,
  period_end DATE,
  status TEXT DEFAULT 'generated',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_reports_tenant
  ON strategic_reports(tenant_id, created_at DESC);

ALTER TABLE strategic_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Tabela strategic_reports criada com sucesso';
END;
$$;

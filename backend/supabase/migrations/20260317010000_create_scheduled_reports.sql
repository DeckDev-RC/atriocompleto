-- Scheduled reports and execution history.
-- Supports recurring analytical report delivery via backend-managed jobs.

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT;

INSERT INTO public.permissions (name, description, label, category, icon)
VALUES
  (
    'visualizar_relatorios',
    'Pode visualizar relatórios e histórico de execuções',
    'Visualizar Relatórios',
    'Relatórios',
    'FileText'
  ),
  (
    'gerenciar_relatorios',
    'Pode criar, editar, pausar e executar relatórios agendados',
    'Gerenciar Relatórios',
    'Relatórios',
    'FileText'
  )
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon;

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL
    CHECK (report_type IN ('sales', 'products', 'customers', 'finance')),
  format TEXT NOT NULL
    CHECK (format IN ('csv', 'xlsx', 'html')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error')),
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  cron_expression TEXT NOT NULL,
  schedule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  last_execution_status TEXT
    CHECK (last_execution_status IN ('success', 'failed')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant_status
  ON public.scheduled_reports(tenant_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_creator
  ON public.scheduled_reports(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.report_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID NOT NULL REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  execution_type TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (execution_type IN ('scheduled', 'manual')),
  attempt_number INTEGER NOT NULL DEFAULT 1
    CHECK (attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  subject TEXT,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  content_type TEXT,
  file_size_bytes BIGINT,
  duration_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_executions_schedule
  ON public.report_executions(scheduled_report_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_executions_tenant
  ON public.report_executions(tenant_id, executed_at DESC);

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_reports_select_own_tenant" ON public.scheduled_reports;
CREATE POLICY "scheduled_reports_select_own_tenant" ON public.scheduled_reports
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "scheduled_reports_insert_own_tenant" ON public.scheduled_reports;
CREATE POLICY "scheduled_reports_insert_own_tenant" ON public.scheduled_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "scheduled_reports_update_own_tenant" ON public.scheduled_reports;
CREATE POLICY "scheduled_reports_update_own_tenant" ON public.scheduled_reports
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

DROP POLICY IF EXISTS "scheduled_reports_delete_own_tenant" ON public.scheduled_reports;
CREATE POLICY "scheduled_reports_delete_own_tenant" ON public.scheduled_reports
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

DROP POLICY IF EXISTS "report_executions_select_own_tenant" ON public.report_executions;
CREATE POLICY "report_executions_select_own_tenant" ON public.report_executions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scheduled-reports',
  'scheduled-reports',
  false,
  26214400,
  ARRAY[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- On-demand report exports with history, storage and temporary public sharing.

CREATE TABLE IF NOT EXISTS public.report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('scheduled_report', 'custom_definition', 'custom_builder')),
  source_id UUID,
  title TEXT NOT NULL,
  format TEXT NOT NULL
    CHECK (format IN ('csv', 'xlsx', 'html', 'json', 'pdf')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'success', 'failed', 'expired')),
  progress INTEGER NOT NULL DEFAULT 0
    CHECK (progress BETWEEN 0 AND 100),
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  emailed_at TIMESTAMPTZ,
  public_token TEXT UNIQUE,
  public_expires_at TIMESTAMPTZ,
  file_name TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  content_type TEXT,
  file_size_bytes BIGINT,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_exports_requested_by
  ON public.report_exports(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_exports_tenant_status
  ON public.report_exports(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_exports_source
  ON public.report_exports(source_type, source_id, created_at DESC);

ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_exports_select_own" ON public.report_exports;
CREATE POLICY "report_exports_select_own" ON public.report_exports
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "report_exports_insert_own" ON public.report_exports;
CREATE POLICY "report_exports_insert_own" ON public.report_exports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "report_exports_update_own" ON public.report_exports;
CREATE POLICY "report_exports_update_own" ON public.report_exports
  FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-exports',
  'report-exports',
  false,
  104857600,
  ARRAY[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html',
    'application/json',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

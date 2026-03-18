-- Persist custom report definitions for the restricted report builder.

CREATE TABLE IF NOT EXISTS public.custom_report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_report_definitions_tenant
  ON public.custom_report_definitions(tenant_id, updated_at DESC);

ALTER TABLE public.custom_report_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_report_definitions_select_own_tenant" ON public.custom_report_definitions;
CREATE POLICY "custom_report_definitions_select_own_tenant" ON public.custom_report_definitions
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

DROP POLICY IF EXISTS "custom_report_definitions_insert_own_tenant" ON public.custom_report_definitions;
CREATE POLICY "custom_report_definitions_insert_own_tenant" ON public.custom_report_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "custom_report_definitions_update_own_tenant" ON public.custom_report_definitions;
CREATE POLICY "custom_report_definitions_update_own_tenant" ON public.custom_report_definitions
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

DROP POLICY IF EXISTS "custom_report_definitions_delete_own_tenant" ON public.custom_report_definitions;
CREATE POLICY "custom_report_definitions_delete_own_tenant" ON public.custom_report_definitions
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

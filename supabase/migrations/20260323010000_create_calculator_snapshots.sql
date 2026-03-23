-- Persist explicit user-saved calculator snapshots.

CREATE TABLE IF NOT EXISTS public.calculator_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calculator_type TEXT NOT NULL CHECK (calculator_type IN ('taxes', 'prices')),
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculator_snapshots_user_type
  ON public.calculator_snapshots(user_id, calculator_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_calculator_snapshots_tenant_type
  ON public.calculator_snapshots(tenant_id, calculator_type, updated_at DESC);

ALTER TABLE public.calculator_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calculator_snapshots_select_own" ON public.calculator_snapshots;
CREATE POLICY "calculator_snapshots_select_own" ON public.calculator_snapshots
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calculator_snapshots_insert_own" ON public.calculator_snapshots;
CREATE POLICY "calculator_snapshots_insert_own" ON public.calculator_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calculator_snapshots_update_own" ON public.calculator_snapshots;
CREATE POLICY "calculator_snapshots_update_own" ON public.calculator_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calculator_snapshots_delete_own" ON public.calculator_snapshots;
CREATE POLICY "calculator_snapshots_delete_own" ON public.calculator_snapshots
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

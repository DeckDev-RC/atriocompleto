-- Migration: Create optimus_suggestions table
CREATE TABLE IF NOT EXISTS public.optimus_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('immediate', 'opportunity', 'risk')),
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  impact TEXT,
  action TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('alta', 'media', 'baixa')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  metadata JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_optimus_suggestions_tenant_status ON public.optimus_suggestions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_optimus_suggestions_created_at ON public.optimus_suggestions(created_at);

-- RLS Policies
ALTER TABLE public.optimus_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tenant suggestions"
  ON public.optimus_suggestions
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own tenant suggestions"
  ON public.optimus_suggestions
  FOR UPDATE
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own tenant suggestions"
  ON public.optimus_suggestions
  FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

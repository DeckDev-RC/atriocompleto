-- ─────────────────────────────────────────────────────────
-- 011: Token usage tracking table for AI agent cost monitoring
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS token_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  conversation_id TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by tenant and date range (cost reports)
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_date
  ON token_usage_logs (tenant_id, created_at DESC);

-- Index for querying by user (individual usage tracking)
CREATE INDEX IF NOT EXISTS idx_token_usage_user_date
  ON token_usage_logs (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE token_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read token logs
CREATE POLICY "Masters can read all token logs"
  ON token_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'master'
    )
  );

-- Service role can insert (backend writes via supabaseAdmin)
CREATE POLICY "Service role can insert token logs"
  ON token_usage_logs FOR INSERT
  WITH CHECK (true);

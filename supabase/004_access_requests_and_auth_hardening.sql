-- ============================================
-- Átrio — Access Requests + Auth Hardening
-- Run AFTER 003_user_preferences.sql
-- ============================================

-- ── 1. Helper trigger function for updated_at ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Access requests table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected', 'converted')),
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  converted_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email_unique
  ON access_requests ((lower(email)));

CREATE INDEX IF NOT EXISTS idx_access_requests_status_created_at
  ON access_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_access_requests_updated_at ON access_requests;
CREATE TRIGGER trg_access_requests_updated_at
  BEFORE UPDATE ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

-- ── 3. Login 2FA challenge table ───────────────────────────────
CREATE TABLE IF NOT EXISTS auth_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  session_expires_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_user_id
  ON auth_login_challenges (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_expires_at
  ON auth_login_challenges (expires_at);

-- ── 4. Password reset token table ──────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);

-- ── 5. Enable RLS (service_role bypasses) ──────────────────────
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ── 6. Confirm ──────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 004 aplicada';
  RAISE NOTICE '✅ access_requests criada com email único (case-insensitive)';
  RAISE NOTICE '✅ auth_login_challenges criada para 2FA por email';
  RAISE NOTICE '✅ password_reset_tokens criada para fluxo esqueci senha';
END;
$$;

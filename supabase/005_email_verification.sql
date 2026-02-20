-- ============================================
-- Átrio — Email Verification Migration
-- Run AFTER 004_access_requests_and_auth_hardening.sql
-- ============================================

-- ── 1. Adicionar email_verified na profiles ───────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Tabela email_verification_tokens ────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
  ON email_verification_tokens (expires_at);

-- ── 3. Habilitar RLS ───────────────────────────────────
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS Policies ────────────────────────────────────
-- NOTA DE REVISÃO: Não adicionamos nenhuma policy "FOR SELECT", "FOR INSERT" ou "FOR UPDATE".
-- Isso garante que apenas a service_role (usada pelo nosso backend) tenha acesso.
-- É uma medida de segurança para evitar que tokens vazem via API pública (PostgREST).

-- ── 5. Confirmar ──────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 005 aplicada';
  RAISE NOTICE '✅ Campo email_verified adicionado à tabela profiles';
  RAISE NOTICE '✅ Tabela email_verification_tokens criada';
  RAISE NOTICE '✅ RLS habilitado (apenas acesso service_role)';
END;
$$;

-- ============================================
-- Agente IA Ambro — Supabase Migration
-- MVP Tables & Indexes
-- Run this in Supabase SQL Editor
-- ============================================

-- ── 1. Tabela conversations ─────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para buscar conversas por usuário
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at DESC);

-- ── 2. Tabela sessions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at);

-- ── 3. Índices da tabela orders (se ainda não existem) ──
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_marketplace
  ON orders(marketplace);

CREATE INDEX IF NOT EXISTS idx_orders_order_date
  ON orders(order_date);

CREATE INDEX IF NOT EXISTS idx_orders_status_date
  ON orders(status, order_date);

-- ── 4. RLS (Row Level Security) ─────────────────────────
-- Habilitar RLS nas tabelas novas
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Backend (service_role) tem acesso total
-- O service_role key bypassa RLS automaticamente no Supabase
-- Não é necessário criar policies explícitas para service_role

-- ── 5. Função para queries ad-hoc (Text-to-SQL) ────────
-- Esta função permite executar SELECT queries de forma segura
-- Chamada via supabase.rpc('execute_readonly_query', { query_text: '...' })
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Validação básica: deve começar com SELECT
  IF NOT (UPPER(TRIM(query_text)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Apenas queries SELECT são permitidas';
  END IF;

  -- Validação: bloquear operações perigosas
  IF query_text ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC)\b' THEN
    RAISE EXCEPTION 'Operação não permitida';
  END IF;

  -- Executar query e retornar como JSON
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_text || ') t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── 6. Função para retornar metadados da tabela orders ──
-- Retorna valores distintos de status e marketplace como JSONB
-- Chamada via supabase.rpc('get_orders_metadata')
CREATE OR REPLACE FUNCTION get_orders_metadata()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'statuses', (SELECT jsonb_agg(DISTINCT status) FROM orders WHERE status IS NOT NULL),
    'marketplaces', (SELECT jsonb_agg(DISTINCT marketplace) FROM orders WHERE marketplace IS NOT NULL)
  ) INTO result;

  RETURN result;
END;
$$;

-- ── 7. Confirmar criação ────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completa! Tabelas criadas: conversations, sessions';
  RAISE NOTICE '✅ Índices criados para orders, conversations, sessions';
  RAISE NOTICE '✅ RLS habilitado em conversations e sessions';
  RAISE NOTICE '✅ Função execute_readonly_query criada';
END;
$$;

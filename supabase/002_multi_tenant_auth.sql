-- ============================================
-- Átrio — Multi-Tenant Auth Migration
-- Supabase Auth + profiles + RLS
-- Run AFTER migration.sql
-- ============================================

-- ── 1. Tabela profiles (vincula auth.users a tenants) ───
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('master', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ── 2. Adicionar tenant_id na conversations (se não existe) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);

-- ── 3. Habilitar RLS ───────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- orders e conversations já devem ter RLS habilitado, mas garantimos:
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS Policies — profiles ─────────────────────────
-- service_role bypassa tudo automaticamente (backend usa service_role)
-- Estas policies são para acesso via anon/authenticated key (frontend direto):

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── 5. RLS Policies — orders (isolamento por tenant) ───
DROP POLICY IF EXISTS "orders_tenant_isolation" ON orders;
CREATE POLICY "orders_tenant_isolation" ON orders
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master')
  );

-- ── 6. RLS Policies — conversations ────────────────────
DROP POLICY IF EXISTS "conversations_tenant_isolation" ON conversations;
CREATE POLICY "conversations_tenant_isolation" ON conversations
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master')
  );

-- ── 7. RLS Policies — tenants ──────────────────────────
DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (
    id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master')
  );

DROP POLICY IF EXISTS "tenants_master_all" ON tenants;
CREATE POLICY "tenants_master_all" ON tenants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master')
  );

-- ── 8. Trigger: criar profile automaticamente no signup ─
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.raw_user_meta_data->>'tenant_id')::uuid
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 9. Atualizar execute_readonly_query com tenant filter ─
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT, p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  result JSONB;
  safe_query TEXT;
BEGIN
  IF NOT (UPPER(TRIM(query_text)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Apenas queries SELECT são permitidas';
  END IF;

  IF query_text ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC)\b' THEN
    RAISE EXCEPTION 'Operação não permitida';
  END IF;

  -- Injetar filtro de tenant se fornecido
  IF p_tenant_id IS NOT NULL THEN
    -- Se a query já tem WHERE, adiciona AND; senão, adiciona WHERE
    IF query_text ~* '\bWHERE\b' THEN
      safe_query := regexp_replace(query_text, '(?i)\bWHERE\b', 'WHERE tenant_id = ''' || p_tenant_id || '''::uuid AND ', 'i');
    ELSE
      -- Adiciona WHERE antes de GROUP BY, ORDER BY, LIMIT, ou no final
      IF query_text ~* '\b(GROUP BY|ORDER BY|LIMIT|HAVING)\b' THEN
        safe_query := regexp_replace(query_text, '(?i)\b(GROUP BY|ORDER BY|LIMIT|HAVING)\b', 'WHERE tenant_id = ''' || p_tenant_id || '''::uuid \1', 'i');
      ELSE
        safe_query := query_text || ' WHERE tenant_id = ''' || p_tenant_id || '''::uuid';
      END IF;
    END IF;
  ELSE
    safe_query := query_text;
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || safe_query || ') t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── 10. Atualizar get_orders_metadata com tenant filter ─
CREATE OR REPLACE FUNCTION get_orders_metadata(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_tenant_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'statuses', (SELECT jsonb_agg(DISTINCT status) FROM orders WHERE status IS NOT NULL AND tenant_id = p_tenant_id),
      'marketplaces', (SELECT jsonb_agg(DISTINCT marketplace) FROM orders WHERE marketplace IS NOT NULL AND tenant_id = p_tenant_id)
    ) INTO result;
  ELSE
    SELECT jsonb_build_object(
      'statuses', (SELECT jsonb_agg(DISTINCT status) FROM orders WHERE status IS NOT NULL),
      'marketplaces', (SELECT jsonb_agg(DISTINCT marketplace) FROM orders WHERE marketplace IS NOT NULL)
    ) INTO result;
  END IF;

  RETURN result;
END;
$$;

-- ── 11. Confirmar ──────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Multi-tenant migration completa!';
  RAISE NOTICE '✅ Tabela profiles criada com FK para auth.users e tenants';
  RAISE NOTICE '✅ RLS policies para isolamento por tenant em orders, conversations, tenants';
  RAISE NOTICE '✅ Trigger on_auth_user_created para criar profile automaticamente';
  RAISE NOTICE '✅ Functions atualizadas com filtro tenant_id';
END;
$$;

-- ============================================================
-- Migration 010: Create RBAC tables (roles, permissions, role_permissions, user_roles)
--
-- Provides relational RBAC to complement profiles.permissions (JSONB).
-- The auth middleware merges both: JSONB is the base, relational RBAC overrides.
-- ============================================================

-- ── 1. Roles table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);

-- ── 2. Permissions table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default permissions used across the codebase
INSERT INTO permissions (name, description) VALUES
  ('visualizar_venda',  'Ver dashboard de vendas'),
  ('acessar_agente',    'Acessar agente IA / chat'),
  ('gerenciar_usuarios','Gerenciar usuarios do tenant'),
  ('gerenciar_tenants', 'Gerenciar tenants (master)')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Role ↔ Permission join table ────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

-- ── 4. User ↔ Role join table ──────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE (profile_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_profile_id ON user_roles(profile_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ── 5. RLS ──────────────────────────────────────────────────
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles       ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (backend always uses service_role key)
-- No public policies needed — all access is via backend API.

-- ── 6. Drop stale sessions table (unused) ───────────────────
DROP TABLE IF EXISTS sessions;

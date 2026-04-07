ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manageable_tenant_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.manageable_tenant_ids IS
  'Lista de tenants que o master delegou para o usuario visualizar e operar no painel admin.';

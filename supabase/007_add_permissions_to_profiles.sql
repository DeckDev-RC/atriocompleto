-- ============================================
-- Átrio — Add Granular Permissions to Profiles
-- ============================================

-- 1. Adicionar a coluna permissions (JSONB)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Atualizar a trigger handle_new_user para suportar metadados de permissões (opcional)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, tenant_id, permissions)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    COALESCE(NEW.raw_user_meta_data->'permissions', '{}'::jsonb)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário para documentação
COMMENT ON COLUMN public.profiles.permissions IS 'Permissões granulares do usuário em formato JSON.';

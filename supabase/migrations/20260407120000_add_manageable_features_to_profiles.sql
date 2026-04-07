ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manageable_features JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.manageable_features IS
  'Feature flags que o master delegou para o usuario operar no painel admin.';

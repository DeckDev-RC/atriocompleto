ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS tenant_code TEXT;

UPDATE public.tenants
SET tenant_code = COALESCE(
  NULLIF(TRIM(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
  'empresa'
) || '-' || substr(replace(id::text, '-', ''), 1, 6)
WHERE tenant_code IS NULL;

ALTER TABLE public.tenants
ALTER COLUMN tenant_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_tenant_code
  ON public.tenants (tenant_code);

ALTER TABLE public.tenants
ALTER COLUMN enabled_features
SET DEFAULT '{
  "ecommerce": false,
  "insights": false,
  "optimus": false,
  "sugestoes": false,
  "padroes": false,
  "estrategia": false,
  "relatorios": false,
  "campanhas": false,
  "benchmarking": false,
  "calculadora": false,
  "calculadora_precos": false,
  "estoque_eoq": false
}'::jsonb;

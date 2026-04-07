WITH dani_profile AS (
  SELECT id
  FROM public.profiles
  WHERE LOWER(email) = 'dani@daze.com.br'
  LIMIT 1
),
upsert_partner AS (
  INSERT INTO public.partners (
    name,
    slug,
    host,
    admin_profile_id,
    is_active,
    primary_color
  )
  SELECT
    'Daze',
    'daze',
    'parceiros.agregarnegocios.com.br',
    dani_profile.id,
    true,
    '#09CAFF'
  FROM dani_profile
  ON CONFLICT (slug) DO UPDATE
  SET
    host = EXCLUDED.host,
    admin_profile_id = EXCLUDED.admin_profile_id,
    is_active = EXCLUDED.is_active,
    updated_at = now()
  RETURNING id, admin_profile_id
)
UPDATE public.profiles
SET
  partner_id = upsert_partner.id,
  updated_at = now()
FROM upsert_partner
WHERE public.profiles.id = upsert_partner.admin_profile_id;

WITH daze_partner AS (
  SELECT id
  FROM public.partners
  WHERE slug = 'daze'
  LIMIT 1
)
UPDATE public.tenants
SET
  partner_id = daze_partner.id
FROM daze_partner
WHERE LOWER(public.tenants.name) = 'daze';

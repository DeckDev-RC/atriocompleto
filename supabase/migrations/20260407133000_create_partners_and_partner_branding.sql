CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL UNIQUE,
  admin_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  primary_color TEXT NULL,
  login_logo_url TEXT NULL,
  sidebar_logo_light_url TEXT NULL,
  sidebar_logo_dark_url TEXT NULL,
  icon_logo_url TEXT NULL,
  footer_logo_url TEXT NULL,
  favicon_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS partner_id UUID NULL REFERENCES public.partners(id) ON DELETE SET NULL;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS partner_id UUID NULL REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partners_admin_profile_id
  ON public.partners(admin_profile_id);

CREATE INDEX IF NOT EXISTS idx_profiles_partner_id
  ON public.profiles(partner_id);

CREATE INDEX IF NOT EXISTS idx_tenants_partner_id
  ON public.tenants(partner_id);

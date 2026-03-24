-- Public self-signup configuration + tenant onboarding flag

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS needs_tenant_setup BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.public_signup_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.public_signup_settings (id, enabled)
VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;

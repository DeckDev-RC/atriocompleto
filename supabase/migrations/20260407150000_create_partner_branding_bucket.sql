INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-branding', 'partner-branding', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Átrio — User Preferences & Avatar Migration
-- Run AFTER 002_multi_tenant_auth.sql
-- ============================================

-- ── 1. Adicionar avatar_url na tabela profiles ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- ── 2. Tabela user_preferences ──────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  primary_color TEXT NOT NULL DEFAULT '#09CAFF',
  font_family TEXT NOT NULL DEFAULT 'DM Sans',
  number_locale TEXT NOT NULL DEFAULT 'pt-BR',
  number_decimals INTEGER NOT NULL DEFAULT 2 CHECK (number_decimals BETWEEN 0 AND 4),
  currency_symbol TEXT NOT NULL DEFAULT 'R$',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. RLS para user_preferences ────────────────────────
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_select_own" ON user_preferences;
CREATE POLICY "prefs_select_own" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prefs_insert_own" ON user_preferences;
CREATE POLICY "prefs_insert_own" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prefs_update_own" ON user_preferences;
CREATE POLICY "prefs_update_own" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 4. Storage bucket para avatars ──────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Storage policies para avatars ────────────────────
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 6. Confirmar ────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ User preferences migration completa!';
  RAISE NOTICE '✅ Coluna avatar_url adicionada em profiles';
  RAISE NOTICE '✅ Tabela user_preferences criada';
  RAISE NOTICE '✅ RLS policies para user_preferences';
  RAISE NOTICE '✅ Storage bucket avatars criado';
END;
$$;

-- Temporary file ingestion for Optimus.
-- Files are stored in Supabase Storage and processed asynchronously.

CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'temp-uploads',
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_kind TEXT NOT NULL CHECK (file_kind IN ('image', 'pdf', 'spreadsheet', 'text')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'processed', 'error', 'deleted')),
  processing_stage TEXT NOT NULL DEFAULT 'queued',
  processing_progress INTEGER NOT NULL DEFAULT 0 CHECK (processing_progress >= 0 AND processing_progress <= 100),
  parser_name TEXT,
  extracted_text TEXT,
  extracted_json JSONB,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_uploaded_at
  ON public.uploaded_files(user_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_conversation
  ON public.uploaded_files(conversation_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_status
  ON public.uploaded_files(status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_expires_at
  ON public.uploaded_files(expires_at);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_tenant_status
  ON public.uploaded_files(tenant_id, status, uploaded_at DESC);

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uploaded_files_select_own" ON public.uploaded_files;
CREATE POLICY "uploaded_files_select_own" ON public.uploaded_files
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "uploaded_files_insert_own" ON public.uploaded_files;
CREATE POLICY "uploaded_files_insert_own" ON public.uploaded_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "uploaded_files_update_own" ON public.uploaded_files;
CREATE POLICY "uploaded_files_update_own" ON public.uploaded_files
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "uploaded_files_delete_own" ON public.uploaded_files;
CREATE POLICY "uploaded_files_delete_own" ON public.uploaded_files
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-uploads',
  'temp-uploads',
  false,
  10485760,
  ARRAY[
    'image/png',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "temp_uploads_select_own" ON storage.objects;
CREATE POLICY "temp_uploads_select_own" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'temp-uploads'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "temp_uploads_insert_own" ON storage.objects;
CREATE POLICY "temp_uploads_insert_own" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'temp-uploads'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "temp_uploads_update_own" ON storage.objects;
CREATE POLICY "temp_uploads_update_own" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'temp-uploads'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "temp_uploads_delete_own" ON storage.objects;
CREATE POLICY "temp_uploads_delete_own" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'temp-uploads'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Normalize chat persistence and add memory primitives for Optimus.
-- Snapshot mirror of backend/supabase/migrations/20260317000000_create_conversation_memory.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
  ON public.conversation_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_created
  ON public.conversation_messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_tenant_created
  ON public.conversation_messages(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_content_trgm
  ON public.conversation_messages
  USING gin (content gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count_covered INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_updated
  ON public.conversation_summaries(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_tenant_updated
  ON public.conversation_summaries(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_summary_trgm
  ON public.conversation_summaries
  USING gin (summary gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.optimus_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('user', 'tenant')),
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'fact', 'decision', 'file_reference', 'context')),
  memory_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  relevance_score INTEGER NOT NULL DEFAULT 50 CHECK (relevance_score BETWEEN 0 AND 100),
  confidence_score INTEGER NOT NULL DEFAULT 50 CHECK (confidence_score BETWEEN 0 AND 100),
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.conversation_messages(id) ON DELETE SET NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES public.optimus_memories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimus_memories_user_type
  ON public.optimus_memories(user_id, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimus_memories_tenant_type
  ON public.optimus_memories(tenant_id, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimus_memories_active
  ON public.optimus_memories(is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimus_memories_key_trgm
  ON public.optimus_memories
  USING gin (memory_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_optimus_memories_summary_trgm
  ON public.optimus_memories
  USING gin (summary gin_trgm_ops);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimus_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_messages_select_own" ON public.conversation_messages;
CREATE POLICY "conversation_messages_select_own" ON public.conversation_messages
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "conversation_messages_insert_own" ON public.conversation_messages;
CREATE POLICY "conversation_messages_insert_own" ON public.conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "conversation_summaries_select_own" ON public.conversation_summaries;
CREATE POLICY "conversation_summaries_select_own" ON public.conversation_summaries
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "conversation_summaries_insert_own" ON public.conversation_summaries;
CREATE POLICY "conversation_summaries_insert_own" ON public.conversation_summaries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "conversation_summaries_update_own" ON public.conversation_summaries;
CREATE POLICY "conversation_summaries_update_own" ON public.conversation_summaries
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    OR tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "optimus_memories_select_own" ON public.optimus_memories;
CREATE POLICY "optimus_memories_select_own" ON public.optimus_memories
  FOR SELECT TO authenticated
  USING (
    (
      scope = 'user'
      AND user_id = (SELECT auth.uid())::text
    )
    OR (
      scope = 'tenant'
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

DROP POLICY IF EXISTS "optimus_memories_insert_own" ON public.optimus_memories;
CREATE POLICY "optimus_memories_insert_own" ON public.optimus_memories
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      scope = 'user'
      AND user_id = (SELECT auth.uid())::text
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    OR (
      scope = 'tenant'
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "optimus_memories_update_own" ON public.optimus_memories;
CREATE POLICY "optimus_memories_update_own" ON public.optimus_memories
  FOR UPDATE TO authenticated
  USING (
    (
      scope = 'user'
      AND user_id = (SELECT auth.uid())::text
    )
    OR (
      scope = 'tenant'
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  )
  WITH CHECK (
    (
      scope = 'user'
      AND user_id = (SELECT auth.uid())::text
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    OR (
      scope = 'tenant'
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'master'
    )
  );

CREATE OR REPLACE FUNCTION public.touch_conversation_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET
    updated_at = COALESCE(NEW.created_at, NOW()),
    last_message_at = COALESCE(NEW.created_at, NOW()),
    last_message_preview = LEFT(NEW.content, 280),
    message_count = COALESCE(message_count, 0) + 1
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation_from_message ON public.conversation_messages;
CREATE TRIGGER trg_touch_conversation_from_message
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_from_message();

WITH source_messages AS (
  SELECT
    c.id AS conversation_id,
    c.tenant_id,
    c.user_id,
    m.value,
    m.ordinality
  FROM public.conversations c
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.messages, '[]'::jsonb)) WITH ORDINALITY AS m(value, ordinality)
  WHERE c.tenant_id IS NOT NULL
)
INSERT INTO public.conversation_messages (
  conversation_id,
  tenant_id,
  user_id,
  role,
  content,
  metadata,
  created_at
)
SELECT
  source_messages.conversation_id,
  source_messages.tenant_id,
  source_messages.user_id,
  CASE
    WHEN COALESCE(source_messages.value->>'role', 'user') IN ('assistant', 'system')
      THEN source_messages.value->>'role'
    ELSE 'user'
  END AS role,
  COALESCE(source_messages.value->>'content', ''),
  jsonb_build_object(
    'backfilled', true,
    'original_timestamp', source_messages.value->>'timestamp',
    'ordinality', source_messages.ordinality
  ),
  COALESCE(
    NULLIF(source_messages.value->>'timestamp', '')::timestamptz,
    (
      SELECT c.created_at
      FROM public.conversations c
      WHERE c.id = source_messages.conversation_id
    )
  )
FROM source_messages
WHERE COALESCE(source_messages.value->>'content', '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.conversation_messages cm
    WHERE cm.conversation_id = source_messages.conversation_id
  )
ORDER BY source_messages.conversation_id, source_messages.ordinality;

WITH ranked_messages AS (
  SELECT
    cm.conversation_id,
    cm.content,
    cm.created_at,
    ROW_NUMBER() OVER (PARTITION BY cm.conversation_id ORDER BY cm.created_at DESC, cm.id DESC) AS rn,
    COUNT(*) OVER (PARTITION BY cm.conversation_id) AS total_count
  FROM public.conversation_messages cm
)
UPDATE public.conversations c
SET
  message_count = ranked_messages.total_count,
  last_message_at = ranked_messages.created_at,
  last_message_preview = LEFT(ranked_messages.content, 280),
  updated_at = GREATEST(COALESCE(c.updated_at, c.created_at), ranked_messages.created_at)
FROM ranked_messages
WHERE ranked_messages.conversation_id = c.id
  AND ranked_messages.rn = 1;

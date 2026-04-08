ALTER TABLE IF EXISTS public.user_preferences
ADD COLUMN IF NOT EXISTS price_calculator_management_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

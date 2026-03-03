-- Add ai_rate_limit column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_rate_limit INTEGER DEFAULT 20;

-- Audit log (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    INSERT INTO audit_logs (action, resource, details)
    VALUES ('migration.apply', 'tenants', '{"column": "ai_rate_limit", "default": 20}');
  END IF;
END $$;

-- 027: Add feature flags per tenant
-- Each tenant can have specific features enabled/disabled.
-- An empty object '{}' means ALL features are enabled (backwards-compatible).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT '{}';

-- Fix audit log entityId type to allow non-UUID values like "SYSTEM_GLOBAL"
ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE text;

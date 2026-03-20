-- 027: Add feature flags per tenant
-- Each tenant can have specific features enabled/disabled.
-- An empty object '{}' means ALL features are enabled (backwards-compatible).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT '{}';

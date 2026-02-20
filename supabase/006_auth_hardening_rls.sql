-- ── 1. Enable RLS on sensitive tables ───────────────────
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS Policies ────────────────────────────────────
-- We keep them restricted (no public policies) because these tables
-- should only be managed by the backend (service_role). 
-- This follows the pattern used in email_verification_tokens.

-- NOTE: If the frontend needs to read its OWN access request status 
-- without being authenticated, we would need a specific policy here. 
-- But typically these are handled by the backend API.

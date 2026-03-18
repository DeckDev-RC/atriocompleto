-- Hardening pass after expanding Optimus catalog.
-- Fixes security advisors on views and removes RLS dependency on auth user_metadata.

CREATE OR REPLACE FUNCTION public.is_current_user_master()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'master'
  );
$$;

ALTER VIEW public.product_sales_facts
  SET (security_invoker = true);

ALTER VIEW public.product_insights
  SET (security_invoker = true);

DROP POLICY IF EXISTS "Allow master to select access requests" ON public.access_requests;
CREATE POLICY "Allow master to select access requests" ON public.access_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_current_user_master()));

DROP POLICY IF EXISTS "Allow master to update access requests" ON public.access_requests;
CREATE POLICY "Allow master to update access requests" ON public.access_requests
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_current_user_master()))
  WITH CHECK ((SELECT public.is_current_user_master()));

DROP POLICY IF EXISTS "Allow master to delete access requests" ON public.access_requests;
CREATE POLICY "Allow master to delete access requests" ON public.access_requests
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_current_user_master()));

DROP POLICY IF EXISTS "profiles_master_select" ON public.profiles;
CREATE POLICY "profiles_master_select" ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_current_user_master()));

DROP POLICY IF EXISTS "profiles_master_update" ON public.profiles;
CREATE POLICY "profiles_master_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_current_user_master()))
  WITH CHECK ((SELECT public.is_current_user_master()));

DROP POLICY IF EXISTS "profiles_master_delete" ON public.profiles;
CREATE POLICY "profiles_master_delete" ON public.profiles
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_current_user_master()));

CREATE INDEX IF NOT EXISTS idx_access_requests_processed_by
  ON public.access_requests(processed_by);

CREATE INDEX IF NOT EXISTS idx_access_requests_converted_user_id
  ON public.access_requests(converted_user_id);

CREATE INDEX IF NOT EXISTS idx_competitor_products_competitor_id
  ON public.competitor_products(competitor_id);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id
  ON public.inventory(product_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_created_by
  ON public.marketplace_integrations(created_by);

CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_user_id
  ON public.marketplace_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products(category_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
  ON public.role_permissions(permission_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id_only
  ON public.user_roles(role_id);

-- Fix: infinite recursion in organization_members RLS policy
-- The original org_members_see_peers policy queried organization_members
-- FROM within a policy ON organization_members → stack overflow in PostgreSQL.
-- Solution: SECURITY DEFINER function that bypasses RLS for the membership check.

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id
      AND coach_id = auth.uid()
      AND status = 'active'
      AND deleted_at IS NULL
  );
$$;

-- Drop the recursive policy and replace with SECURITY DEFINER call
DROP POLICY IF EXISTS "org_members_see_peers" ON organization_members;

CREATE POLICY "org_members_see_peers" ON organization_members
  FOR SELECT USING (public.is_active_org_member(org_id));

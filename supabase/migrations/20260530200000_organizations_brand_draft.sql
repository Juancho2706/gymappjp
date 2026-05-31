-- Brand Studio: draft/published versioning without a separate table.
-- brand_draft: jsonb holding unpublished edits {logo_url, primary_color, name}
-- brand_published_at: timestamp of last publish (null = never published explicitly)
-- brand_published_by: user_id who last published
--
-- Publish flow:
--   1. Owner/admin edits → saved to brand_draft (no live impact)
--   2. "Publicar" → copies brand_draft fields to organizations.logo_url/primary_color/name
--      + sets brand_published_at = now(), brand_published_by = user_id
--   3. coaches/students read from logo_url/primary_color as before (no change needed)
--
-- Rollback: set brand_draft = null to discard unpublished draft.
--           Re-publishing previous values requires storing them — out of scope MVP.

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS brand_draft jsonb,
    ADD COLUMN IF NOT EXISTS brand_published_at timestamptz,
    ADD COLUMN IF NOT EXISTS brand_published_by uuid REFERENCES auth.users(id);

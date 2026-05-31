-- org_announcements: add audience targeting so org admins can send
-- announcements to specific groups without affecting all coaches/clients.
--
-- audience values:
--   'all'     — visible to all (coaches enterprise + clients) [default, preserves existing behavior]
--   'coaches' — only visible to enterprise coaches of this org
--   'clients' — only visible to clients of this org
--
-- Rollback: ALTER TABLE org_announcements DROP COLUMN IF EXISTS audience;

ALTER TABLE public.org_announcements
    ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'coaches', 'clients'));

-- Simple index without time-based predicate (now() not IMMUTABLE in partial indexes)
CREATE INDEX IF NOT EXISTS org_announcements_audience_idx
    ON public.org_announcements (org_id, audience, is_active);

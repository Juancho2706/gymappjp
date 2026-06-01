-- Add published_at to org_announcements for scheduled publishing.
-- published_at = NULL → publish immediately on creation (current behavior).
-- published_at <= now() → visible to clients.
-- published_at > now() → scheduled, not yet visible.

ALTER TABLE org_announcements
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Backfill: existing active announcements were published on creation.
UPDATE org_announcements
  SET published_at = created_at
  WHERE published_at IS NULL AND is_active = true;

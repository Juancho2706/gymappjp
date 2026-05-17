CREATE TABLE organization_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id),
  coach_id   uuid NOT NULL REFERENCES coaches(id),
  role       text NOT NULL CHECK (role IN ('org_owner','org_admin','coach')),
  status     text NOT NULL DEFAULT 'invited'
             CHECK (status IN ('invited','active','suspended')),
  invited_at timestamptz DEFAULT now(),
  joined_at  timestamptz,
  deleted_at timestamptz
);

-- Un coach solo puede tener UNA membresía activa por org (soft delete permite historial)
CREATE UNIQUE INDEX org_members_unique_active
  ON organization_members(coach_id, org_id)
  WHERE deleted_at IS NULL;

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

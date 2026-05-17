CREATE TABLE coach_client_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  coach_id    uuid NOT NULL REFERENCES coaches(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  deleted_at  timestamptz,
  -- Un cliente solo puede estar asignado a un coach por org (soft delete permite reasignación)
  UNIQUE(org_id, client_id)
);

ALTER TABLE coach_client_assignments ENABLE ROW LEVEL SECURITY;

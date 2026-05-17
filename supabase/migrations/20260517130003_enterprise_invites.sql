CREATE TABLE organization_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('org_admin','coach')),
  -- token_hash = encode(sha256(raw_token::bytea), 'hex') — nunca el token en plaintext
  token_hash  text UNIQUE NOT NULL,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at     timestamptz,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  deleted_at  timestamptz
);

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

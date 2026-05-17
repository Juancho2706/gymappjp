-- org_id NULL = cliente standalone (comportamiento actual intacto)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;

-- Dedup: email único por org (solo aplica a clientes enterprise)
ALTER TABLE clients ADD CONSTRAINT clients_org_email_unique UNIQUE (org_id, email);

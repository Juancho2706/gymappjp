-- pg_trgm ya habilitado — índices para búsqueda ILIKE eficiente en pool de clientes org
CREATE INDEX IF NOT EXISTS clients_name_trgm
  ON clients USING gin (full_name gin_trgm_ops)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_email_trgm
  ON clients USING gin (email gin_trgm_ops)
  WHERE org_id IS NOT NULL;

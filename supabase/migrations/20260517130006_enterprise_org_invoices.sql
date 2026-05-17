-- Facturas enterprise separadas de subscription_events (B2C standalone)
CREATE TABLE org_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  amount_clp   int NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at      timestamptz,
  payment_ref  text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- Excepciones de pago / créditos aprobados manualmente
CREATE TABLE payment_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id),
  amount_clp       int NOT NULL,
  reason           text NOT NULL,
  approved_by      uuid REFERENCES auth.users(id),
  approved_at      timestamptz DEFAULT now(),
  resend_message_id text,
  notes            text
);

-- Audit de purgas (Ley 21.719) — append-only, NUNCA borrar
CREATE TABLE purge_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,        -- sin FK: la org ya fue eliminada
  org_slug     text NOT NULL,
  purged_at    timestamptz DEFAULT now(),
  rows_deleted jsonb,
  initiated_by text DEFAULT 'cron'
);

ALTER TABLE org_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purge_audit ENABLE ROW LEVEL SECURITY;

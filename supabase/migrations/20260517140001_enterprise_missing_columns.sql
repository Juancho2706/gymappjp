-- Columnas faltantes identificadas en auditoría 2026-05-17
-- Todas usan IF NOT EXISTS para ser idempotentes

-- 1. subscription_events.org_id — vincular eventos de pago a organización enterprise
ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- 2. organizations.client_limit — límite de alumnos por org (enforcement en import/create)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS client_limit int NOT NULL DEFAULT 100;

-- 3. organizations.last_health_score — puntuación calculada por cron org-health-alert
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_health_score int;

-- 4. organizations.last_health_score_at — timestamp del último cálculo de health score
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_health_score_at timestamptz;

-- 5. org_invoices.expected_amount_clp — monto esperado para alertar divergencias en cobro manual
ALTER TABLE org_invoices
  ADD COLUMN IF NOT EXISTS expected_amount_clp int;

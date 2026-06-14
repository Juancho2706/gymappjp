-- Extiende billing_snapshots.kind para el prorrateo del UPGRADE de tier (plan estrategia 06).
-- ADITIVA / forward-only / idempotente: DROP IF EXISTS + ADD del CHECK con el set ampliado.
-- El kind 'tier_upgrade_proration' lo escribe el webhook al aprobarse el one-shot del upgrade de
-- plan (evidencia SERNAC del cobro prorrateado de la DIFERENCIA de tier). Sin esta extension el
-- upsert tira 23514 check_violation en prod (el webhook 500ea + loopea en cada redelivery de MP).
-- Existing rows ('recurring' | 'addon_proration') siguen validando: el set solo se amplia.
ALTER TABLE public.billing_snapshots DROP CONSTRAINT IF EXISTS billing_snapshots_kind_check;
ALTER TABLE public.billing_snapshots ADD CONSTRAINT billing_snapshots_kind_check
  CHECK (kind = ANY (ARRAY['recurring'::text, 'addon_proration'::text, 'tier_upgrade_proration'::text]));

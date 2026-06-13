-- Coaches gestionados por un team (pool): acceso completo sin billing individual, como org_managed.
-- (1) Ampliar el CHECK de subscription_status para permitir 'team_managed' (aditivo/idempotente).
ALTER TABLE public.coaches DROP CONSTRAINT IF EXISTS coaches_subscription_status_check;
ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_subscription_status_check
  CHECK (subscription_status IN (
    'active','inactive','trial','trialing','pending_email','pending_payment',
    'past_due','canceled','cancelled','expired','paused','org_managed','team_managed'
  ));

-- (2) Backfill: coaches provisionados para un team que quedaron como 'active'/'free' (bug previo).
-- Identificados por payment_provider='admin' + membresía de team activa. NO toca coaches reales
-- (un coach existente que se sumó a un team conserva su propia suscripción).
UPDATE public.coaches c
SET subscription_status = 'team_managed',
    subscription_tier   = 'scale',
    max_clients         = GREATEST(COALESCE(c.max_clients, 0), 500)
WHERE c.subscription_status = 'active'
  AND c.subscription_tier   = 'free'
  AND c.payment_provider    = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.coach_id = c.id AND tm.status = 'active' AND tm.deleted_at IS NULL
  );

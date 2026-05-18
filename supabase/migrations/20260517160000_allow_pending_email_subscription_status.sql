-- Allow explicit email-confirmation state for free coach registration.
-- Keeps legacy + current web states and enterprise org-managed state in one CHECK.
ALTER TABLE public.coaches
  DROP CONSTRAINT IF EXISTS coaches_subscription_status_check;

ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_subscription_status_check
  CHECK (subscription_status IN (
    'active',
    'inactive',
    'trial',
    'trialing',
    'pending_email',
    'pending_payment',
    'past_due',
    'canceled',
    'cancelled',
    'expired',
    'paused',
    'org_managed'
  ));

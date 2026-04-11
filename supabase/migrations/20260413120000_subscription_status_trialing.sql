-- Align DB with email-drip and future trial flows: allow subscription_status = 'trialing'
alter table public.coaches
  drop constraint if exists coaches_subscription_status_check;

alter table public.coaches
  add constraint coaches_subscription_status_check
  check (
    subscription_status = any (
      array[
        'active'::text,
        'trialing'::text,
        'pending_payment'::text,
        'past_due'::text,
        'canceled'::text,
        'expired'::text,
        'paused'::text
      ]
    )
  );

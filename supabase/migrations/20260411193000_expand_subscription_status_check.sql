alter table public.coaches
  drop constraint if exists coaches_subscription_status_check;

alter table public.coaches
  add constraint coaches_subscription_status_check
  check (
    subscription_status = any (
      array[
        'active'::text,
        'pending_payment'::text,
        'past_due'::text,
        'canceled'::text,
        'expired'::text,
        'paused'::text
      ]
    )
  );

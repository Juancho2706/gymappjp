-- Expand subscription_tier to include 'free' and 'growth'.
-- 'free': permanent freemium plan (0 CLP, 3 clients, no billing cycle).
-- 'growth': new paid tier between Elite and Scale (120 clients, $84.990/month).
alter table public.coaches
  drop constraint if exists coaches_subscription_tier_check;

alter table public.coaches
  add constraint coaches_subscription_tier_check
  check (
    subscription_tier = any (
      array[
        'free'::text,
        'starter'::text,
        'pro'::text,
        'elite'::text,
        'growth'::text,
        'scale'::text
      ]
    )
  );

-- Align tier limits and billing cycles with updated 2026 pricing policy.
-- 1-5, 6-10, 11-30 => monthly only
-- 31-60, 61-100 => quarterly or annual only

-- Normalize max_clients for existing coaches by tier.
update public.coaches
set max_clients = 30
where subscription_tier = 'pro'
  and coalesce(max_clients, 0) <> 30;

update public.coaches
set max_clients = 60
where subscription_tier = 'elite'
  and coalesce(max_clients, 0) <> 60;

update public.coaches
set max_clients = 100
where subscription_tier = 'scale'
  and coalesce(max_clients, 0) <> 100;

-- Enforce monthly-only cycles for starter tiers.
update public.coaches
set billing_cycle = 'monthly'
where subscription_tier in ('starter_lite', 'starter', 'pro')
  and billing_cycle in ('quarterly', 'annual');

-- Enforce quarterly/annual-only cycles for higher tiers.
-- Quarterly is used as safe fallback when an invalid monthly cycle exists.
update public.coaches
set billing_cycle = 'quarterly'
where subscription_tier in ('elite', 'scale')
  and billing_cycle = 'monthly';

-- Ops request: all current coaches are beta testers.
-- Promote existing rows to max tier for 3 years.
update public.coaches
set
    subscription_tier = 'scale',
    max_clients = 100,
    subscription_status = 'active',
    current_period_end = now() + interval '3 years',
    updated_at = now();

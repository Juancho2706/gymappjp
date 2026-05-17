-- Partial indexes for free and growth tier coaches.
-- Speeds up admin queries, webhook lookups, and analytics filtering by tier.
create index concurrently if not exists idx_coaches_free_tier
    on public.coaches (id)
    where subscription_tier = 'free';

create index concurrently if not exists idx_coaches_growth_tier
    on public.coaches (id)
    where subscription_tier = 'growth';

-- Index to accelerate finding coaches whose period has expired (used by
-- future scheduled downgrade jobs and admin expiry dashboards).
create index concurrently if not exists idx_coaches_expired_period
    on public.coaches (current_period_end)
    where subscription_status in ('canceled', 'expired')
      and current_period_end is not null;
-- Sprint 2 payments core schema
alter table public.coaches
  add column if not exists max_clients integer not null default 10,
  add column if not exists current_period_end timestamptz null,
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists payment_provider text not null default 'mercadopago';

alter table public.coaches
  drop constraint if exists coaches_billing_cycle_check;

alter table public.coaches
  add constraint coaches_billing_cycle_check
  check (billing_cycle in ('monthly', 'quarterly', 'annual'));

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  provider text not null,
  provider_event_id text unique,
  provider_checkout_id text,
  provider_status text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_events_coach_id
  on public.subscription_events(coach_id);

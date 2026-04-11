-- Sprint 5 (BETA LAUNCH): retention and operations telemetry tables.

create table if not exists public.coach_onboarding_events (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    step_key text not null,
    event_type text not null check (event_type in ('step_completed', 'step_reopened', 'aha_moment')),
    metadata jsonb,
    created_at timestamptz not null default now()
);

create index if not exists coach_onboarding_events_coach_id_idx
    on public.coach_onboarding_events (coach_id, created_at desc);

alter table public.coach_onboarding_events enable row level security;

drop policy if exists "coach_onboarding_events_coach_read_own" on public.coach_onboarding_events;
create policy "coach_onboarding_events_coach_read_own"
    on public.coach_onboarding_events
    for select
    using (auth.uid() = coach_id);

drop policy if exists "coach_onboarding_events_coach_insert_own" on public.coach_onboarding_events;
create policy "coach_onboarding_events_coach_insert_own"
    on public.coach_onboarding_events
    for insert
    with check (auth.uid() = coach_id);

create table if not exists public.coach_email_drip_events (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    template_key text not null,
    scheduled_day integer not null check (scheduled_day in (1, 3, 7, 14)),
    status text not null check (status in ('sent', 'failed', 'skipped')),
    provider_message_id text,
    error text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique (coach_id, template_key)
);

create index if not exists coach_email_drip_events_coach_id_idx
    on public.coach_email_drip_events (coach_id, created_at desc);

alter table public.coach_email_drip_events enable row level security;

drop policy if exists "coach_email_drip_events_coach_read_own" on public.coach_email_drip_events;
create policy "coach_email_drip_events_coach_read_own"
    on public.coach_email_drip_events
    for select
    using (auth.uid() = coach_id);

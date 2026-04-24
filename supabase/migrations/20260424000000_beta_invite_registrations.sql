create table if not exists public.beta_invite_registrations (
  id          uuid        primary key default gen_random_uuid(),
  ip_address  text        not null,
  email       text        not null,
  coach_id    uuid        not null references public.coaches(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index beta_invite_registrations_ip_uidx
  on public.beta_invite_registrations (ip_address);

create unique index beta_invite_registrations_email_uidx
  on public.beta_invite_registrations (lower(trim(both from email)));

alter table public.beta_invite_registrations enable row level security;

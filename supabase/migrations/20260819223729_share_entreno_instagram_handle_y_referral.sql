-- Share Entreno F1.1 (docs/specs/workout-share/): @handle del coach para el card compartido
-- + atribución first-party del alta referida por share. Aditivo, sin backfill.
-- Aplicada en LIVE el 2026-08-19 vía MCP (tx-rollback verificado antes; advisors sin hallazgos).

alter table public.coaches add column instagram_handle text
  check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- coaches usa régimen de grants column-level (outage 42501 del creador de marca):
-- UPDATE para que el coach edite su handle en Mi Marca; SELECT anon porque el branding
-- se lee también anónimo pre-login (BRANDING_COLS_RICH de apps/mobile/lib/branding.ts —
-- sin este grant el select RICH falla entero y el white-label del login cae a MIN).
grant update (instagram_handle) on public.coaches to authenticated;
grant select (instagram_handle) on public.coaches to anon;

-- Atribución: escribe SOLO el server en el insert del alta (clients ya tiene INSERT table-level;
-- sin grant UPDATE deliberadamente — nadie edita esto post-alta).
alter table public.clients
  add column referred_by_client_id uuid references public.clients(id) on delete set null,
  add column referral_source text,
  add column referral_card_kind text;

create index clients_referred_by_client_id_idx on public.clients (referred_by_client_id)
  where referred_by_client_id is not null;

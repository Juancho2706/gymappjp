-- Pricing v3 (docs/specs/pricing-v3/SPEC.md, decisión del owner 2026-08-21: 1A 2A 3A 4A 5A 6A).
-- Backfill por USO del cupo Free: todo coach Free standalone con ≤ 1 alumno activo pasa a
-- max_clients = 1. Los Free con ≥ 2 alumnos activos conservan su fila (grandfather por uso).
-- robin-coach (5/3) NO se toca (decisión B del owner, 2026-08-21). Pagadores intactos.
-- Respaldo en la misma transacción: public._bak_pricing_v3_free_limits_20260821 (coach_id, slug, max_clients_prev).
-- Rollback: update public.coaches c set max_clients = b.max_clients_prev
--           from public._bak_pricing_v3_free_limits_20260821 b where b.coach_id = c.id;
-- Verificado con tx-rollback previo (21-08 15:35Z): 31 filas (15 de 3→1, 16 de 2→1), 0 sobre cupo.
-- Aplicada en LIVE vía MCP apply_migration el 2026-08-21 (versión 20260821153527 en schema_migrations).

create table if not exists public._bak_pricing_v3_free_limits_20260821 as
  select c.id as coach_id, c.slug, c.max_clients as max_clients_prev, now() as backed_up_at
  from public.coaches c
  where c.subscription_tier = 'free'
    and c.slug not in ('evademo', 'josefit')
    and c.max_clients > 1
    and (
      select count(*) from public.clients cl
      where cl.coach_id = c.id
        and cl.is_archived = false
        and cl.org_id is null
        and cl.team_id is null
    ) <= 1;

alter table public._bak_pricing_v3_free_limits_20260821 enable row level security;
revoke all on table public._bak_pricing_v3_free_limits_20260821 from anon, authenticated;

update public.coaches c
set max_clients = 1
where c.id in (select coach_id from public._bak_pricing_v3_free_limits_20260821);

-- EVA Nutrition V2 — conversion bridge (V1 -> V2) and impersonating publish wrapper.
-- Additive: creates the V1<->V2 traceability table plus a service-role-only helper
-- that publishes through the canonical RPC while impersonating the owning coach.
-- Nothing here reads or mutates legacy V1 tables.

-- ── 1. Bridge table: one link per converted V1 plan ─────────────────────────────
create table if not exists public.nutrition_v2_conversion_links (
  id uuid primary key default gen_random_uuid(),
  v1_plan_id uuid not null unique references public.nutrition_plans(id) on delete cascade,
  v2_plan_id uuid not null references public.nutrition_plans_v2(id) on delete cascade,
  v2_version_id uuid not null references public.nutrition_plan_versions_v2(id) on delete cascade,
  coach_id uuid not null,
  client_id uuid not null,
  converted_at timestamptz not null default now(),
  last_synced_v1_updated_at timestamptz not null,
  status text not null check (status in ('converted', 'resynced')),
  fidelity jsonb not null default '{}'::jsonb check (jsonb_typeof(fidelity) = 'object')
);

create index if not exists nutrition_v2_conversion_links_v2_plan_idx
  on public.nutrition_v2_conversion_links(v2_plan_id);
create index if not exists nutrition_v2_conversion_links_client_idx
  on public.nutrition_v2_conversion_links(client_id);

-- RLS: the owning coach may read its own links (feeds the "converted plan" banner).
-- Writes are service-role only (no insert/update/delete grants to authenticated).
alter table public.nutrition_v2_conversion_links enable row level security;

revoke all on public.nutrition_v2_conversion_links from public, anon, authenticated;
grant select on public.nutrition_v2_conversion_links to authenticated;

drop policy if exists nutrition_v2_conversion_links_select on public.nutrition_v2_conversion_links;
create policy nutrition_v2_conversion_links_select
on public.nutrition_v2_conversion_links
for select
to authenticated
using (coach_id = auth.uid());

comment on table public.nutrition_v2_conversion_links is
  'Traceability of automatic V1->V2 plan conversions. One row per converted V1 plan. Read-only for the owning coach via RLS; writes are service-role only. Legacy V1 rows are never touched.';

-- ── 2. Impersonating publish wrapper (service-role only) ────────────────────────
-- The conversion driver runs as service-role but must publish through the canonical
-- coach-scoped RPC. This helper sets the coach's JWT claims LOCAL to the transaction
-- so auth.uid() resolves to the coach inside both the scope check and the publish RPC,
-- then delegates to public.publish_nutrition_plan_v2 with zero duplicated publish logic.
--
-- Impersonation is SCOPED to this function: we snapshot the caller's prior claims,
-- swap in the coach's claims for the two canonical calls, then RESTORE the prior claims
-- before returning — and also on any error via the EXCEPTION handler. This is critical
-- because request.jwt.claims is set transaction-LOCAL (is_local = true): without the
-- restore the impersonation would leak past RETURN into the rest of the per-plan
-- transaction, so the driver's follow-up service-role write into the (service-role-only)
-- links table and audit would run as the coach and hit 42501 / be mis-scoped.
--
-- We do NOT switch `role` to authenticated: can_manage_client and the publish RPC are
-- SECURITY DEFINER and read auth.uid() from request.jwt.claims (not current_user), so a
-- role swap is needless and would only be one more thing to unwind.
--
-- Lives in `public` (not `private`) so the service-role conversion driver can invoke it
-- over PostgREST — the `private` schema is not exposed (supabase/config.toml:13). Execute
-- is REVOKED from public/anon/authenticated and granted ONLY to service_role, so no
-- coach/student can reach the impersonation path; the only caller is the offline driver.
create or replace function public.nutrition_v2_convert_publish(
  p_actor uuid,
  p_plan_id uuid,
  p_version_id uuid,
  p_effective_from date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_version_plan_id uuid;
  v_published_id uuid;
  v_prior_claims text;
begin
  if p_actor is null then
    raise exception 'nutrition_v2_convert_actor_required' using errcode = '22023';
  end if;

  -- Resolve the plan's client and assert the version belongs to the plan.
  select client_id into v_client_id
  from public.nutrition_plans_v2
  where id = p_plan_id;
  if v_client_id is null then
    raise exception 'nutrition_v2_convert_plan_not_found' using errcode = 'P0002';
  end if;

  select plan_id into v_version_plan_id
  from public.nutrition_plan_versions_v2
  where id = p_version_id;
  if v_version_plan_id is null then
    raise exception 'nutrition_v2_convert_version_not_found' using errcode = 'P0002';
  end if;
  if v_version_plan_id <> p_plan_id then
    raise exception 'nutrition_v2_convert_version_plan_mismatch' using errcode = '22023';
  end if;

  -- Snapshot the caller's claims so we can restore them (impersonation must not leak).
  v_prior_claims := current_setting('request.jwt.claims', true);

  -- Impersonate the owning coach ONLY for the two canonical calls below so auth.uid()
  -- resolves to p_actor. Restored before RETURN and in the EXCEPTION handler.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );

  -- Reuse the canonical management-scope check (same guard publish itself applies).
  if not private.nutrition_v2_can_manage_client(v_client_id) then
    raise exception 'nutrition_v2_convert_scope_denied' using errcode = '42501';
  end if;

  -- Delegate to the canonical publish RPC (idempotency, supersede, same-day rederive).
  v_published_id := public.publish_nutrition_plan_v2(
    p_version_id,
    p_effective_from,
    p_idempotency_key
  );

  -- Drop the impersonation before returning: the rest of the transaction (service-role
  -- link + audit writes) must run under the caller's original identity.
  perform set_config('request.jwt.claims', coalesce(v_prior_claims, ''), true);

  return jsonb_build_object(
    'version_id', v_published_id,
    'plan_id', p_plan_id,
    'client_id', v_client_id
  );
exception
  when others then
    -- Guarantee the impersonation cannot outlive this function even on failure.
    perform set_config('request.jwt.claims', coalesce(v_prior_claims, ''), true);
    raise;
end;
$$;

-- Service-role only: strip execute from every app role, then grant it solely to
-- service_role. `revoke all from public` also removes the implicit PUBLIC execute.
revoke all on function public.nutrition_v2_convert_publish(uuid, uuid, uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.nutrition_v2_convert_publish(uuid, uuid, uuid, date, text)
  to service_role;

comment on function public.nutrition_v2_convert_publish(uuid, uuid, uuid, date, text) is
  'Service-role-only conversion helper: impersonates the owning coach via LOCAL JWT claims (restored before RETURN and on error) and publishes one draft version through the canonical public.publish_nutrition_plan_v2. No publish logic is duplicated. Execute granted to service_role only.';

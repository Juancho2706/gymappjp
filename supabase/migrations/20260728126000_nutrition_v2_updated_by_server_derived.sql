-- ============================================================================
-- EVA Nutricion V2 — NUT-034: `updated_by` deja de ser falsificable
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G4B):
--   · Las policies de INSERT exigen `created_by = auth.uid() and updated_by = auth.uid()`
--     (20260714190500:993-1003 y :1022-1034), pero las de UPDATE NO mencionan `updated_by`
--     (:1005-1013 y :1036-1047).
--   · Los triggers de identidad no lo cubren: `guard_plan_identity`
--     (20260714191000:111-130) protege id/client_id/coach_id/org_id/team_id/created_by/
--     current_published_version_id, y `guard_version_identity` (version viva en
--     20260714191500:115-136) protege id/plan_id/version_number/created_by/status/
--     published_at/published_by/publish_idempotency_key + private_notes. `updated_by` no
--     aparece en ninguno.
--   · El privilegio de columna existe explicitamente: 20260714191500:111 re-grantea
--     `updated_by` a `authenticated` sobre `nutrition_plan_versions_v2`, y
--     20260714190500:1121 grantea UPDATE de TABLA completa sobre `nutrition_plans_v2`.
--   · La columna es `uuid not null` SIN foreign key (20260714190000:20,49): se puede
--     escribir incluso un uuid inexistente.
--   · Es alcanzable: el coach mobile escribe directo a Supabase y setea la columna a mano
--     (`apps/mobile/lib/nutrition-v2-builder.ts:1074,1095`,
--      `apps/mobile/lib/nutrition-v2-quick-edit.ts:1346`, `nutrition-v2.api.ts:412`).
--   · Contraste que prueba que el patron correcto ya existia en el repo:
--     `nutrition_plan_private_notes_v2_update` (20260714191500:60-70) SI lleva
--     `with check (... and updated_by = auth.uid())`.
--
-- Impacto real: NO es fuga de datos ni cross-tenant (el actor ya tiene que pasar
-- `can_manage_client` / `can_manage_plan`). Es FALSIFICACION DE ATRIBUCION: un coach de un
-- team puede estampar el uuid de otro coach como autor, o un org_admin borrar su rastro.
-- Rompe trazabilidad / no-repudio del historial del modulo.
--
-- Fix (dos capas, ADITIVAS):
--   1. Trigger BEFORE INSERT OR UPDATE que DERIVA el actor en el servidor. Cubre tambien
--      el INSERT y no se puede rodear con un valor "correcto pero prestado".
--   2. Cinturon: las policies de UPDATE ganan `updated_by = auth.uid()`. Al ser el trigger
--      BEFORE, la policy ve el valor YA normalizado => no produce falsos rechazos.
--
-- El trigger respeta el mismo escape de rol que los guards existentes
-- (20260714191000:117): `current_user not in ('postgres','service_role','supabase_admin')`.
-- Las RPC SECURITY DEFINER que hacen `update ... set updated_by = auth.uid()`
-- (20260714190500:543,557,566; 20260716210000:158,172,181; 20260716230000:204,218,227;
-- 20260717130000:151,165,174) corren con current_user = owner de la funcion.
-- *** VERIFICAR EN PROD el owner real de esas funciones antes de aplicar ***: si alguna
-- quedo owned por otro rol, el trigger le pisaria `updated_by` con `auth.uid()`, que igual
-- es el valor correcto — pero conviene confirmarlo, no asumirlo.
--
-- Ademas se protege contra el borde `auth.uid() is null` (contextos sin JWT): en ese caso
-- el trigger NO toca la columna, para no violar el NOT NULL.
--
-- No hay backfill posible: los valores ya escritos no se pueden reauditar. Corta hacia
-- adelante.
--
-- ROLLBACK (una pasada):
--   drop trigger if exists nutrition_plans_v2_force_actor on public.nutrition_plans_v2;
--   drop trigger if exists nutrition_plan_versions_v2_force_actor on public.nutrition_plan_versions_v2;
--   -- y re-aplicar las dos policies de UPDATE de 20260714190500:1005-1013 y :1036-1047.
-- ============================================================================

create or replace function private.nutrition_v2_force_actor()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function private.nutrition_v2_force_actor() from public, anon, authenticated;

comment on function private.nutrition_v2_force_actor() is
  'Deriva created_by/updated_by del JWT en el servidor. Los roles privilegiados '
  '(postgres/service_role/supabase_admin) y los contextos sin JWT quedan exentos. NUT-034.';

drop trigger if exists nutrition_plans_v2_force_actor on public.nutrition_plans_v2;
create trigger nutrition_plans_v2_force_actor
before insert or update on public.nutrition_plans_v2
for each row execute function private.nutrition_v2_force_actor();

drop trigger if exists nutrition_plan_versions_v2_force_actor on public.nutrition_plan_versions_v2;
create trigger nutrition_plan_versions_v2_force_actor
before insert or update on public.nutrition_plan_versions_v2
for each row execute function private.nutrition_v2_force_actor();

-- ── Cinturon: las policies de UPDATE exigen el actor real ────────────────────
--    Base VERBATIM de 20260714190500:1005-1013 y :1036-1047. UNICO agregado:
--    `and updated_by = auth.uid()` en el WITH CHECK (espejo de
--    nutrition_plan_private_notes_v2_update, 20260714191500:69).
drop policy if exists nutrition_plans_v2_update on public.nutrition_plans_v2;
create policy nutrition_plans_v2_update
on public.nutrition_plans_v2
for update
to authenticated
using (private.nutrition_v2_can_manage_client(client_id))
with check (
  private.nutrition_v2_can_manage_client(client_id)
  and private.nutrition_v2_plan_scope_matches_client(client_id, coach_id, org_id, team_id)
  and updated_by = auth.uid()
);

drop policy if exists nutrition_plan_versions_v2_update on public.nutrition_plan_versions_v2;
create policy nutrition_plan_versions_v2_update
on public.nutrition_plan_versions_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(id))
with check (
  status = 'draft'
  and private.nutrition_v2_can_manage_plan(plan_id)
  and published_at is null
  and published_by is null
  and publish_idempotency_key is null
  and updated_by = auth.uid()
);

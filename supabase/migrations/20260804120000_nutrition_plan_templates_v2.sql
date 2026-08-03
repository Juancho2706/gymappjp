-- ============================================================================
-- EVA Nutricion — F3: plantillas de plan V2 (y destino del rescate de las V1)
-- Spec: specs/nutrition-plan-templates-v2/SPEC.md (AD-2) · Tarea: TASKS.md T1.1
-- ----------------------------------------------------------------------------
-- PROBLEMA. El `+` del Centro V2 SIEMPRE exige un alumno y `nutrition_plans_v2.
-- client_id` es NOT NULL: no existe forma de empezar un plan sin alumno ni de
-- reutilizar uno hecho. Ademas, el swap a V2 dejo inaccesibles 33 plantillas /
-- 142 comidas de 4 coaches que vivian en la biblioteca V1.
--
-- AD-2. La plantilla NO es un plan fantasma: `client_id` sigue NOT NULL y la
-- plantilla vive en su propia tabla guardando el DRAFT SERIALIZADO que el
-- builder ya sabe producir (draft-builder.ts) y rehidratar (rehydrate.ts).
-- DESCARTADO relajar `client_id`: media docena de RPC y read-models asumen que
-- un plan tiene alumno, y un plan sin dueno se colaria en snapshots y gates.
--
-- El `draft` se guarda SIN IDENTIDAD (sin planId/versionId/clientId y sin los
-- ids de variantes, franjas, items y targets). Si los conservara, al persistir
-- el builder intentaria ACTUALIZAR filas de otro plan. Eso lo garantiza el
-- contrato (`stripDraftIdentity`), y aca queda `schema_version` para poder
-- migrar drafts viejos sin adivinar su forma.
--
-- ADITIVA / forward-only. Rollback al pie.
-- ============================================================================

create table public.nutrition_plan_templates_v2 (
  id                 uuid primary key default gen_random_uuid(),

  -- Dueno: exactamente uno. F3 escribe siempre coach-scoped (igual que F1/F2);
  -- team_id y org_id existen para que el pool y la org las usen sin migrar otra vez.
  coach_id           uuid references public.coaches(id) on delete cascade,
  team_id            uuid references public.teams(id) on delete cascade,
  org_id             uuid references public.organizations(id) on delete cascade,

  name               text not null,
  description        text,
  strategy           text not null,

  -- Draft serializado SIN identidad. Se valida con Zod al guardar Y al rehidratar:
  -- es JSON client-controlled y nunca se confia en lo que quedo escrito.
  draft              jsonb not null,
  schema_version     integer not null default 1,

  -- Resumen para la biblioteca (kcal/P/C/G del dia base + cuantas franjas). Se
  -- guarda calculado para no parsear 33 drafts en cada render del Centro V2.
  summary            jsonb,

  source             text not null default 'builder',
  source_plan_id     uuid references public.nutrition_plans_v2(id) on delete set null,
  -- Idempotencia del importador one-shot: la misma plantilla V1 nunca entra dos veces.
  legacy_template_id uuid references public.nutrition_plan_templates(id) on delete set null,

  is_favorite        boolean not null default false,
  usage_count        integer not null default 0 check (usage_count >= 0),

  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  constraint npt2_owner_exactly_one check (
    (case when coach_id is null then 0 else 1 end)
    + (case when team_id is null then 0 else 1 end)
    + (case when org_id is null then 0 else 1 end) = 1
  ),
  constraint npt2_name_len check (char_length(btrim(name)) between 1 and 180),
  constraint npt2_description_len check (description is null or char_length(description) <= 2000),
  constraint npt2_strategy_valid check (strategy in ('structured', 'hybrid', 'flexible')),
  constraint npt2_source_valid check (source in ('builder', 'plan', 'import_v1')),
  constraint npt2_draft_is_object check (jsonb_typeof(draft) = 'object')
);

comment on table public.nutrition_plan_templates_v2 is
  'Plantillas de plan de Nutricion V2: draft serializado SIN identidad (sin ids de '
  'plan/version/cliente ni de sus filas hijas) + schema_version. No es un plan: '
  'nutrition_plans_v2.client_id sigue NOT NULL.';
comment on column public.nutrition_plan_templates_v2.legacy_template_id is
  'Plantilla V1 de origen. Unico entre filas vivas: el importador one-shot es idempotente.';
comment on column public.nutrition_plan_templates_v2.usage_count is
  'Cuantos planes salieron de esta plantilla. Es la señal que ordena la biblioteca.';

-- Idempotencia del importador SOLO entre filas vivas: si el coach borra la
-- plantilla importada y se vuelve a correr el importador, se restaura.
create unique index npt2_legacy_template_uq
  on public.nutrition_plan_templates_v2 (legacy_template_id)
  where legacy_template_id is not null and deleted_at is null;

create index npt2_coach_idx on public.nutrition_plan_templates_v2 (coach_id) where coach_id is not null;
create index npt2_team_idx on public.nutrition_plan_templates_v2 (team_id) where team_id is not null;
create index npt2_org_idx on public.nutrition_plan_templates_v2 (org_id) where org_id is not null;
create index npt2_source_plan_idx on public.nutrition_plan_templates_v2 (source_plan_id) where source_plan_id is not null;

create trigger nutrition_plan_templates_v2_set_updated_at
before update on public.nutrition_plan_templates_v2
for each row execute function private.nutrition_v2_set_updated_at();

-- Grants: REVOKE total + explicitos. UPDATE column-level (AGENTS.md): la
-- procedencia (`source`, `legacy_template_id`, `source_plan_id`) y el dueno son
-- inmutables desde la app.
alter table public.nutrition_plan_templates_v2 enable row level security;
revoke all on public.nutrition_plan_templates_v2 from public, anon, authenticated;
grant select, insert on public.nutrition_plan_templates_v2 to authenticated;
grant update (name, description, draft, schema_version, summary, strategy, is_favorite, usage_count, deleted_at)
  on public.nutrition_plan_templates_v2 to authenticated;
grant all on public.nutrition_plan_templates_v2 to service_role;

-- RLS. El ALUMNO no tiene ninguna policy: una plantilla es material interno del
-- coach y jamas debe aparecer en una superficie de alumno.
create policy npt2_select_own on public.nutrition_plan_templates_v2
for select to authenticated
using (deleted_at is null and coach_id = (select auth.uid()));

create policy npt2_select_team on public.nutrition_plan_templates_v2
for select to authenticated
using (deleted_at is null and team_id is not null and team_id in (select public.current_user_team_ids()));

create policy npt2_select_org on public.nutrition_plan_templates_v2
for select to authenticated
using (deleted_at is null and org_id is not null and public.is_active_org_member(org_id));

create policy npt2_insert_own on public.nutrition_plan_templates_v2
for insert to authenticated
with check (coach_id = (select auth.uid()) and team_id is null and org_id is null);

create policy npt2_insert_team on public.nutrition_plan_templates_v2
for insert to authenticated
with check (
  team_id is not null and coach_id is null and org_id is null
  and team_id in (select public.current_user_managed_team_ids())
);

create policy npt2_insert_org on public.nutrition_plan_templates_v2
for insert to authenticated
with check (org_id is not null and coach_id is null and team_id is null and public.is_org_admin_member(org_id));

create policy npt2_update_own on public.nutrition_plan_templates_v2
for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

create policy npt2_update_team on public.nutrition_plan_templates_v2
for update to authenticated
using (team_id is not null and team_id in (select public.current_user_managed_team_ids()))
with check (team_id is not null);

create policy npt2_update_org on public.nutrition_plan_templates_v2
for update to authenticated
using (org_id is not null and public.is_org_admin_member(org_id))
with check (org_id is not null);

create policy npt2_service on public.nutrition_plan_templates_v2
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- Sin policy de DELETE a proposito: borrar es soft-delete (`deleted_at`), que ya
-- cubre `npt2_update_*`. Un DELETE fisico perderia la trazabilidad del rescate V1.

-- ============================================================================
-- ROLLBACK: drop table if exists public.nutrition_plan_templates_v2 cascade;
-- ============================================================================

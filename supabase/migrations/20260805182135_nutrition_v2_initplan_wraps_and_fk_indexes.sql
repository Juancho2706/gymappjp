-- MIG-D (2026-08-05): higiene post-runbook RLS.
-- Parte 1: advisor auth_rls_initplan — 11 llamadas auth.uid() sin wrap en 8 policies de
-- nutricion v2 pasan a (select auth.uid()) para evaluarse UNA vez como InitPlan por query
-- en vez de por fila. Expresiones copiadas VERBATIM de pg_policies (LIVE 2026-08-05) con el
-- wrap como unico cambio — semantica identica por construccion.
-- OJO mantenimiento: supabase/tests/nutrition_v2_set_based_rollback.sql se actualiza en el
-- mismo commit para conservar el wrap en nutrition_plans_v2_select; los tests de equivalencia
-- NO cubren las 7 policies de escritura (validacion = planner + expresion verbatim).

alter policy "nutrition_plans_v2_select" on public.nutrition_plans_v2
  using (
    (((select auth.uid()) = client_id) and (current_published_version_id is not null))
    or private.nutrition_v2_can_manage_client(client_id)
  );

alter policy "nutrition_plans_v2_insert" on public.nutrition_plans_v2
  with check (
    private.nutrition_v2_can_manage_client(client_id)
    and private.nutrition_v2_plan_scope_matches_client(client_id, coach_id, org_id, team_id)
    and (created_by = (select auth.uid()))
    and (updated_by = (select auth.uid()))
    and (current_published_version_id is null)
  );

alter policy "nutrition_plans_v2_update" on public.nutrition_plans_v2
  with check (
    private.nutrition_v2_can_manage_client(client_id)
    and private.nutrition_v2_plan_scope_matches_client(client_id, coach_id, org_id, team_id)
    and (updated_by = (select auth.uid()))
  );

alter policy "nutrition_plan_versions_v2_insert" on public.nutrition_plan_versions_v2
  with check (
    (status = 'draft'::text)
    and private.nutrition_v2_can_manage_plan(plan_id)
    and (created_by = (select auth.uid()))
    and (updated_by = (select auth.uid()))
    and (published_at is null)
    and (published_by is null)
    and (publish_idempotency_key is null)
  );

alter policy "nutrition_plan_versions_v2_update" on public.nutrition_plan_versions_v2
  with check (
    (status = 'draft'::text)
    and private.nutrition_v2_can_manage_plan(plan_id)
    and (published_at is null)
    and (published_by is null)
    and (publish_idempotency_key is null)
    and (updated_by = (select auth.uid()))
  );

alter policy "nutrition_plan_private_notes_v2_insert" on public.nutrition_plan_private_notes_v2
  with check (
    private.nutrition_v2_private_note_scope_matches(version_id, client_id)
    and (created_by = (select auth.uid()))
    and (updated_by = (select auth.uid()))
  );

alter policy "nutrition_plan_private_notes_v2_update" on public.nutrition_plan_private_notes_v2
  with check (
    private.nutrition_v2_private_note_scope_matches(version_id, client_id)
    and (updated_by = (select auth.uid()))
  );

alter policy "nutrition_v2_conversion_links_select" on public.nutrition_v2_conversion_links
  using (coach_id = (select auth.uid()));

-- Parte 2: advisor unindexed_foreign_keys — 8 indices de cobertura (tablas nutricion v2,
-- todas chicas: CREATE INDEX plano, lock despreciable). Los compuestos espejan las columnas
-- del FK en su orden.
create index if not exists idx_exchange_group_foods_created_by
  on public.exchange_group_foods (created_by);
create index if not exists idx_food_catalog_import_rows_resolved_food_id
  on public.food_catalog_import_rows (resolved_food_id);
create index if not exists idx_food_catalog_missing_codes_resolved_food_id
  on public.food_catalog_missing_codes (resolved_food_id);
create index if not exists idx_nis_prescription_item_version
  on public.nutrition_item_substitutions_v2 (prescription_item_id, version_id);
create index if not exists idx_meal_slots_v2_variant_version
  on public.nutrition_meal_slots_v2 (day_variant_id, version_id);
create index if not exists idx_plan_templates_v2_created_by
  on public.nutrition_plan_templates_v2 (created_by);
create index if not exists idx_prescription_items_v2_slot_version
  on public.nutrition_prescription_items_v2 (meal_slot_id, version_id);
create index if not exists idx_slot_exchange_targets_v2_slot_version
  on public.nutrition_slot_exchange_targets_v2 (meal_slot_id, version_id);

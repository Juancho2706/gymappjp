-- =============================================================================
-- Indices de cobertura para FKs del write-path de nutricion / porciones V2.
-- Origen: docs/audits/db-salud-2026-07-18.md (P1) — extraido de la PROPUESTA
--         20260718160000_db_salud_followups.PROPUESTA con nombres de columna
--         VERIFICADOS contra el esquema vivo (pg_constraint / information_schema)
--         el 2026-07-19. La propuesta original infirio 5 nombres mal (ver nota).
--
-- Que resuelve: unindexed_foreign_keys (performance advisor, nivel INFO) en las
--   FKs del write-path que van a crecer con cada plan, version, snapshot e
--   ingesta del alumno. Sin indice de cobertura el planner cae a seq-scan y los
--   ON DELETE / joins por FK escalan O(filas).
--
-- Por que AHORA: las tablas estan casi vacias (decenas a ~120 filas, de los 5
--   planes convertidos + QA). Construir el indice cuesta <1 ms y unos KB. Indexar
--   en caliente cuando crezcan gasta Disk IO, que es presupuesto escaso en Micro.
--
-- Por que SIN CONCURRENTLY: esta migracion la aplica Supabase (apply_migration)
--   DENTRO de una transaccion, y CREATE INDEX CONCURRENTLY no puede correr en tx.
--   A este tamano (<=~120 filas) el CREATE INDEX plano toma un ACCESS EXCLUSIVE
--   sub-milisegundo — el lock es despreciable y la migracion queda atomica /
--   rolleable. Si alguna de estas tablas ya tuviera millones de filas habria que
--   sacar la sentencia de la tx y usar CONCURRENTLY; hoy NO es el caso.
--
-- IF NOT EXISTS en cada una: idempotente y seguro de reaplicar.
--
-- NO incluye (decision del informe, ver PROPUESTA residual):
--   * FKs compuestas de porciones {meal_slot_id,version_id} /
--     {day_variant_id,version_id} de nutrition_slot_exchange_targets_v2,
--     nutrition_prescription_items_v2 y nutrition_meal_slots_v2: cubiertas por el
--     prefijo (leading column) de sus indices UNIQUE/orden existentes (§A3).
--   * Import de catalogo (food_catalog_import_rows / _missing_codes .resolved_food_id):
--     baja frecuencia y 0 filas; queda opcional en la PROPUESTA residual.
--   * DROP de tablas _bak: agendado ~22-jul, fuera de esta migracion.
-- =============================================================================

-- Ingesta del alumno: la tabla que mas va a crecer.
-- FK nutrition_intake_entries_v2_corrected_by_fkey -> nutrition_intake_entries.id
-- (self-FK de la cadena de correcciones). El otro self-FK, corrects_entry_id, YA
-- esta cubierto por nutrition_intake_entries_v2_correction_idx.
CREATE INDEX IF NOT EXISTS ix_nutrition_intake_entries_corrected_by_entry_id
  ON public.nutrition_intake_entries (corrected_by_entry_id);

-- Snapshots diarios (crecen 1/dia/alumno activo).
-- FK nutrition_day_snapshots_v2_plan_id_fkey -> nutrition_plans_v2.id
CREATE INDEX IF NOT EXISTS ix_nutrition_day_snapshots_v2_plan_id
  ON public.nutrition_day_snapshots_v2 (plan_id);
-- FK nutrition_day_snapshots_v2_day_variant_id_fkey -> nutrition_day_variants_v2.id
CREATE INDEX IF NOT EXISTS ix_nutrition_day_snapshots_v2_day_variant_id
  ON public.nutrition_day_snapshots_v2 (day_variant_id);

-- Audit log (crece con cada cambio de plan/ingesta).
-- FK nutrition_v2_audit_log_plan_id_fkey -> nutrition_plans_v2.id
CREATE INDEX IF NOT EXISTS ix_nutrition_v2_audit_log_plan_id
  ON public.nutrition_v2_audit_log (plan_id);
-- FK nutrition_v2_audit_log_intake_entry_id_fkey -> nutrition_intake_entries.id
CREATE INDEX IF NOT EXISTS ix_nutrition_v2_audit_log_intake_entry_id
  ON public.nutrition_v2_audit_log (intake_entry_id);

-- Versionado de plan (crece con cada version publicada).
-- FK nutrition_plan_versions_v2_parent_version_id_fkey -> nutrition_plan_versions_v2.id
CREATE INDEX IF NOT EXISTS ix_nutrition_plan_versions_v2_parent_version_id
  ON public.nutrition_plan_versions_v2 (parent_version_id);

-- Puntero a la version publicada vigente del plan.
-- FK nutrition_plans_v2_current_version_fkey -> nutrition_plan_versions_v2.id
-- (columna real: current_published_version_id, NO "current_version").
CREATE INDEX IF NOT EXISTS ix_nutrition_plans_v2_current_published_version_id
  ON public.nutrition_plans_v2 (current_published_version_id);

-- Enlace de conversion V1->V2 (uno por plan convertido).
-- FK nutrition_v2_conversion_links_v2_version_id_fkey -> nutrition_plan_versions_v2.id
-- (tabla real: nutrition_v2_conversion_links, sin sufijo _v2).
CREATE INDEX IF NOT EXISTS ix_nutrition_v2_conversion_links_v2_version_id
  ON public.nutrition_v2_conversion_links (v2_version_id);


-- -----------------------------------------------------------------------------
-- ROLLBACK (comentado). Reaplicable; DROP INDEX IF EXISTS es seguro.
-- -----------------------------------------------------------------------------
-- DROP INDEX IF EXISTS public.ix_nutrition_intake_entries_corrected_by_entry_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_day_snapshots_v2_plan_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_day_snapshots_v2_day_variant_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_v2_audit_log_plan_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_v2_audit_log_intake_entry_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_plan_versions_v2_parent_version_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_plans_v2_current_published_version_id;
-- DROP INDEX IF EXISTS public.ix_nutrition_v2_conversion_links_v2_version_id;

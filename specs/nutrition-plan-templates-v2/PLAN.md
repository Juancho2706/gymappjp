# PLAN — Plantillas de plan V2 y rescate de las V1 (F3)

1. **DB** (`supabase/migrations/2026080410xxxx_nutrition_plan_templates_v2.sql`): tabla
   `nutrition_plan_templates_v2` (draft jsonb + `schema_version` + resumen de macros + procedencia +
   `legacy_template_id` unico para idempotencia del importador), RLS por coach/team/org, grants con
   `GRANT UPDATE` column-level, indices, trigger de `updated_at`. Aditiva y forward-only.
2. **Contratos** (`packages/nutrition-v2/plan-templates.ts`): `NutritionPlanTemplateDraftSchema`
   (el draft SIN identidad), `stripDraftIdentity()`, `hydrateTemplateDraft()`,
   `summarizeTemplateDraft()` y `TEMPLATE_SCHEMA_VERSION`. Puros: los reusan web, RN y el importador.
3. **Repository** (`apps/web/src/infrastructure/db/plan-templates.repository.ts`): listar, leer,
   insertar, renombrar, favorito, contador de uso, soft-delete, upsert por `legacy_template_id`.
4. **Service** (`apps/web/src/services/nutrition-v2/plan-templates.service.ts`): validacion del draft
   en los dos sentidos, resolucion del dueno por workspace, tope de plantillas por coach.
5. **Server actions** en `coach/nutrition-v2/_actions/plan-templates.actions.ts` + carga del draft de
   origen en el builder (`?from=template:<id>` / `?from=plan:<id>`).
6. **UI**: "Guardar como plantilla" en el builder y en la ficha del plan; modal de dos pestañas en el
   `+` del Centro V2; biblioteca en el Centro V2.
7. **Importador** (`scripts/nutrition-v1-templates/`): dry-run con reporte por coach, luego escritura
   idempotente. Reusa el mapeo de `scripts/nutrition-v2-conversion`.
8. **Tests**: contratos puros (strip/hydrate/summarize), servicio, actions, importador con fixtures.

## Riesgos y como se cubren

| Riesgo | Cobertura |
|---|---|
| El draft de la plantilla arrastra ids y el builder pisa el plan original | `stripDraftIdentity()` + test que falla si aparece cualquier `id` |
| Un draft guardado con un contrato viejo revienta el builder | `schema_version` + re-validacion Zod al rehidratar; si no valida, error claro y la plantilla no se abre |
| El importador corre dos veces | `legacy_template_id` unico + `on conflict do nothing` |
| El importador pierde plantillas sin comidas | Se importan igual (caso mindgym) y el reporte las nombra |
| Una plantilla se cuela a otro coach | RLS por dueno + tests de aislamiento; el alumno no tiene policy alguna |

## Punto de no retorno

Ninguno: la tabla es nueva, el importador no borra las V1 y la biblioteca es aditiva sobre el hub.

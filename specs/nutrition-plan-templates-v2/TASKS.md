# TASKS — Plantillas de plan V2 y rescate de las V1 (F3)

## T1 — DB
- [ ] T1.1 Migracion `nutrition_plan_templates_v2` (tabla + RLS + grants column-level + indices + trigger).
- [ ] T1.2 `BEGIN/ROLLBACK` en LIVE, aplicar, advisors, `database.types.ts` al dia.

## T2 — Contratos compartidos
- [ ] T2.1 `packages/nutrition-v2/plan-templates.ts`: schema del draft sin identidad + `TEMPLATE_SCHEMA_VERSION`.
- [ ] T2.2 `stripDraftIdentity()` / `hydrateTemplateDraft()` / `summarizeTemplateDraft()` + tests.

## T3 — Backend web
- [ ] T3.1 `plan-templates.repository.ts`.
- [ ] T3.2 `plan-templates.service.ts` (validacion doble, dueno, tope por coach, contador de uso).
- [ ] T3.3 Server actions: guardar, listar, renombrar, favorito, eliminar, cargar draft de origen.
- [ ] T3.4 Builder: soporte de `?from=template:<id>` y `?from=plan:<id>`.

## T4 — UI web
- [ ] T4.1 "Guardar como plantilla" desde el builder y desde un plan publicado.
- [ ] T4.2 Modal de dos pestañas (Desde cero / Reutilizar) en el `+` del Centro V2.
- [ ] T4.3 Biblioteca de plantillas en el Centro V2.

## T5 — Rescate de las V1
- [ ] T5.1 Importador con dry-run y reporte por coach.
- [ ] T5.2 Ejecucion real (33 plantillas / 142 comidas) tras revisar el reporte con el CEO.
- [ ] T5.3 Avisar a joaquinamr7.

## T6 — Cierre
- [ ] T6.1 Tests (contratos, servicio, actions, importador).
- [ ] T6.2 Gates completos.
- [ ] T6.3 Docs canonicos afectados.

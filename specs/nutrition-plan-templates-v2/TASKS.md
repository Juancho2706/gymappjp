# TASKS — Plantillas de plan V2 y rescate de las V1 (F3)

## T1 — DB
- [x] T1.1 Migracion `nutrition_plan_templates_v2` (tabla + RLS + grants column-level + indices + trigger).
- [x] T1.2 `BEGIN/ROLLBACK` en LIVE, APLICADA, advisors sin hallazgos nuevos, `database.types.ts` al dia.

## T2 — Contratos compartidos
- [x] T2.1 `packages/nutrition-v2/plan-templates.ts` + `TEMPLATE_SCHEMA_VERSION`.
- [x] T2.2 `stripDraftIdentity()` / `hydrateTemplateDraft()` / `summarizeTemplateDraft()` + 14 tests.
- [x] T2.3 Envoltorio `{schemaVersion, draft, builder?}` (`NutritionPlanTemplatePayloadSchema`).
      El contrato de item NO lleva macros ⇒ un item libre las perderia; `builder` las conserva.

## T3 — Backend web
- [x] T3.1 `plan-templates.repository.ts`.
- [x] T3.2 `plan-templates.service.ts` (validacion Zod al guardar Y al abrir, tope por coach, contador de uso).
- [x] T3.3 Server actions: listar, guardar, renombrar, favorito, eliminar, guardar desde el plan de un alumno.
- [x] T3.4 Builder: `?from=template:<templateId>` y `?from=plan:<clientId>`.
      OJO: en `plan:` el id es el del ALUMNO, no el del plan — `nutrition_plans_v2` no esta en
      `database.types.ts` (todo el stack V2 va por RPC), asi que no hay lectura tipada de esa tabla.

## T4 — UI web
- [x] T4.1 "Guardar como plantilla" desde el plan vigente de un alumno (biblioteca del hub).
- [x] T4.2 Modal de dos pestañas (Desde cero / Reutilizar) en el `+` del Centro V2.
- [x] T4.3 Biblioteca de plantillas (pestaña nueva del hub): renombrar, favorita, eliminar.
- [x] T4.4 Boton "Guardar como plantilla" DENTRO del builder, sobre el borrador en pantalla
      (paso de dias, dialogo nombre+descripcion, `source: 'builder'`, error del servidor inline).
- [x] T4.5 Crear plantilla DESDE CERO sin alumno (pedido CEO 08-04): ruta
      `/coach/nutrition-v2/plantillas/builder` (+`?template=<id>` para editar), modo plantilla en
      `PlanBuilderClient` (`templateMode`), acciones coach-scoped de catalogo/grupos,
      `updatePlanTemplateDraft` en service+repository, altas "Nueva plantilla"/"Desde un alumno"
      y accion Editar en la biblioteca. Anti-duplicado via `history.replaceState`.
- [x] T4.6 Pasada UX desktop (pedido CEO 08-04): `QeBottomSheet` renderiza Dialog centrado en
      `md+` (todos los modales del quick-edit), FoodPicker/GroupPicker compactos, resultados de
      busqueda del builder en fila compacta con thumb 64px, y el picker "Agregar grupo" del
      quick-edit ofrece TODO el catalogo del coach (no solo los grupos del plan).

## T5 — Rescate de las V1
- [x] T5.1 Importador con dry-run y reporte por coach (`scripts/nutrition-v1-templates/import-v1-templates.sql`).
- [x] T5.2 Ejecutado en LIVE: 33 plantillas / 142 franjas / 494 items. Idempotencia re-verificada.
- [ ] T5.3 **Avisar a joaquinamr7** que sus 10 plantillas estan de vuelta.

## T6 — Cierre
- [x] T6.1 Tests de contratos + forma exacta del payload del importador.
- [x] T6.2 Gates: 5111 tests, tsc web y mobile, lint 0 errores, tokens, boundaries, docs.
- [x] T6.3 `docs/status/CURRENT.md` y `docs/status/MOBILE_PARITY.md` actualizados.
- [ ] T6.4 QA visual: nadie abrio la biblioteca ni el modal de dos pestañas en un navegador.
- [ ] T6.5 Desplegar (4 commits locales en `master`, sin push).

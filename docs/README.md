---
status: active
owner: platform
last_verified: "2026-09-23"
canonical: true
---

# EVA documentation

Leer primero [CURRENT.md](status/CURRENT.md). Este es el único índice manual del proyecto.

## Fuentes canónicas

| Tema | Documento |
|---|---|
| Estado y siguiente trabajo | [status/CURRENT.md](status/CURRENT.md) |
| Producto, actores y capacidades | [product/PRODUCT_OVERVIEW.md](product/PRODUCT_OVERVIEW.md) |
| Estructura y dependencias | [architecture/PROJECT_STRUCTURE.md](architecture/PROJECT_STRUCTURE.md) |
| Flujos, permisos y componentes | [architecture/FLOWS_AND_COMPONENTS.md](architecture/FLOWS_AND_COMPONENTS.md) |
| Tokens de diseño web/native | [architecture/design-system/TOKENS.md](architecture/design-system/TOKENS.md) |
| Paridad web ↔ React Native | [status/MOBILE_PARITY.md](status/MOBILE_PARITY.md) |
| Pruebas y gates | [testing/TEST_STATUS.md](testing/TEST_STATUS.md) |
| Personas E2E | [testing/E2E_PERSONAS.md](testing/E2E_PERSONAS.md) |
| Acciones manuales pendientes | [operations/MANUAL_TASKS.md](operations/MANUAL_TASKS.md) |
| Incidentes y operación | [operations/RUNBOOK.md](operations/RUNBOOK.md) |

## Runbooks especializados

- [Nutrition V2 cutover](operations/NUTRITION_V2_CUTOVER_RUNBOOK.md)
- [Importación del catálogo chileno](operations/FOOD_CATALOG_CL_IMPORT.md)
- [Releases OTA móvil](operations/MOBILE_RELEASES_OTA.md)
- [Checklist DB de paridad RN](operations/RN-PARITY-DB-CHECKLIST.md)
- [Notas seguras para revisión de stores](operations/APP_REVIEW_NOTES.md)
- [QA con Playwright contra producción (modo suave)](operations/QA_PLAYWRIGHT.md)

## Evidencia e historia

- [Política de auditorías](audits/README.md)
- [Política de archivo](archive/README.md)
- [Investigación conservada](research/README.md)

Estas carpetas aportan contexto puntual o trazabilidad; nunca reemplazan estado, runbooks ni specs activas.

## Legal

- [Términos de servicio](legal/tos.md)
- [Política de privacidad](legal/privacy-policy.md)
- [Contrato Enterprise](legal/enterprise-contract-template.md) — histórico: Enterprise se eliminó de EVA el 2026-09-01; no usar

Los textos legales requieren revisión humana antes de cambios productivos.

## Specs

Toda feature nueva va en `docs/specs/<feature>/` (`SPEC.md`, `PLAN.md`, `TASKS.md`; plantillas en
[specs/_templates](../specs/_templates/SPEC.md)) y declara `status` en el frontmatter de su `SPEC.md`.

Las specs cerradas **no se mueven de carpeta**: el código cita sus rutas en comentarios (unos 190 archivos,
incluidas migraciones ya aplicadas que no se editan). Quedan en su lugar con `status: done` o `superseded`,
son históricas y no gobiernan trabajo nuevo sin revalidar contra HEAD. El árbol `specs/` de la raíz es el
legado anterior a `docs/specs/`: congelado, solo consulta; no se crean specs nuevas ahí.

Índice por estado (generado del frontmatter el 2026-09-23; al cambiar un `status`, actualizar esta lista):

- **En ejecución o esperando QA del owner (`active`):** [android-113-play](specs/android-113-play/SPEC.md) · [coach-onboarding-v2](specs/coach-onboarding-v2/SPEC.md) · [despegue-rapido](specs/despegue-rapido/SPEC.md) · [dossier-por-meses](specs/dossier-por-meses/SPEC.md) · [embudo-free-pro](specs/embudo-free-pro/SPEC.md) · [flujo-coach-nuevo](specs/flujo-coach-nuevo/SPEC.md) · [meta-app-events-ios](specs/meta-app-events-ios/SPEC.md) · [reps-tras-el-reloj](specs/reps-tras-el-reloj/SPEC.md) · [retiro-starter-y-enterprise](specs/retiro-starter-y-enterprise/SPEC.md)
- **Implementadas, falta QA (`implemented-pending-qa`):** [entrada-dark-v1](specs/entrada-dark-v1/SPEC.md) · [library-new-choice](specs/library-new-choice/SPEC.md)
- **Borrador o bloqueadas (`draft`):** [cierre-sentry-vivos](specs/cierre-sentry-vivos/SPEC.md) · [coach-leads](specs/coach-leads/SPEC.md) · [cobros-coach-alumno](specs/cobros-coach-alumno/SPEC.md) · [live-updates-a16](specs/live-updates-a16/SPEC.md) · [workout-share](specs/workout-share/SPEC.md)
- **Cerradas (`done`):** [arreglos-chicos-pre-ota](specs/arreglos-chicos-pre-ota/SPEC.md) · [ciclo-real-y-por-lado](specs/ciclo-real-y-por-lado/SPEC.md) · [cuenta-atras-en-pantalla](specs/cuenta-atras-en-pantalla/SPEC.md) · [ejercicios-propios-web](specs/ejercicios-propios-web/SPEC.md) · [eva-seal-background](specs/eva-seal-background/SPEC.md) · [meta-pixel](specs/meta-pixel/SPEC.md) · [nutrition-authoring-speed](specs/nutrition-authoring-speed/SPEC.md) · [nutrition-cantidades-honestas](specs/nutrition-cantidades-honestas/SPEC.md) · [nutrition-coach-notes](specs/nutrition-coach-notes/SPEC.md) · [nutrition-editor-cabina](specs/nutrition-editor-cabina/SPEC.md) · [nutrition-exchange-swap](specs/nutrition-exchange-swap/SPEC.md) · [nutrition-flows-redesign](specs/nutrition-flows-redesign/SPEC.md) · [nutrition-food-hub](specs/nutrition-food-hub/SPEC.md) · [nutrition-food-overrides](specs/nutrition-food-overrides/SPEC.md) · [nutrition-onboarding-tour](specs/nutrition-onboarding-tour/SPEC.md) · [nutrition-porciones-chilenas](specs/nutrition-porciones-chilenas/SPEC.md) · [nutrition-student-reskin](specs/nutrition-student-reskin/SPEC.md) · [nutrition-substitution-intake](specs/nutrition-substitution-intake/SPEC.md) · [nutrition-substitutions](specs/nutrition-substitutions/SPEC.md) · [nutrition-ui-poda](specs/nutrition-ui-poda/SPEC.md) · [nutrition-unified-editor](specs/nutrition-unified-editor/SPEC.md) · [nutrition-week-view](specs/nutrition-week-view/SPEC.md) · [ola-de-orden](specs/ola-de-orden/SPEC.md) · [plan-vivo-y-guardado](specs/plan-vivo-y-guardado/SPEC.md) · [pricing-v3](specs/pricing-v3/SPEC.md) · [qa-ejecutor-share-0209](specs/qa-ejecutor-share-0209/SPEC.md) · [senales-honestas-coach](specs/senales-honestas-coach/SPEC.md) · [share-bloque](specs/share-bloque/SPEC.md) · [vive-tu-app-directo](specs/vive-tu-app-directo/SPEC.md) · [vuelta-nueva-salud-y-reloj](specs/vuelta-nueva-salud-y-reloj/SPEC.md) · [whitelabel-color-consolidation](specs/whitelabel-color-consolidation/SPEC.md) · [workout-day-in-progress](specs/workout-day-in-progress/SPEC.md)
- **Reemplazadas (`superseded`):** [pricing-v2](specs/pricing-v2/SPEC.md)
- **Legado `specs/` (raíz):** [account-deletion](../specs/account-deletion/SPEC.md) · [archive-nutrition-v2-cutover](../specs/archive-nutrition-v2-cutover/SPEC.md) · [cardio-conectado](../specs/cardio-conectado/SPEC.md) · [cardio-ejes-y-fixes](../specs/cardio-ejes-y-fixes/SPEC.md) · [coupon-redeem-free](../specs/coupon-redeem-free/SPEC.md) · [executor-v3](../specs/executor-v3/SPEC.md) · [mobile-entry-experience](../specs/mobile-entry-experience/SPEC.md) · [nutrition-custom-portions](../specs/nutrition-custom-portions/SPEC.md) · [nutrition-exchange-lists](../specs/nutrition-exchange-lists/SPEC.md) · [nutrition-multiday](../specs/nutrition-multiday/SPEC.md) · [nutrition-plan-templates-v2](../specs/nutrition-plan-templates-v2/SPEC.md) · [rn-mobile-parity-redesign](../specs/rn-mobile-parity-redesign/SPEC.md)

## Reglas de ciclo de vida

Todo documento canónico comienza con:

```yaml
---
status: active
owner: <equipo responsable>
last_verified: YYYY-MM-DD
canonical: true
---
```

- Un solo documento `canonical: true` por tema.
- `status: active` exige mantenimiento en el mismo cambio que altera su verdad.
- `canonical: false` identifica referencia o evidencia puntual; no gobierna decisiones.
- `archive/`, auditorías, planes cerrados y reportes point-in-time son históricos.
- Handoffs, prompts, session logs, `_exec`, portlogs y fixlogs no pertenecen a documentación activa.
- No guardar credenciales, secretos, datos personales, PDFs privados ni exports generados.
- No declarar “completo” sin evidencia en testing/paridad.

## Validación

```bash
pnpm docs:check
```

El check documental debe impedir enlaces internos rotos, secretos obvios y handoffs activos. No reemplaza la revisión de contenido contra código, configuración y estado remoto.

## Prioridad ante contradicciones

1. Seguridad y RLS ejecutable.
2. Código, migraciones y configuración del entorno.
3. Documento canónico de este índice.
4. Spec activa.
5. Evidencia/auditoría histórica.

Si dos fuentes difieren, corregir o retirar la menos confiable; no agregar una tercera explicación.

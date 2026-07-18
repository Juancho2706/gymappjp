# Índice navegable — docs/ y specs/

> Construido 2026-07-18 por barrido de directorio (ls + lectura de cabeceras), no por
> memoria. Estados: **VIVO** (fuente de verdad activa hoy) · **histórico** (correcto en
> su momento, ya no se edita, útil como referencia) · **OBSOLETO-candidato-a-archivar**
> (contradice el estado real o quedó totalmente superado). Donde no se pudo verificar el
> contenido a fondo, queda marcado **(verificar)**. No se movió ni se borró ningún archivo.
>
> `docs/audits/*`, `docs/archive/*` y `docs/rn-port/specs/seccion-{2,3}/*` tienen decenas
> de archivos por carpeta; para esas se listó 1 línea por **subcarpeta/serie** (con conteo
> de archivos) en vez de 1 línea por archivo individual — están indicadas explícitamente.

## 0. Punto de entrada

| Doc | Estado | Qué es |
|---|---|---|
| `docs/README.md` | histórico **(verificar)** | Índice general fechado 2026-06-24; menciona `specs/enterprise-alumno-separation` como "el spec vivo", que hoy ya está en `docs/archive/specs/` — desactualizado, debería apuntar a este INDEX y a los specs vivos reales (`nutrition-portions`, `nutrition-v2-conversion`, `rn-mobile-parity-redesign`). |
| `docs/APP_OVERVIEW.md` | VIVO **(verificar fecha)** | Visión funcional de EVA (actores, zonas, rutas, módulos). Fechado 2026-05-21 — confirmar si sigue al día tras rediseño EVA DS + porciones. |
| `docs/e2e-personas.md` | VIVO | Cuentas sintéticas E2E para los 3 flujos (`coach_standalone`/`enterprise_coach`/`coach_team`), Supabase remota/prod. |
| `docs/porting-status.md` | VIVO (doc vivo, se actualiza en cada checkpoint) | Estado de la corrida de port 1:1 PWA→RN por secciones (0-6); numeración de secciones distinta a las "olas 2R-7" citadas en memoria — mismo esfuerzo, otra vista. |

## 1. Nutrición (V2 + Porciones F1)

| Doc | Estado | Qué es |
|---|---|---|
| `docs/product/nutrition-v2/ESTADO_Y_PENDIENTES.md` | **VIVO — fuente única de verdad** | Doc de estado de la sesión RNBUILD, actualizado en esta tarea (2026-07-18): V2 en `mode=on`, Porciones F1 operado en prod, gate de alumnos, pendientes reales. |
| `docs/product/nutrition-v2/README.md` | histórico **(desactualizado)** | Índice de la carpeta; dice "canary solo para josefit" y fecha 2026-07-17 — contradice el flip a `mode=on` del 18-jul. Actualizar o apuntar a `ESTADO_Y_PENDIENTES.md`. |
| `docs/product/nutrition-v2/TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md` | histórico | Contrato de producto + wireframes de la Tanda 1 (14-jul), cerrada. Sigue citado como vigente por el README de la carpeta — es insumo de diseño, no de estado. |
| `docs/product/nutrition-v2/VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md` | histórico **(verificar vigencia)** | Riesgos/bloqueos conocidos al 15-jul; declara que debe actualizarse en cada cierre de bloqueo — no confirmado si se mantuvo tras el flip. |
| `docs/product/nutrition-v2/ADDON_GATING_AUDIT_2026-07-15.md` | histórico | Auditoría puntual (15-jul): el addon "Nutrición Pro" no estaba cableado en V2. Verificar si sigue sin resolver o ya se cerró (los 4 módulos quedaron incluidos en todo plan pago el 17-jul, commit `3a91e041`, lo que probablemente vuelve obsoleto el hallazgo). |
| `docs/product/nutrition-v2/AUDIT_VISTA_ALUMNO_2026-07-16.md` | histórico | Auditoría puntual del "se veía feo" del CEO (16-jul); insumo de las rondas de QA ya cerradas, no re-abrir sin motivo. |
| `docs/product/nutrition-v2/ASSETS_CEO_2026-07.md` | VIVO | Inventario de assets generados por el CEO (licencia, ubicación). Referencia operativa, no caduca. |
| `docs/product/NUTRITION_PRO_BENCHMARK_2026.md` | histórico | Benchmark de referentes (Nutrium, etc.) y dirección UX — insumo de diseño del rework, ya construido. |
| `docs/product/NUTRITION_REWORK_COMPLETION_2026.md` | histórico | Cierre funcional del rework (rama `Nuevascosasrnopenai`), previo a la consolidación en `rnmobiledenuevo`/`master`. |
| `docs/product/NUTRITION_REWORK_NO_AI.md` | histórico | Contrato de producto/arquitectura del rework sin IA — ya implementado. |
| `docs/product/NUTRITION_TOTAL_REWORK_AUDIT_2026.md` | histórico | Auditoría integral + blueprint del rework total — insumo, ya ejecutado. |
| `docs/product/NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md` | histórico | Plan maestro por tandas (14-jul) — las tandas 6-11 que describe ya están todas implementadas. |
| `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md` | histórico **(verificar)** | Runbook de activación escrito en fase canary (PR #121 draft, rollout OFF por defecto). Probablemente desactualizado post-flip a `mode=on`; revisar antes de usarlo como guía operativa hoy. |
| `docs/operations/FOOD_CATALOG_CL_IMPORT.md` | VIVO **(verificar fecha)** | Procedimiento del catálogo chileno de alimentos. Estado interno fechado 15-jul; el catálogo avanzó bastante desde entonces (dedup + porciones) — confirmar si el documento ya refleja eso. |
| `specs/nutrition-portions/SPEC.md` | VIVO | Spec de Porciones (intercambios) F1: decisiones del CEO, 9 grupos system V1, marcar-porción del alumno, pasada masiva del catálogo, PDF diferido a F2. |
| `specs/nutrition-portions/PLAN.md` | VIVO | Arquitectura de Porciones F1 (dónde vive cada pieza: contracts, quick-edit, draft-builder, freeze de snapshots). |
| `specs/nutrition-portions/TASKS.md` | VIVO (build cerrado, referencia de lo hecho) | Olas 0-5 de construcción de Porciones F1, todas completadas (PRs #129/#130); útil como registro de qué se hizo y por qué modelo/archivo. |
| `specs/nutrition-portions/QA-VISUAL.md` | histórico | Auditoría estática de criterios de diseño (tokens/dark/white-label/360px/táctil) hecha ANTES de aplicar las migraciones (17-jul) — el QA real en device (ronda 1, PR #131) ya ocurrió después; este doc es el insumo de código, no el resultado de device. |
| `specs/nutrition-v2-conversion/SPEC.md` | VIVO **(operación en curso)** | Spec de la conversión automática dark de planes V1→V2 (no `exchanges`). Reemplazó al asistente coach-driven. 53 planes ya convertidos según memoria; confirmar contra el driver si queda resto por re-sync. |
| `specs/nutrition-v2-conversion/PLAN.md` | VIVO | Arquitectura del pipeline de conversión (driver → mapper puro → migración puente → publish impersonado). |
| `specs/nutrition-v2-conversion/TASKS.md` | histórico (build cerrado) | Tareas T1-T-n de la conversión, ya construidas y mergeadas. |
| `docs/audits/nutricion-md/*` (6 archivos: n1-n6) | histórico | Auditoría de pantallas de nutrición coach (overview, hub, planbuilder, exchanges, backend, foods/recipes) — snapshot pre-V2/pre-porciones, insumo de diseño ya consumido. |
| `docs/audits/plan-alimenticio-alumno-md/*` (5 archivos: an1-an5) | histórico | Auditoría del plan alimenticio del alumno (overview, meals, exchanges/adherencia, extras, backend) — mismo corte que el anterior. |
| `docs/archive/nutrition-overhaul-2026-06/*` (14 archivos) | histórico (ya archivado) | Overhaul de nutrición de junio-2026 — superado por V2. |
| `docs/archive/nutrition-v2/*` (8 archivos) | histórico (ya archivado) | Handoffs y tandas congeladas de V2 (T0-T5, roadmap remanente) — reemplazados por `ESTADO_Y_PENDIENTES.md`. |

## 2. Port RN 1:1 / paridad con web

| Doc | Estado | Qué es |
|---|---|---|
| `docs/rn-port/README.md` | VIVO | Documento maestro del esfuerzo de paridad ("web manda"), método de trabajo. |
| `docs/rn-port/PLAN-OLAS-1A1.md` | VIVO | Plan canónico de olas 1:1 desde el 12-jul, complementa `porting-status.md`. |
| `specs/rn-mobile-parity-redesign/SPEC.md` | VIVO | SPEC aprobado por el CEO (8-jul) del port 1:1 RN↔web con EVA DS; reglas D1-D8. |
| `specs/rn-mobile-parity-redesign/PLAN.md` | VIVO | Arquitectura del port (capa de datos mobile, principio "web = fuente de verdad"). |
| `specs/rn-mobile-parity-redesign/TASKS.md` | VIVO | Inventario de tareas del port; es el que sustenta las "olas 2R-7" pendientes citadas como SIGUIENTE GRANDE. |
| `docs/rn-port/handoffs/seccion-3/*` (1 archivo) | histórico | Handoff puntual de la Sección 3 (workspace switcher). |
| `docs/rn-port/port-results/*` (2 archivos: directory-sheets, seccion-3/dashboard-shell) | histórico | Resultados de port ya cerrados de esas unidades. |
| `docs/rn-port/specs/seccion-2/*` (12 archivos) | histórico (sección cerrada con residuos) | Specs de paridad de la Sección 2 (dashboard del alumno: hero, momentum, weight widget, etc.) — insumo ya consumido por el port. |
| `docs/rn-port/specs/seccion-3/*` (≈35 archivos: briefs, verify-fix, reports, _exec) | VIVO / histórico mixto **(verificar caso a caso)** | Specs + briefs + verificaciones de la Sección 3 (dashboard coach, directory, ficha). Según `ESTADO_Y_PENDIENTES.md`: 13/14 cerradas, falta `ficha-nutricion-facturacion` (su mitad nutrición ya la superó V2 — ese spec puntual puede quedar obsoleto). |
| `docs/audits/rn-parity-qa/*` (19 archivos) | histórico | Series de auditoría/QA de paridad RN-web (rondas CEO 1,2,4,6,7 + barridos E8 + auditorías R4/R5). Registro de rondas ya cerradas; insumo de por qué se hicieron los fixes, no estado actual. |
| `docs/audits/rn-mobile-vs-web-parity.md` | histórico | Auditoría de paridad, snapshot único. |
| `docs/audits/rn-web-parity-2026-06-21.md` | **OBSOLETO-candidato-a-archivar** | Auditoría de paridad de junio-2026, explícitamente calificada "obsoleta como plan" en `ESTADO_Y_PENDIENTES.md` (aunque el estado funcional ~95% que reporta sigue citado). Ya vive en `project_rn_web_parity_audit.md` (memoria) como "informe, no plan". |
| `docs/audits/alumno-web-vs-mobile.md` | histórico | Comparación puntual alumno web vs. mobile. |
| `docs/audits/coach-mobile-readiness-review.md`, `mobile-native-advantages.md`, `mobile-roadmap.md`, `mobile-shared-foundation.md`, `mobile-ux-design-language.md` | histórico | Serie de auditorías/roadmaps de la estrategia mobile, previos al port 1:1 actual — insumo de diseño ya decidido (RN Expo + NativeWind, ver memoria `project_rn_mobile_stack.md`). |
| `docs/audits/pwa-screens-map-2026-06-22.md` | histórico | Mapa de pantallas PWA de junio, insumo del inventario del port. |
| `docs/operations/GUIA-CEO-TAREAS-RN-PARITY.md` | VIVO **(verificar si las 3 tareas ya se hicieron)** | Guía paso a paso para el CEO (sin código) de 3 tareas que desbloquean el port; confirmar contra memoria si ya están hechas. |
| `docs/operations/MOBILE_RELEASES_OTA.md` | VIVO | Política de releases EAS/OTA para `apps/mobile`, SDK 54 congelado. |
| `docs/operations/RN-PARITY-DB-CHECKLIST.md` | VIVO | Checklist vivo para todo PR de mobile con write-path nuevo. |

## 3. Auditorías de pantalla por área (pre-rediseño / redesign-gap)

> Todas estas son auditorías **point-in-time** (snapshot de una pantalla en un momento
> dado), tal como las describe `docs/README.md`. Se agrupan aquí a nivel de serie —
> son insumo histórico del trabajo ya shippeado del rediseño EVA DS y de las fichas
> coach/alumno, no fuente de estado actual.

| Serie | Estado | Qué es |
|---|---|---|
| `docs/audits/redesign-gap-alumno/*` (8) y `redesign-gap-fable/*` (13) | histórico | Gap de rediseño por pantalla (alumno y coach) — insumo del rediseño EVA DS, ya en prod (`project_redesign_eva_ds.md`). |
| `docs/audits/dashboard-md/*` (5), `dashboard-alumno-md/*` (5) | histórico | Auditoría de dashboard coach/alumno pre-rediseño. |
| `docs/audits/ficha-md/*` (8), `ficha-alumno/*` (3) | histórico | Auditoría de la ficha del alumno (vista coach) y su plan de rework — ya ejecutado (`project_ficha_alumno_rework_plan.md`). |
| `docs/audits/builder-md/*` (6) | histórico | Auditoría del builder de programas. |
| `docs/audits/equipo-md/*` (4), `warroom-md/*` (4) | histórico | Auditoría de pantallas de equipo y war room. |
| `docs/audits/acceso-alumno-md/*` (4), `acceso-coach-md/*` (4) | histórico | Auditoría de login/onboarding/backend de acceso — con foco RLS/seguridad; ver también sección 6. |
| `docs/audits/checkin-alumno-md/*` (2), `rutina-alumno-md/*` (4) | histórico | Auditoría de check-in y ejecución de rutina del alumno. |
| `docs/audits/opciones-coach-md/*` (4), `suscripcion-coach-md/*` (4) | histórico | Auditoría de opciones/configuración y suscripción del coach. |
| `docs/audits/cards-md/*` (1), `modulos/*` (8), `superseries/*` (3) | histórico | Auditorías puntuales de tarjetas, módulos y superseries. |
| `docs/audits/mi-marca/*` (2), `whitelabel/*` (6) | histórico | Auditoría de "Mi marca" y white-label — insumo del build de white-label v2, ya en prod. |
| `docs/audits/alumno-ux/*` (5) | histórico | Research + rework de UX del alumno (estructura, entrenamiento top). |
| `docs/audits/fase-l-wl2/*` (10) | histórico | Auditorías de la Fase L + WL-R2, ciclo cerrado (`project_plan_fase_l_wl2.md`). |
| `docs/audits/landing-v2/transcripcion-spec.md` | histórico | Transcripción de spec de la landing v2. |
| `docs/audits/deferred-attack-plan-2026-06-24.md`, `stable-template-id-plan.md`, `copy-neutro-sweep-20260710.md`, `redesign-eva-ds-informe-2026-06-29.md` | histórico | Planes/informes puntuales ya ejecutados o cuyo alcance quedó absorbido por trabajo posterior. |

## 4. Arquitectura

| Doc | Estado | Qué es |
|---|---|---|
| `docs/architecture/PROJECT_STRUCTURE.md` | **OBSOLETO-candidato-a-archivar** | Dice "rama activa `v2/enterprise`", "Supabase local para desarrollo", fechado 2026-05-21. El repo hoy trabaja contra Supabase remota/prod desde `master` (ver `project_v2_working_rules.md`: "local-only OBSOLETO"). Reescribir o archivar. |
| `docs/architecture/FLOWS_AND_COMPONENTS.md` | VIVO | Mapa de zonas/rutas/flujos, actualizado 2026-07-12 (paridad RN ficha coach). Más reciente que `PROJECT_STRUCTURE.md`; sigue siendo referencia útil. |
| `docs/architecture/AUTH_UX.md` | histórico **(verificar)** | Blueprint de auth/seguridad web→RN, fechado 2026-05-23, rama `v2/enterprise`. Confirmar si el blueprint visual sigue vigente tras el rediseño EVA DS y el login Google (PRs #108/#109). |
| `docs/architecture/CLEAN_ARCHITECTURE_AUDIT.md` | histórico | Auditoría puntual (23-may) de `_data/*.queries.ts`, "AUDIT ONLY", ligada al Plan B Sesión 1 — snapshot, no vivo. |

## 5. Operaciones

| Doc | Estado | Qué es |
|---|---|---|
| `docs/operations/RUNBOOK.md` | VIVO | Runbook de incidentes en prod (SLA, diagnóstico inicial). |
| `docs/operations/MANUAL_TASKS.md` | VIVO **(verificar referencias rotas)** | Tareas manuales del CEO; encabezado cita `docs/status/CURRENT_PHASE.md` y `docs/plans/EXECUTION_PLAN.md`, que no existen en el árbol actual — confirmar si sigue en uso o quedó huérfano. |
| `docs/operations/APP_REVIEW_NOTES.md` | VIVO | Notas para revisores de Apple/Google (descripción de la app). |
| `docs/operations/MOBILE_RELEASES_OTA.md` | VIVO | Ver sección 2 (RN parity). |
| `docs/operations/RN-PARITY-DB-CHECKLIST.md` | VIVO | Ver sección 2. |
| `docs/operations/GUIA-CEO-TAREAS-RN-PARITY.md` | VIVO **(verificar)** | Ver sección 2. |
| `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md` | histórico **(verificar)** | Ver sección 1. |
| `docs/operations/FOOD_CATALOG_CL_IMPORT.md` | VIVO **(verificar fecha)** | Ver sección 1. |

## 6. Seguridad / RLS (transversal, sin carpeta propia)

| Doc | Estado | Qué es |
|---|---|---|
| `docs/audits/2026-06-11-admin-client-rls.md` | histórico | Auditoría puntual de uso de admin client vs. RLS (11-jun). Ver gotcha vivo relacionado en memoria `project_admin_client_rls_gotcha.md` (bypass real = `createServiceRoleClient`). |
| `docs/audits/2026-06-11-audit-planes-2-3.md` | histórico | Auditoría puntual de planes/permisos. |
| `docs/architecture/AUTH_UX.md` | histórico (ver sección 4) | Blueprint de auth/seguridad. |
| `docs/audits/acceso-alumno-md/*`, `acceso-coach-md/*` | histórico (ver sección 3) | Auditorías de login/onboarding con foco en gates y backend. |
| Tests SQL de aislamiento (no son docs, pero son la verificación real) | VIVO | `tests/team/exchanges-isolation.sql`, `tests/team/portions-isolation.sql` — RLS isolation ejecutados y ALL PASSED contra prod para porciones F1 (2026-07-18). |

## 7. Planes de negocio / estrategia

| Doc | Estado | Qué es |
|---|---|---|
| `docs/plans/enterprise-reference-matrices.md` | histórico | Matrices de referencia del Plan C Enterprise (1-jun), entregable de documentación ya cerrado. |
| `docs/plans/pagos-flow-mercadopago-opcion-b.md` | histórico (superado) | Informe/pre-spec de pagos multi-gateway Flow+MP (30-jun). El dual-gateway ya está **LIVE en prod** (PRs #115-118, memoria `project_flow_multigateway_build.md`) — este doc es el diseño previo a la implementación, no el estado. |
| `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md` | histórico | Plan C, "MVP implementado ~96%" al 1-jun; Enterprise quedó luego archivado a favor de Teams-first (memoria `project_teams_first_strategy.md`) — confirmar si el resto pendiente aquí sigue teniendo sentido. |
| `docs/archive/estrategia/00-DIRECTOR.md`, `01-PLAN-archivado-enterprise.md`, `2026-06-11-teams-first-modulos-addons.md` | histórico (ya archivado) | Planes estratégicos ya ejecutados: Teams-first, addons, archivado de Enterprise. |
| `docs/archive/movida/*` (7 archivos) | histórico (ya archivado) | Esfuerzo comercial "Movida" — deal cancelado 2026-06-16 (memoria `project_movida_deal.md`). |
| `docs/socio/EVA-que-hay-de-nuevo-para-socio.md` | VIVO **(verificar si incluye porciones F1)** | Guía de novedades para el socio (Teams, módulos de pago). Confirmar si ya cubre el flip de nutrición V2 y porciones F1, o si falta una actualización. |

## 8. Legal

| Doc | Estado | Qué es |
|---|---|---|
| `docs/legal/tos.md`, `privacy-policy.md`, `enterprise-contract-template.md` | VIVO (con nota interna pendiente) | Términos, privacidad y template de contrato enterprise. Los tres traen nota interna "redactado bajo Juan Villegas como persona natural/freelancer — actualizar razón social/RUT/representante legal" tras la constitución de EVA Technology SpA (memoria `project_company_identity.md`). **Pendiente real, no documental**: actualizar razón social. |

## 9. Testing

| Doc | Estado | Qué es |
|---|---|---|
| `docs/testing/TEST_STATUS.md` | VIVO | Doc canónico de estado de suites, actualizado 2026-07-12; referenciado desde `CLAUDE.md`. |
| `docs/testing/FULL_TEST_REPORT_14_ROLES.md` | histórico | Informe de pruebas de 14 roles (1-jun, rama `v2/enterprise`, Supabase local) — snapshot de un run, no vivo. |

## 10. Archive (ya archivado — enumerado a nivel de carpeta)

Todo lo siguiente vive en `docs/archive/` y ya está tratado como histórico por convención
del repo (`docs/README.md` §"Archivo histórico"). No son candidatos nuevos: ya están donde
corresponden.

| Carpeta | Archivos | Contenido |
|---|---|---|
| `docs/archive/specs/` | 63 | Specs de features ya shippeadas (exercise-creator, discount-codes, whitelabel-v2/r2, coach-settings-restructure, addons-billing, identity-workspace-access, enterprise-subdomain, enterprise-alumno-separation, busqueda-global, checkins-revisado, client-excel-import, coach-change-card, exec-fase-l, movida-*, redesign-eva-ds, pagos-multigateway-flow). |
| `docs/archive/nutrition-overhaul-2026-06/` | 14 | Overhaul de nutrición de junio — superado por V2. |
| `docs/archive/nutrition-v2/` | 8 | Handoffs/tandas de V2 — superados por `ESTADO_Y_PENDIENTES.md`. |
| `docs/archive/movida/` | 7 (+2 en `negociacion/`) | Esfuerzo Movida, deal cancelado. |
| `docs/archive/ops-local-only/` | 5 | Runbooks del flujo local-only, obsoleto (Supabase remota es la verdad hoy). |
| `docs/archive/estrategia/` | 3 | Teams-first / archivado de Enterprise. |
| Archivos sueltos en `docs/archive/` | 7 (`HANDOFF*.md`, `CODEX_SESSION_LOG.md`, `PLAN-DIRECCION-JUEVES.md`, `MOVIDA_LOCAL_DEMO.sql`) | Handoffs de sesiones/sprints cerrados. |

## 11. Specs — plantillas

| Doc | Estado | Qué es |
|---|---|---|
| `specs/_templates/{SPEC,PLAN,TASKS}.md` | VIVO | Plantillas del patrón SDD del repo (`specs/<feature>/{SPEC,PLAN,TASKS}.md`); usarlas para todo spec nuevo. |
| `specs/redesign-eva-ds/token-contract.md` | histórico (contrato ya cumplido) | Contrato canónico de tokens de la Fase 0 del rediseño EVA DS; el rediseño ya está en prod. Sigue siendo la referencia normativa de tokens (`pnpm check:tokens` la usa), por eso no es candidato a archivar pese a ser de una fase cerrada. |

---

## Candidatos a archivar

Docs que **no viven en `docs/archive/`** pero que, por contenido, ya quedaron
superados o contradicen el estado real. No se movieron — es una señal para decisión
humana.

1. **`docs/architecture/PROJECT_STRUCTURE.md`** — describe rama activa `v2/enterprise` y
   flujo Supabase local como el de trabajo; el repo opera hoy desde `master` contra
   Supabase remota/prod (regla vigente en memoria `project_v2_working_rules.md`: "local-only
   OBSOLETO"). Mantenerlo sin marcar induce a un colaborador nuevo a trabajar contra un
   flujo que ya no existe.

2. **`docs/audits/rn-web-parity-2026-06-21.md`** — la propia `ESTADO_Y_PENDIENTES.md` lo
   califica "obsoleta como plan" (aunque su cifra de ~95% funcional siga citada de
   memoria). Vive fuera de `archive/` pese a estar reemplazada por las auditorías
   `rn-parity-qa/*` y el `PLAN-OLAS-1A1.md` actuales.

3. **`docs/plans/pagos-flow-mercadopago-opcion-b.md`** — es el diseño *previo* a una
   implementación que ya está LIVE en prod (dual-gateway Flow+MP, PRs #115-118). El plan
   quedó ejecutado; mantenerlo en `plans/` (no en `archive/`) sugiere que sigue por hacerse.

4. **`docs/product/nutrition-v2/README.md`** — afirma "canario solo para josefit" y fecha
   17-jul; el flip a `mode=on` (18-jul) lo dejó desactualizado un día después de escrito.
   No es candidato a archivar (sigue siendo el índice de la carpeta), pero necesita edición
   inmediata para no confundir a quien lo lea antes que `ESTADO_Y_PENDIENTES.md`.

5. **`docs/product/nutrition-v2/ADDON_GATING_AUDIT_2026-07-15.md`** — reporta que el addon
   "Nutrición Pro" no estaba cableado en V2; dos días después (17-jul) los 4 módulos
   quedaron incluidos en todo plan pago (commit `3a91e041`), lo que probablemente vuelve
   irrelevante el hallazgo. **(verificar antes de archivar** — confirmar que el gating
   descrito ya no aplica, no asumir.)

6. **`docs/archive/nutrition-overhaul-2026-06/` y `docs/archive/nutrition-v2/`** — ya están
   en `archive/`, se listan aquí solo para cerrar el círculo: son el ejemplo de que este
   patrón (overhaul → V2 → porciones) ya pasó dos veces por el ciclo "vivo → archivado";
   nada que hacer, correctamente ubicados.

**NO se tocó ningún archivo.** Este INDEX es señal para que el CEO o un agente futuro
decida mover/fusionar/reescribir con contexto humano.

# TASKS — Screening de Movimiento de Ingreso

**Status:** DRAFT
**Spec:** `specs/movida-screening/SPEC.md` · **Plan:** `specs/movida-screening/PLAN.md`
**Last updated:** 2026-06-11

Leyenda: `[ ]` pendiente. **Regla de testing (2026-06-10):** por tanda SOLO `pnpm typecheck` +
`pnpm test` (vitest, sin Supabase). Playwright/SQL contra Supabase: SOLO en F7 con OK explícito
del usuario. Los specs E2E/SQL se ESCRIBEN en su tanda igual.

---

## F0 — Cimiento de módulo (sin DB)

- [~] T0.1 — Kill-switch de operador en `services/entitlements.service.ts` — **PARCIAL (2026-06-11)**
  - HECHO: `isMovementModuleKilled()` (env `DISABLED_MODULES`, CSV) implementado en
    `services/assessment/movement-assessment.service.ts` y evaluado ANTES de todo gate en TODA
    query/mutación del módulo (incl. vista del alumno). Unit test verde (killed ⇒ throw antes de
    tocar scope/repo).
  - DIFERIDO al cableado central: mover/levantar el check a `entitlements.service.ts#hasModule`
    (archivo compartido — prohibido en corrida paralela) + documentar env var en `CLAUDE.md` y
    `docs/operations/RUNBOOK.md`.
- [ ] T0.2 — Enforcement de `entitlement` en el nav — **DIFERIDO al orquestador**
  - `components/coach/coach-nav.ts` y `CoachSidebar.tsx` son ARCHIVOS COMPARTIDOS PROHIBIDOS en
    esta corrida. El ítem NAV_MODULES exacto se entrega en el JSON de salida (navEntry).
- [~] T0.3 — Ítem nav `movement` + ruta stub gateada — **PARCIAL (2026-06-11)**
  - HECHO: la ruta no es stub sino la página REAL `app/coach/movement/page.tsx` con gating
    server-side completo (kill-switch + scope 3-vías + `assertModule`) ⇒ `notFound()` si OFF.
  - DIFERIDO: el ítem en `NAV_MODULES` (archivo compartido — ver T0.2).
- [x] T0.4 — Fix de marca en superficies existentes — **HECHO 2026-06-11**
  - Scope: quitar "(tipo FMS)" de `app/coach/settings/modules/_components/ModulesForm.tsx:13`
    (desc pasa a "Screening de movimiento de ingreso con semáforo y evolución."); revisar
    `app/admin/(panel)/teams/_components/module-labels.ts` (OK hoy) y cualquier otra superficie.
  - DoD: `grep -ri "FMS" apps/web/src packages --include="*.tsx" --include="*.ts" --include="*.json"`
    sin ocurrencias en strings visibles/i18n. ✔ Verificado 2026-06-11: 0 ocurrencias (se corrigió
    la desc "(tipo FMS)" de `ModulesForm.tsx`).

## F1 — Cálculo puro (`packages/calc`)

- [x] T1.1 — Crear package `@eva/calc` — **HECHO 2026-06-11** (nombre `@eva/calc`, consistente con
  `@eva/schemas`; alias en `apps/web/tsconfig.json` + `vitest.config.ts`; cubierto por glob
  `packages/*` del workspace)
  - Scope: `packages/calc/{package.json,index.ts,src/movement.ts}` espejo de `packages/schemas`
    (sin deps runtime, sin `server-only`); verificar que `pnpm-workspace.yaml` lo cubra y que
    vitest lo recoja (precedente: `packages/schemas/workout.test.ts`).
  - DoD: `pnpm install` limpio; import desde apps/web tipa.
- [x] T1.2 — `movement.ts`: catálogo + funciones puras — **HECHO 2026-06-11**
  - Scope: `MOVEMENT_PATTERNS_V1` (7 slugs, `isPerSide`, `hasClearing`), `finalItemScore`,
    `compositeScore` (exige 7 patrones), `hasAsymmetry` (solo por-lado, |L−R| ≥ 1),
    `priorityBand` (high: pain || ≤14; moderate: 15-16 || asym; low: ≥17 sin asym/pain),
    `summarizeAssessment`.
  - DoD: sin imports de IO/Next/Supabase; typecheck.
- [x] T1.3 — Golden tests (`packages/calc/src/movement.test.ts`) — **HECHO 2026-06-11** (18 tests
  verdes: G1-G8 + bordes; clearing positivo cuenta como dolor ⇒ banda high, decisión documentada
  en el test G3)
  - Scope: los 8 casos del plan 03 §A (21/low; pain⇒0+high; clearing hombro⇒0; L3/R1⇒1+asym;
    14⇒high; 16⇒moderate; 17⇒low; 16+asym⇒moderate) + bordes (faltan patrones ⇒ throw; clearing
    en los 3 patrones; L=R sin asimetría; dolor no genera asimetría).
  - DoD: `pnpm test` verde; AC2 cubierto 1:1.

## F2 — DB (branch efímero MCP — protocolo Director §3)

- [x] T2.1 — Escribir la migración `2026…_movement_assessment_module.sql` — **HECHA (pre-autorada
  por el orquestador): `supabase/migrations/20260611091001_movement_assessment_module.sql`;
  `database.types.ts` ya refleja las tablas**
  - Scope: DDL del PLAN (2 tablas, índice parcial de draft único, triggers `handle_updated_at`,
    REVOKE/GRANT anti-default-privileges, helper `current_user_pool_movement_assessment_ids()`,
    policies team/standalone/self/service). Aditiva, idempotente, forward-only.
  - DoD: lint visual contra patrones de migr. `20260609160000`/`170000`/`054748`; cero DROP de
    objetos pre-existentes.
- [ ] T2.2 — Validar en branch efímero y mergear (⚠️ TOCA SUPABASE — coordinar con el usuario) —
  **DIFERIDO: se ejecuta esta noche por el orquestador/usuario (prohibido tocar Supabase en esta
  corrida)**
  - Scope: `list_branches` (cazar colgados) → `create_branch` → poll `MIGRATIONS_PASSED` →
    `apply_migration` → seed sintético via `execute_sql` (2 teams + standalone + alumnos + claims)
    → tests RLS como `authenticated` (jamás service_role) → `EXPLAIN ANALYZE` vía team
    (`loops=1`, InitPlan) → `get_advisors` 0 críticos → `merge_branch` → `supabase db pull` +
    `generate_typescript_types` → **`delete_branch` el MISMO día**.
  - DoD: migración versionada local post-`db pull`; `database.types.ts` regenerado; typecheck verde.
- [x] T2.3 — Escribir `tests/team/movement-assessment-isolation.sql` (NO correr por tanda) —
  **HECHA (pre-autorada por el orquestador junto a la migración; cubre T1-T7); se corre en F7**
  - Scope: T1-T7 del test plan (aislamiento team/standalone/self/anon, draft único, cross-team
    write rechazado, EXPLAIN). Mismo armazón que `tests/team/areas-isolation.sql`.
  - DoD: archivo en repo; se corre recién en F7 (gate autorizado).

## F3 — Núcleo coach (domain → repo → service → wizard → reporte)

- [x] T3.0 — Extraer guards de scoping a servicio compartido (PRE-requisito del service nuevo) —
  **HECHO 2026-06-11**: movidos (no copiados) a `services/client/client-scope.service.ts` (sin
  `'use server'`); `client-detail.service.ts` los importa de ahí; grep confirma UNA definición.
  ⚠️ Hallazgo: `services/bodycomp/body-composition.service.ts` (agente paralelo) tiene una copia
  privada propia de `getCoachClientScope` — migrarla al servicio compartido en el cableado central.
  - Scope: `getCoachClientScope` y `assertCoachClientReadAccess` HOY son funciones **privadas**
    (sin `export`) en `services/client/client-detail.service.ts` (líneas 36 y 53) — el service
    nuevo NO puede importarlas. Extraerlas (mover, NO copiar) a
    `services/client/client-scope.service.ts` **sin** `'use server'` (no son server actions;
    exportarlas desde el archivo `'use server'` actual las publicaría como endpoints RPC) y que
    `client-detail.service.ts` las importe de ahí. Cero cambios de lógica; los ~10 call sites
    internos quedan intactos. Sin esto, el implementador copiaría-pegaría un guard de seguridad
    crítico y la lógica de scoping 3-vías se bifurcaría.
  - DoD: typecheck + `pnpm test` verdes; grep confirma UNA sola definición de cada guard en el
    repo (sin duplicados); `client-detail.service.ts` compila importando del módulo nuevo.
- [x] T3.1 — Domain + schemas — **HECHO 2026-06-11** (archivo `packages/schemas/screening.ts` por
  contrato del orquestador, no `assessment.ts`; uuids con `z.guid()`; 14 contracts tests verdes;
  import vía alias `@eva/schemas/screening`. **DIFERIDO al orquestador:** export en
  `packages/schemas/index.ts` — archivo compartido prohibido; línea exacta en el JSON de salida)
  - Scope: `domain/assessment/types.ts`; `packages/schemas/assessment.ts`
    (`MovementItemInputSchema`, `MovementDraftUpsertSchema`, `MovementFinalizeSchema` con
    atestación, `MovementDeleteSchema`) + export en index. Nota Zod 4: validar uuids con el
    criterio del repo (gotcha `z.guid()` de movida-areas si aplica a ids externos).
  - DoD: contracts test de schemas (casos válidos/ inválidos); typecheck.
- [x] T3.2 — Repository `infrastructure/db/movement-assessment.repository.ts` — **HECHO
  2026-06-11** (nombre por contrato del orquestador). **DIFERIDO al orquestador:** la línea
  `export * from './movement-assessment.repository'` en `infrastructure/db/index.ts` (los agentes
  paralelos tampoco registraron los suyos; el service importa el módulo directo, no bloquea).
  - Scope: métodos del PLAN, cliente user-scoped (RLS techo), SELECT columnas específicas
    (nunca `*`), registrado en `infrastructure/db/index.ts`.
  - DoD: typecheck; sin imports de `app/`.
- [x] T3.3 — Service `services/assessment/movement-assessment.service.ts` — **HECHO 2026-06-11**
  (16 unit tests verdes con repo/guards mockeados; cubre kill-switch, módulo OFF, rechazo
  enterprise, consent team/standalone, `consent_confirmed_at` en AMBAS vías, recálculo server,
  `last_edited_by`, bitácora solo `viaTeam`)
  - Scope: orquestación completa del PLAN (scope+viaTeam con los guards importados de
    `client-scope.service.ts` — T3.0, rechazo enterprise v1, `assertModule` por contexto del
    ALUMNO, gate de consentimiento AC7, recálculo server con `@gymapp/calc`, `last_edited_by`,
    bitácora best-effort `viaTeam`, tag de error `module:movement_assessment`). Finalize estampa
    `consent_confirmed_at` en AMBOS contextos (team = timestamp de la verificación del
    consentimiento `health_data_processing` activo; standalone = timestamp de la atestación) —
    lo exige el CHECK `movement_assessments_final_complete`; dejarlo NULL en team rompería toda
    finalización del pool en runtime.
  - DoD: unit tests con repo mockeado: módulo OFF ⇒ throw; team sin consent ⇒ throw en finalize;
    standalone sin atestación ⇒ throw; **finalize estampa `consent_confirmed_at` en ambas vías
    (team y standalone — jamás NULL en un final)**; finalize recalcula (ignora agregados del
    cliente); log solo `viaTeam`. Typecheck.
- [x] T3.4 — Actions `app/coach/movement/_actions/movement.actions.ts` — **HECHO 2026-06-11**
  - Scope: `upsertDraftItemAction`, `finalizeAssessmentAction`, `deleteAssessmentAction`;
    Zod en server; `revalidatePath('/coach/movement')` y del detalle.
  - DoD: typecheck; actions delgadas (todo en service).
- [x] T3.5 — Wizard `app/coach/movement/[clientId]/new/` — **HECHO 2026-06-11** (verificación
  manual en tablet/teléfono DIFERIDA al gate F7 — la DB remota se migra esta noche)
  - Scope: `MovementWizard` + `PatternStep` (segmented 0-3 ≥44px, L/R lado a lado, dolor,
    clearing solo en los 3 que lo tienen), total parcial /21 fijo con safe-area, retoma draft
    existente, autosave por paso (`useTransition`), paso final de revisión + atestación +
    `useActionState`; preview optimista del semáforo; `h-dvh`; dark mode; `useReducedMotion`;
    `loading.tsx`.
  - DoD: AC1+AC3 manual local; typecheck; i18n `assessment.*` en es+en (mismo commit).
- [x] T3.6 — Reporte `app/coach/movement/[clientId]/page.tsx` — **HECHO 2026-06-11** (grep AC5
  verde; render manual diferido al gate F7)
  - Scope: semáforo (copy "prioridad de trabajo correctivo") + badges dolor/asimetría + tabla 7
    patrones (lado débil resaltado) + notas + `EditedByBadge`/awareness + **disclaimer** +
    historial de finales + botón eliminar (confirm). Bitácora `view` viaTeam.
  - DoD: AC5 (grep) + render manual; typecheck + vitest de la tanda.

## F4 — Evolución + hub + perfil

- [x] T4.1 — `EvolutionCharts` (recharts): línea del compuesto + radar 7 patrones (primera vs
  última). Estados 0/1/≥2 evaluaciones (AC4). — **HECHO 2026-06-11** (en
  `components/movement/EvolutionCharts.tsx`, compartido coach/alumno; estados 0/1/≥2 manejados en
  los padres; render manual diferido al gate F7)
- [x] T4.2 — Hub `/coach/movement` — **HECHO 2026-06-11** (verificación manual standalone vs team
  diferida al gate F7; sin "evaluador" en la lista v1 — requeriría join extra con coaches, anotado
  como mejora menor)
- [ ] T4.3 — Card en perfil del alumno — **DIFERIDO al orquestador**: el perfil
  `app/coach/clients/[clientId]/**` es ARCHIVO COMPARTIDO PROHIBIDO en esta corrida. El link
  sugerido se entrega en el JSON de salida (profileLink: `/coach/movement/[clientId]`).

## F5 — Export/print + bitácora completa

- [x] T5.1 — `app/coach/movement/[clientId]/print/page.tsx` — **HECHO 2026-06-11** (marca del
  contexto vía service; el CSS global ya oculta el sidebar del coach en `@media print`; print
  manual diferido al gate F7)
- [x] T5.2 — Bitácora `pdf_generate` al abrir print (viaTeam) + cobertura
  view/create/update/delete (AC9) — **HECHO 2026-06-11** (unit tests del service cubren acción por
  operación y que standalone NO registra)

## F6 — Vista del alumno

- [x] T6.1 — `app/c/[coach_slug]/movimiento/page.tsx` + `_data` — **HECHO 2026-06-11**. Nota de
  diseño: el alumno no puede leer `teams/coaches.enabled_modules` por RLS ⇒ el gate `hasModule`
  usa un cliente service-role SOLO para entitlements, tras verificar identidad (patrón
  consent.actions). Query de finales con cliente del alumno (RLS self-select = techo, sin drafts).
  Manual vía /t diferido al gate F7 (el proxy rewrite sirve cualquier subruta de /c sin cambios).
- [ ] T6.2 — Entrada en la navegación del alumno — **DIFERIDO al orquestador**: el shell del
  cliente es componente compartido existente. Condición: módulo ON + ≥1 final (ver notas del JSON).

## F7 — GATE FINAL (SOLO con OK explícito del usuario)

- [x] T7.1 — Escribir spec E2E `tests/e2e/movement-assessment.spec.ts` — **ESCRITO 2026-06-11
  (NO ejecutado — se corre en este gate con OK explícito del usuario)**. Cubre: hub gateado,
  draft → abandono → retoma (AC3) → finaliza → semáforo, print, alumno vía /t, grep AC5 en vivo.
  Skip automático sin credenciales E2E_POOL_*.
- [ ] T7.2 — Corrida única: build prod + Playwright `--workers=1` + suite SQL
  `tests/team/movement-assessment-isolation.sql` + grep de marca (AC5) sobre el build.
- [ ] T7.3 — Docs canónicas: `docs/architecture/{PROJECT_STRUCTURE,FLOWS_AND_COMPONENTS}.md`,
  `docs/testing/TEST_STATUS.md`, bitácora del Director (estado Plan 3 §A) + marcar bloqueantes
  de Ani pendientes/resueltos.
- [ ] T7.4 — Commit/push por fase ya hecho; PR o merge según indique el usuario.

## DoD universal (cada tanda)

- [ ] `pnpm typecheck` verde
- [ ] `pnpm test` (vitest) verde — golden tests incluidos
- [ ] Sin Supabase directo en `_data` (siempre service → repository)
- [ ] Server actions con Zod + `revalidatePath`
- [ ] `assertModule` al tope de toda action/RSC del módulo
- [ ] `h-dvh`/safe-areas (jamás `h-screen` fuera de `md:`); dark mode
- [ ] i18n: keys `assessment.*` en `es.json` Y `en.json` en el mismo commit
- [ ] Cero "FMS"/"Functional Movement" en superficies de usuario
- [ ] Docs actualizadas si cambian rutas/schema/flujos (misma tanda)

## Notas

- **mustFix del review APLICADO (2026-06-11):** `deleteMovementAssessment`
  (`services/assessment/movement-assessment.service.ts`) ahora cruza assessment ↔ alumno gateado
  ANTES de borrar (`findAssessmentWithItems` + `client_id !== input.client_id ⇒ throw`), mismo
  precedente que `getMovementPrintData`. Cierra el hueco: coach con workspace TEAM activo podía
  borrar evaluaciones de sus alumnos STANDALONE (módulo OFF) pasando un `client_id` del pool
  (RLS permisivas independientes del workspace), y la bitácora AC9 quedaba contra el alumno
  equivocado. +2 unit tests (assessment ajeno ⇒ throw sin `deleteAssessment` ni bitácora;
  assessment inexistente ⇒ throw); el test de bitácora `delete` ahora mockea
  `findAssessmentWithItems`.
- **Estado corrida paralela 2026-06-11:** vitest 637/637 verde (48 tests nuevos del módulo:
  18 calc + 14 schemas + 16 service). `tsc --noEmit` con 0 errores en archivos de ESTE módulo;
  el typecheck combinado falla SOLO en archivos de otros agentes (bodycomp/intercambios esperan
  exports en `packages/schemas/index.ts` que cablea el orquestador). i18n `assessment.*` agregado
  a `lib/i18n/{es,en}.json` (la ruta real de locales; el plan decía `src/locales` que no existe).
  Componentes presentacionales compartidos coach/alumno en `components/movement/` (nuevo).
- Orden de dependencias: F0 y F1 son paralelizables; F2 requiere F1 (golden tests definen el
  contrato antes del DDL final); F3 requiere F2 (types generados); F4-F6 dependen de F3.
  Excepción: T3.0 (extracción de guards) NO depende de F2 — es refactor de código existente y
  puede adelantarse a cualquier tanda previa.
- Esfuerzo estimado (plan 03): 3-5 días el MVP (F0-F3); F4-F6 +2-3 días.
- T2.2 es la ÚNICA tarea que toca Supabase remota → coordinar ventana con el usuario y cumplir
  el protocolo de branch efímero COMPLETO (incl. `delete_branch` mismo día).

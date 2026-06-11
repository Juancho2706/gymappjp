# TASKS — Screening de Movimiento de Ingreso

**Status:** DRAFT
**Spec:** `specs/movida-screening/SPEC.md` · **Plan:** `specs/movida-screening/PLAN.md`
**Last updated:** 2026-06-11

Leyenda: `[ ]` pendiente. **Regla de testing (2026-06-10):** por tanda SOLO `pnpm typecheck` +
`pnpm test` (vitest, sin Supabase). Playwright/SQL contra Supabase: SOLO en F7 con OK explícito
del usuario. Los specs E2E/SQL se ESCRIBEN en su tanda igual.

---

## F0 — Cimiento de módulo (sin DB)

- [ ] T0.1 — Kill-switch de operador en `services/entitlements.service.ts`
  - Scope: `isModuleKilled(key)` leyendo env runtime `DISABLED_MODULES` (CSV de ModuleKey);
    `hasModule` retorna `false` si killed ANTES de consultar entitlements. Documentar la env var
    en `CLAUDE.md` (tabla env) y `docs/operations/RUNBOOK.md`.
  - DoD: unit test (killed ⇒ false aunque enabled_modules diga true); typecheck verde.
- [ ] T0.2 — Enforcement de `entitlement` en el nav
  - Scope: `VisibleNavContext.enabledModules?: Partial<Record<ModuleKey, boolean>>`;
    `getVisibleNavItems` oculta ítems con `entitlement` no-true (función sigue PURA). Thread del
    prop desde el layout RSC del coach → `CoachSidebar.tsx` (resolver con
    `getTeamEnabledModules`/`getCoachEnabledModules` según workspace activo, restando killed).
  - DoD: `coach-nav.test.ts` ampliado (matriz contexto × entitlement on/off/kill); los ítems SIN
    `entitlement` no cambian de comportamiento (cero regresión); typecheck.
- [ ] T0.3 — Ítem nav `movement` + ruta stub gateada
  - Scope: `NAV_MODULES` += `{ key: 'movement', href: '/coach/movement', label (i18n
    `assessment.title`), icon: Activity, contexts: ['coach_standalone','coach_team'],
    entitlement: 'movement_assessment' }`. Página stub `app/coach/movement/page.tsx` con
    `assertModule` + `notFound()` si OFF.
  - DoD: con módulo OFF: sin ítem y ruta 404; con ON (toggle en Settings>Módulos): ítem visible.
    Unit nav verde.
- [ ] T0.4 — Fix de marca en superficies existentes
  - Scope: quitar "(tipo FMS)" de `app/coach/settings/modules/_components/ModulesForm.tsx:13`
    (desc pasa a "Screening de movimiento de ingreso con semáforo y evolución."); revisar
    `app/admin/(panel)/teams/_components/module-labels.ts` (OK hoy) y cualquier otra superficie.
  - DoD: `grep -ri "FMS" apps/web/src packages --include="*.tsx" --include="*.ts" --include="*.json"`
    sin ocurrencias en strings visibles/i18n.

## F1 — Cálculo puro (`packages/calc`)

- [ ] T1.1 — Crear package `@gymapp/calc`
  - Scope: `packages/calc/{package.json,index.ts,src/movement.ts}` espejo de `packages/schemas`
    (sin deps runtime, sin `server-only`); verificar que `pnpm-workspace.yaml` lo cubra y que
    vitest lo recoja (precedente: `packages/schemas/workout.test.ts`).
  - DoD: `pnpm install` limpio; import desde apps/web tipa.
- [ ] T1.2 — `movement.ts`: catálogo + funciones puras
  - Scope: `MOVEMENT_PATTERNS_V1` (7 slugs, `isPerSide`, `hasClearing`), `finalItemScore`,
    `compositeScore` (exige 7 patrones), `hasAsymmetry` (solo por-lado, |L−R| ≥ 1),
    `priorityBand` (high: pain || ≤14; moderate: 15-16 || asym; low: ≥17 sin asym/pain),
    `summarizeAssessment`.
  - DoD: sin imports de IO/Next/Supabase; typecheck.
- [ ] T1.3 — Golden tests (`packages/calc/src/movement.test.ts`)
  - Scope: los 8 casos del plan 03 §A (21/low; pain⇒0+high; clearing hombro⇒0; L3/R1⇒1+asym;
    14⇒high; 16⇒moderate; 17⇒low; 16+asym⇒moderate) + bordes (faltan patrones ⇒ throw; clearing
    en los 3 patrones; L=R sin asimetría; dolor no genera asimetría).
  - DoD: `pnpm test` verde; AC2 cubierto 1:1.

## F2 — DB (branch efímero MCP — protocolo Director §3)

- [ ] T2.1 — Escribir la migración `2026…_movement_assessment_module.sql`
  - Scope: DDL del PLAN (2 tablas, índice parcial de draft único, triggers `handle_updated_at`,
    REVOKE/GRANT anti-default-privileges, helper `current_user_pool_movement_assessment_ids()`,
    policies team/standalone/self/service). Aditiva, idempotente, forward-only.
  - DoD: lint visual contra patrones de migr. `20260609160000`/`170000`/`054748`; cero DROP de
    objetos pre-existentes.
- [ ] T2.2 — Validar en branch efímero y mergear (⚠️ TOCA SUPABASE — coordinar con el usuario)
  - Scope: `list_branches` (cazar colgados) → `create_branch` → poll `MIGRATIONS_PASSED` →
    `apply_migration` → seed sintético via `execute_sql` (2 teams + standalone + alumnos + claims)
    → tests RLS como `authenticated` (jamás service_role) → `EXPLAIN ANALYZE` vía team
    (`loops=1`, InitPlan) → `get_advisors` 0 críticos → `merge_branch` → `supabase db pull` +
    `generate_typescript_types` → **`delete_branch` el MISMO día**.
  - DoD: migración versionada local post-`db pull`; `database.types.ts` regenerado; typecheck verde.
- [ ] T2.3 — Escribir `tests/team/movement-assessment-isolation.sql` (NO correr por tanda)
  - Scope: T1-T7 del test plan (aislamiento team/standalone/self/anon, draft único, cross-team
    write rechazado, EXPLAIN). Mismo armazón que `tests/team/areas-isolation.sql`.
  - DoD: archivo en repo; se corre recién en F7 (gate autorizado).

## F3 — Núcleo coach (domain → repo → service → wizard → reporte)

- [ ] T3.0 — Extraer guards de scoping a servicio compartido (PRE-requisito del service nuevo)
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
- [ ] T3.1 — Domain + schemas
  - Scope: `domain/assessment/types.ts`; `packages/schemas/assessment.ts`
    (`MovementItemInputSchema`, `MovementDraftUpsertSchema`, `MovementFinalizeSchema` con
    atestación, `MovementDeleteSchema`) + export en index. Nota Zod 4: validar uuids con el
    criterio del repo (gotcha `z.guid()` de movida-areas si aplica a ids externos).
  - DoD: contracts test de schemas (casos válidos/ inválidos); typecheck.
- [ ] T3.2 — Repository `infrastructure/db/assessment.repository.ts`
  - Scope: métodos del PLAN, cliente user-scoped (RLS techo), SELECT columnas específicas
    (nunca `*`), registrado en `infrastructure/db/index.ts`.
  - DoD: typecheck; sin imports de `app/`.
- [ ] T3.3 — Service `services/assessment/movement-assessment.service.ts`
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
- [ ] T3.4 — Actions `app/coach/movement/_actions/movement.actions.ts`
  - Scope: `upsertDraftItemAction`, `finalizeAssessmentAction`, `deleteAssessmentAction`;
    Zod en server; `revalidatePath('/coach/movement')` y del detalle.
  - DoD: typecheck; actions delgadas (todo en service).
- [ ] T3.5 — Wizard `app/coach/movement/[clientId]/new/`
  - Scope: `MovementWizard` + `PatternStep` (segmented 0-3 ≥44px, L/R lado a lado, dolor,
    clearing solo en los 3 que lo tienen), total parcial /21 fijo con safe-area, retoma draft
    existente, autosave por paso (`useTransition`), paso final de revisión + atestación +
    `useActionState`; preview optimista del semáforo; `h-dvh`; dark mode; `useReducedMotion`;
    `loading.tsx`.
  - DoD: AC1+AC3 manual local; typecheck; i18n `assessment.*` en es+en (mismo commit).
- [ ] T3.6 — Reporte `app/coach/movement/[clientId]/page.tsx`
  - Scope: semáforo (copy "prioridad de trabajo correctivo") + badges dolor/asimetría + tabla 7
    patrones (lado débil resaltado) + notas + `EditedByBadge`/awareness + **disclaimer** +
    historial de finales + botón eliminar (confirm). Bitácora `view` viaTeam.
  - DoD: AC5 (grep) + render manual; typecheck + vitest de la tanda.

## F4 — Evolución + hub + perfil

- [ ] T4.1 — `EvolutionCharts` (recharts): línea del compuesto + radar 7 patrones (primera vs
  última). Estados 0/1/≥2 evaluaciones (AC4).
  - DoD: render manual con fixtures; dark mode; typecheck.
- [ ] T4.2 — Hub `/coach/movement`: lista de alumnos del workspace ACTIVO (scope 3-vías, patrón
  `CoachClientScope`) con último semáforo/fecha/evaluador y CTA "Evaluar"; queries con
  `React.cache` + `findLatestFinalByClients`; `loading.tsx`.
  - DoD: standalone ve solo propios; team ve el pool (verificación manual local); typecheck.
- [ ] T4.3 — Card en perfil del alumno (`ProfileOverviewB3` o card propia): último semáforo +
  link; visible solo con módulo ON (prop desde RSC del perfil).
  - DoD: módulo OFF ⇒ card ausente; typecheck.

## F5 — Export/print + bitácora completa

- [ ] T5.1 — `app/coach/movement/[clientId]/print/page.tsx` (patrón `progress-print`): reporte
  print-friendly con marca del CONTEXTO (team ⇒ marca del team; standalone ⇒ marca del coach;
  jamás EVA hardcodeado) + disclaimer.
  - DoD: print manual OK; sin "FMS"; typecheck.
- [ ] T5.2 — Bitácora `pdf_generate` al abrir print (viaTeam) + revisar cobertura
  view/create/update/delete (AC9).
  - DoD: unit del service: acciones correctas por operación.

## F6 — Vista del alumno

- [ ] T6.1 — `app/c/[coach_slug]/movimiento/page.tsx` + `_data`: último reporte final + evolución
  (read-only) + disclaimer; gate `hasModule` por contexto del alumno (team ⇒ team) con
  `notFound()` si OFF; servida vía `/t/[team_slug]/movimiento` por el proxy (sin cambios de proxy
  esperados — verificar rewrite).
  - DoD: alumno NO ve drafts (RLS + query); manual local vía /t con branding del team; typecheck.
- [ ] T6.2 — Entrada en la navegación del alumno (donde el shell del cliente lista secciones),
  condicionada al módulo + a tener ≥1 evaluación final.
  - DoD: sin evaluaciones ⇒ sin entrada; typecheck.

## F7 — GATE FINAL (SOLO con OK explícito del usuario)

- [ ] T7.1 — Escribir spec E2E `tests/e2e/movement-assessment.spec.ts` (flujo kine: draft →
  retomar → finalizar → hub → alumno en /t → print) usando las 8 personas e2e permanentes.
  (Se escribe en F3-F6; se corre acá.)
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

- Orden de dependencias: F0 y F1 son paralelizables; F2 requiere F1 (golden tests definen el
  contrato antes del DDL final); F3 requiere F2 (types generados); F4-F6 dependen de F3.
  Excepción: T3.0 (extracción de guards) NO depende de F2 — es refactor de código existente y
  puede adelantarse a cualquier tanda previa.
- Esfuerzo estimado (plan 03): 3-5 días el MVP (F0-F3); F4-F6 +2-3 días.
- T2.2 es la ÚNICA tarea que toca Supabase remota → coordinar ventana con el usuario y cumplir
  el protocolo de branch efímero COMPLETO (incl. `delete_branch` mismo día).

# Plan de ataque — deuda diferida (limpieza segura)

> Generado 2026-06-24 por auditoria multi-agente (4 analistas) sobre el estado de `master` post-merge de la limpieza client-safe (PR #67). **Read-only / plan** — nada ejecutado.
> Directiva raiz de TODO este plan: **no afectar a clientes en produccion live**. Cada paso es behavior-preserving o queda explicitamente marcado como mayor riesgo con su gate.
> Contexto previo: ver memoria `project-codebase-cleanup-safe-tandas` (lo ya hecho) + auditoria base `eva-codebase-audit`.

## Principio rector

EVA esta en produccion con coaches + ~36 alumnos activos, RLS pesado, pagos MercadoPago. Todo refactor de este plan se hace:
- **Behavior-preserving**: el SQL/columnas/filtros/client-kind se preservan **byte-identico**; nada cambia de forma de query, auth, ni timing de cache salvo lo marcado.
- **Una pieza por PR** (un dominio / un archivo), nunca big-bang.
- **Gate por PR** (universal, abajo) antes de cada merge.
- **Smallest blast-radius first**: lo interno/archivado antes que lo client-facing.

### Gates universales (cada PR)
1. `pnpm typecheck` + `pnpm build` (prod-like) + `pnpm test` (vitest) verdes.
2. Suites RLS `.sql` que apliquen: `tests/enterprise/rls-isolation`, `tests/team/*.sql`, `tests/separation/*.sql`, `tests/billing/coach-addons-rls.sql`.
3. Playwright del flujo tocado: `workout-flow`, `checkin-flow`, `nutrition-student-smoke`, `enterprise/*`.
4. **Vercel preview canary**: login coach + alumno; en `/c` ejecutar set + comida + check-in reales.
5. **Diff per-PR**: el string SELECT + cada `.eq/.in/.is` + el client-kind (anon vs service-role) **sin cambio**.

### Guardrails criticos (no negociables)
- **Nunca** cambiar `createServiceRoleClient` → `createRawAdminClient` (el segundo corre como el usuario de la request — gotcha `admin_client_rls_gotcha`).
- En reads service-role, los filtros manuales (`.eq('coach_id')`, `.eq('org_id')`, `.in(...)`) **son la unica frontera de seguridad** (RLS esta OFF) — jamas dropearlos.
- Los slug-resolvers de auth/login: dropear una columna GRANT-sensible bloquea un tenant entero (incidentes prod 404 anon-grant / 42501 branding).
- Money path (`webhook`, `finanzas`, `codigos`): cambios solo via spec dedicado + Simulador MP, nunca en pasada de "cleanup".

---

## FASE 1 — seguro, alto valor, arrancar ya

### 1.1 Alinear `@supabase/supabase-js` (web 2.101 / mobile 2.108 / enterprise 2.47)
- **Riesgo cliente: bajo.** `2.47 → 2.108` es **mismo major v2**, `getClaims` fue **aditivo** (no rename), createClient/getSession/onAuthStateChange sin cambios. El lockfile ya resuelve solo 2.101.1 + 2.108.2; **enterprise ya corre 2.108** en runtime (el `^2.47` es solo un floor stale en el manifest).
- **Orden:** PR-1 enterprise `^2.47→^2.108` (no-op runtime, prueba mecanica) → PR-2 mobile (ya en 2.108, no-op) → **PR-3 web ULTIMO** (unico client en GoTrue prod live).
- **Gate extra web:** `pnpm install --frozen-lockfile` debe pasar (gate exacto de Vercel) + preview + canary login coach **y** alumno + e2e auth de CI verde. Mobile/enterprise: `tsc --noEmit` manual + `expo export` (no tienen typecheck en CI).
- Beneficio colateral: mata el `ERR_PNPM_OUTDATED_LOCKFILE` semanal de dependabot.

### 1.2 Triage de leak en `console.*` (data-exposure) — SOON
- ~265 `console.*` en `apps/web/src`; ~35 en server paths (billing/client/workout) pueden filtrar `coachId`/datos de pago a logs de prod.
- **PR-1:** regla `no-console: ['warn', { allow: ['error','warn'] }]` scoped a `apps/web/src` (flagea los 2 `console.log` + info/debug, no toca los `console.error` estructurados legitimos).
- **PR-2..N:** revisar los ~35 logs server; redactar/eliminar los que interpolen email/token/card/payment id. Grep `email|password|token|card|cvv|@` cerca de cada `console.*`.

### 1.3 Sacar `revalidatePath` de services → wrappers `_actions`
- **13 calls** en `client-detail.service.ts` (2) + `workout.service.ts` (11), **todas** alcanzadas solo via 2 wrappers `'use server'` (`client-detail.actions.ts`, `builder.actions.ts`). Precedente in-tree: `markCheckInReviewed` ya revalida en el wrapper.
- **2 MINAS:**
  - `syncProgramFromTemplateAction` NO revalida solo — hace `return saveWorkoutProgramAction(...)` y hereda sus 3 revalidaciones → el wrapper de sync DEBE replicarlas.
  - `assignProgramToClientsAction` revalida **por-alumno dentro del loop** → el service debe **devolver `assignedClientIds: string[]`** para que el wrapper revalide cada uno.
- **4 PRs ascendentes** (PR1 client-detail → PR2 delete/duplicate workout → PR3 save+sync → PR4 assign-loop). Invariante: post-cambio el set de paths revalidados == pre-cambio, **incluido `/c` layout** (app del alumno live) y los paths por-alumno. Canary de stale-cache cada PR (que el `/c` del alumno refleje el save del coach sin reload).

---

## FASE 2 — estructural, riesgo medio

### 2.1 Split `WeeklyPlanBuilder.tsx` (1922 lineas, 82 hooks) — mayor valor
- Scaffold YA existe y en marcha: `hooks/usePlanBuilder.ts` (reducer testeado) + `components/` (12 sub-componentes, varios testeados) + helpers puros al top. Residual = glue del orquestador.
- **1 slice por PR (<300 lineas):** (a) derivaciones puras → `builderDerive.ts` (unit-test); (b) grupos useState+handler → hooks enfocados; (c) subtrees JSX → `components/` por props.
- **Regla dura:** NO tocar el payload de save, `WorkoutProgramSchema`, el flujo optimista `expectedUpdatedAt`, ni el mapeo `section_template_id` (alimentan `saveWorkoutProgramAction` que escribe los programas que ejecutan alumnos live). Gate: `workout-flow.spec.ts` + canary (build+save+assign, abrir app alumno, comparar vs baseline).

### 2.2 Split `org.actions.ts` (1448 lineas, ~26 actions) — bajo riesgo cliente, alto footgun
- Enterprise **archivado comercialmente** (unica puerta `/admin/orgs`) → regresion casi no toca usuarios live. PERO maximo footgun `'use server'`.
- Split por dominio: `org-branding/coaches/clients/staff/templates.actions.ts`, cada uno `'use server'` exportando **solo async functions**. Shared/types/consts → lib NO-`'use server'`. Preservar el BOM + primera linea `'use server'`. Actualizar callers directo (no barrel re-export — gotcha del re-export sin `from`).
- **Gate CRITICO (CLAUDE.md):** `pnpm build` + `pnpm start` + **POST de cada action migrada** via `/admin/orgs` (el GET de la pagina NO basta — el modulo `'use server'` se evalua solo en el POST; un re-export malo da pagina verde + 500 al submit).

### 2.3 Split `NutritionTabB5.tsx` (1723) + `coach/subscription/page.tsx` (1459)
- NutritionTabB5: bajo riesgo (coach display). Extraer sub-secciones presentacionales por props + helpers puros con tests. Data fetch / mutations sin tocar.
- subscription: cuidado **display de plata**. Extraer mapas/helpers de formato (precios CLP, descuentos) a `subscription.display.ts` **con unit-test del calculo CLP byte-identico**; paneles presentacionales por props; NO alterar montos mostrados ni que server action dispara cada boton (correctitud SERNAC/billing).

### 2.4 Lint react-compiler — **1 solo PR + QA manual** (NO 5 PRs)
> **Reframe clave:** `reactCompiler:true` con `panicThreshold:'none'` → el compilador DEJA SIN COMPILAR (no miscompila) lo que viola reglas. **Ninguno de los 5 es bug runtime hoy.** Peor caso = ProportionPlate pierde memoizacion (solo perf). El riesgo esta en arreglarlos mal.
- `ProportionPlate.tsx:154` — `let cursor` reasignado en `.map` (el unico bailout real de memoizacion) → reescribir con `reduce` (output byte-identico). Agregar mini unit-test de los wedge boundaries.
- `WorkoutTimerProvider.tsx:73` + `ExerciseVideo.tsx:41` — patron canonico "latest ref" → mover el write del ref a `useEffect` commit-time, O `eslint-disable` scoped con comentario. Verificar que el effect principal NO recree el player/timer.
- `usePlanBuilder.ts:264` — **falso positivo** (el reducer solo corre en dispatch, no en render) → `eslint-disable` scoped + comentario. NO inline-ar areas en deps (resetearia undo/redo).
- `Stopwatch.tsx:18` — `useRef(Date.now())` → `useRef(0)` (el seed se sobrescribe en el effect antes de leerse).
- QA preview: timer rest/swap (toast "reemplazado"), video con trim, plato nutricion.

---

## FASE 3 — clean-arch repos (deuda #1, incremental, maximo cuidado)

> Numeros (verify): **44 `_data/*.queries.ts` puros bypass** + **9 `page.tsx`** con `.from()` inline (los otros 8 solo pasan el client a un service = OK). **8 `_data` ya correctos** → `coach/cardio/_data/cardio.queries.ts` es el **TEMPLATE**.

**Metodo:** repo fn recibe el `DbClient` **inyectado por el caller** (asi el caller decide anon vs service-role → preserva contexto RLS). Copiar SELECT + filtros byte-identico. `React.cache` se queda en `_data`. Logica de tiempo/presentacion fuera del repo. Exportar del barrel `infrastructure/db/index.ts`. Una ruta/dominio por PR.

**Escalera (blast-radius creciente):**
- **Grupo A — admin anon-only** (interno, gate ADMIN_EMAILS). Arranca aca: regresion no llega a coach/alumno. Construye muscle-memory del patron.
- **Grupo B — coach anon** (~18-20 files, RLS-scoped → un slip queda contenido a ese coach). Mapear a repos existentes (workout/nutrition/client/coach), no forkear. Gate: `tests/separation/*` + `tests/team/*.sql`.
- **Grupo C — login/onboarding + org/e/t anon.** Auth = mas stakes (un slug-resolver roto bloquea un tenant). Canary login manual obligatorio por PR.
- **Grupo D — admin/auth SERVICE-ROLE** (finanzas, codigos, orgs, teams, gastos, sistema, auditoria + e/t login). RLS OFF → filtro SQL = unica seguridad; numeros de plata deben quedar exactos. Money files (finanzas/codigos) ultimos. Doble reviewer. Todas las suites RLS `.sql`.
- **Grupo E — client-facing `/c` (RED, DEAD LAST).** 14 files (workout/nutrition/checkin de alumnos live). Los 2 service-role (`workout-execution.queries.ts` — mezcla anon + service-role; `client-root.queries.ts`) son **los 2 ultimos PRs de todo el plan**. `workout-execution`: separar en 2 repo fns con client explicito (uno anon, uno service-role), preservar `.in(areaIds)+.or(tenantFilters)+.is('deleted_at',null)` verbatim. Canary manual: ejecutar workout real + comida + check-in como alumno seed antes de CADA merge.

---

## DEJAR / NO HACER

- **`webhook/route.ts` (1264):** NO split. SPOF de plata, orden de branches y early-returns load-bearing (origen de P0s pasados: doble-cobro, 502). Maximo extraer 3 helpers puros. Cambios reales = spec dedicado + Simulador MP.
- **`WorkoutExecutionClient.tsx` (907):** ya es el mas modular; minimal-touch (solo helpers) o diferir. Max riesgo (sesion alumno en vivo) / min payoff.
- **root `package.json` boundary:** DIFERIR. Mover ~50 deps a `apps/web` arriesga phantom-dep que solo rompe en build Vercel; payoff bajo.
- **`cmdk`:** skip o bundle en un "dead-dep PR". Ya tree-shaken (0 render), y borrar `command.tsx` choca con "no tocar `components/ui`". Payoff ~0.
- **`.git` 68MB historia:** **NO reescribir.** Todo es history-only (HEAD limpio). `filter-repo` reescribe cada SHA en repo compartido con PRs/worktrees/dependabot + SHAs citados en memoria. Maximo `git gc` (recupera poco). Solo si algun dia: dia sin PRs, coordinado, todos re-clonan.
- **231 `any`:** ratchet `warn`→down annotations-only, NUNCA big-bang (231 fails bloquea todo PR).

---

## Orden de arranque recomendado
1. **1.1 supabase-js enterprise PR** (no-op, prueba el patron, mata lockfile-drift).
2. **1.2 console no-console rule** (1 PR chico) + triage de los ~35 server logs.
3. **1.3 revalidatePath** (4 PRs ascendentes).
4. Luego Fase 2 (WeeklyPlanBuilder + org.actions en paralelo, distintos folders) + el PR de lint.
5. Fase 3 al final, larga cola A→E, una ruta por PR.

---

## Adenda — investigacion 2026 (mejoras al plan)

Busqueda web junio 2026. 5 mejoras concretas que se incorporan:

### M1 — El patron tiene nombre: **Branch by Abstraction** + Parallel Run para Grupos D/E
Lo que el plan llama "repo fn con DbClient inyectado, luego swap del call site" es formalmente **Branch by Abstraction** (la version intra-codebase del Strangler Fig). Mejora accionable: para los grupos de **maximo riesgo (D service-role / E client `/c`)**, agregar un paso opcional de **Parallel Run** — correr la query VIEJA inline y la NUEVA del repo en paralelo en el preview/canary y **assertar filas identicas** antes de borrar la vieja. Detecta cualquier drift de filtro/scope que el diff a ojo no ve. (Fuentes: AWS Branch-by-Abstraction, Strangler Fig.)

### M2 — **Golden Master / characterization tests** como gate de los splits y de `/c`
Las cajas grandes (WeeklyPlanBuilder, NutritionTabB5) y las queries `/c` tienen cobertura fina. Antes de refactorizar: **capturar un golden master** — el payload JSON de save, el output renderizado, o las filas de la query — y assertar **byte-identico** despues. Es mas fuerte que "diff el SQL a ojo". Implementar como snapshot/approval test en vitest. Vuelve seguro refactorizar codigo sin tests previos. (Es el metodo canonico de "Working Effectively with Legacy Code".)

### M3 — `revalidateTag`/`updateTag` es el target mas preciso (Next 16) — FUTURO, no ahora
Best-practice 2026: preferir **tag-based** sobre `revalidatePath` (mas preciso, evita over-invalidation). El plan revalida el `/c` layout ENTERO en cada save de coach = over-invalidation. PERO EVA usa `React.cache` (dedup por request), NO el fetch-cache / `use cache`, y CLAUDE.md prohibe `unstable_cache` → tag-based **no esta cableado hoy**. La regla "nunca revalidar dentro de un read/cached fn" **confirma** que sacar `revalidatePath` de los services es correcto. Decision: el move a `_actions` se queda (paso seguro); migrar a `revalidateTag` + Cache Components queda como **optimizacion futura spec'd**, no en esta limpieza. (Fuente: Next.js docs revalidateTag/cacheLife.)

### M4 — Los false-positives de react-compiler estan reconocidos upstream
El "Cannot access refs during render" tiene **false-positives confirmados** por el equipo React (issue react/react#35625, ene-2026, caso `props.ref`). Refuerza la decision del plan de tratar `usePlanBuilder.ts:264` como falso-positivo con `eslint-disable` scoped. Referencia canonica de fixes: `react.dev/reference/eslint-plugin-react-hooks/lints/refs`. Sin cambio al plan, mas confianza.

### M5 — Adoptar **Knip** en CI como ratchet automatico (ts-prune esta ARCHIVADO)
La auditoria de dead-code/deps/any se hizo a mano. Tooling 2026: **`ts-prune` esta archivado y recomienda Knip**; Knip soporta **monorepos/workspaces** y analiza archivos + exports + deps juntos (mas preciso que depcheck/ts-prune). Accion: agregar `npx knip --reporter compact` al job de CI (`ci.yml`) como red automatica que bloquea dead-code/deps nuevos por PR — pareado con ESLint (unused vars in-file). Reemplaza la auditoria manual y previene la re-acumulacion. Bonus: complementa el ratchet de `no-console` + `no-explicit-any` de la Fase 1.

### Resumen de cambios al plan
- Grupos D/E: **+Parallel Run** (correr vieja+nueva, assert filas iguales) antes de borrar la vieja.
- Splits + `/c`: **+Golden Master snapshot** como gate (no solo diff a ojo).
- `/c` layout over-invalidation: documentado como deuda futura (migrar a `revalidateTag`), no se toca ahora.
- CI: **+Knip** como ratchet de dead-code/deps; mantiene la limpieza en el tiempo.


2026-05-20

- Retome el handoff de arquitectura desde `HANDOFF-ARCHITECTURE-SPRINT.md`.
- Verifique `git status --short` antes de tocar archivos.
- Relei el plan `ok-primero-que-nada-declarative-bunny.md`.
- Busque `createClient` y `supabase.from` directos en `apps/web/src/app/**/page.tsx`.
- Cree carpetas `_data/` para las paginas server pendientes de F2-B.
- Cree queries con `React.cache` para empezar a sacar Supabase directo de `page.tsx`:
  - `apps/web/src/app/coach/settings/_data/settings.queries.ts`
  - `apps/web/src/app/coach/builder/[clientId]/_data/builder.queries.ts`
  - `apps/web/src/app/coach/recipes/[recipeId]/_data/recipe-detail.queries.ts`
  - `apps/web/src/app/coach/reactivate/_data/reactivate.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/onboarding/_data/onboarding.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/check-in/_data/check-in.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/exercises/_data/exercises.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/nutrition/_data/nutrition-auth.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/workout-history/_data/workout-history.queries.ts`
  - `apps/web/src/app/coach/foods/_data/foods.queries.ts`
  - `apps/web/src/app/coach/workout-programs/builder/_data/template-builder.queries.ts`
  - `apps/web/src/app/coach/nutrition-plans/new/_data/new-template.queries.ts`
  - `apps/web/src/app/coach/nutrition-plans/client/[clientId]/_data/client-plan-page.queries.ts`
  - `apps/web/src/app/coach/nutrition-plans/[templateId]/edit/_data/edit-template.queries.ts`
  - `apps/web/src/app/coach/settings/preview/_data/preview.queries.ts`
  - `apps/web/src/app/coach/onboarding/complete/_data/complete.queries.ts`
  - `apps/web/src/app/admin/login/_data/login.queries.ts`

Siguiente paso inmediato:
- Actualizar los `page.tsx` correspondientes para consumir estos `_data/*.queries.ts`.

Avance posterior:
- Actualice pages server para consumir `_data` en:
  - `coach/settings`
  - `coach/builder/[clientId]`
  - `coach/recipes/[recipeId]`
  - `coach/reactivate`
  - `c/[coach_slug]` root/suspended/login/onboarding/check-in/exercises/nutrition/workout/workout-history
  - `coach/foods`
  - `coach/workout-programs/builder`
  - `coach/nutrition-plans` y subrutas `new`, `client/[clientId]`, `[templateId]/edit`
  - `coach/settings/preview`
  - `coach/onboarding/complete`
  - `admin/login`
- Cree `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts` y deje `page.tsx` como shell RSC fina.
- Cree `apps/web/src/app/coach/nutrition-plans/_data/nutrition-page.queries.ts`.
- Agregue `getClientDashboardUser()` a `c/[coach_slug]/dashboard/_data/dashboard.queries.ts` y quite `createClient()` directo de `c/[coach_slug]/dashboard/page.tsx`.

Verificacion parcial:
- Busqueda `rg -n createClient apps/web/src/app -g page.tsx` ya solo muestra usos de `@/lib/supabase/client` en paginas client-side:
  - `auth/exchange/page.tsx`
  - `(auth)/login/page.tsx`
  - `(auth)/register/page.tsx`
- Primer `npm run typecheck -w @eva/web` fallo solo por import relativo incorrecto en `c/[coach_slug]/suspended/page.tsx`.
- Corregido import de `./_data/client-root.queries` a `../_data/client-root.queries`.

Estado para continuar:
- Ejecutar de nuevo `npm run typecheck -w @eva/web`.
- Si queda limpio, F2-B para `page.tsx` server queda practicamente cerrada; quedan por auditar `layout.tsx` server (`coach/layout.tsx`, `admin/(panel)/layout.tsx`) si se decide incluir layouts en la misma regla.

Resultado final de esta pausa:
- `npm run typecheck -w @eva/web` limpio.
- Queda en punto seguro para retomar F2-B layouts o seguir F3 Clean Architecture.

2026-05-21

- Retome desde el punto seguro anterior.
- Verifique `git status --short`.
- Revalide busquedas:
  - `rg -n createClient apps/web/src/app -g page.tsx` solo muestra Supabase client-side en `(auth)` y `auth/exchange`.
  - `rg -n createClient apps/web/src/app -g layout.tsx` mostro `coach/layout.tsx` y `admin/(panel)/layout.tsx`.
- Cree:
  - `apps/web/src/app/coach/_data/layout.queries.ts`
  - `apps/web/src/app/admin/(panel)/_data/layout.queries.ts`
- Quite `createClient()` directo de:
  - `apps/web/src/app/coach/layout.tsx`
  - `apps/web/src/app/admin/(panel)/layout.tsx`
- Verifique F2-B:
  - `rg -n createClient apps/web/src/app -g page.tsx -g layout.tsx` solo muestra `@/lib/supabase/client` en paginas client-side de auth.
  - `npm run typecheck -w @eva/web` limpio.

Estado:
- F2-B server pages/layouts queda cerrado.
- Siguiente: F3-A/F3-B Clean Architecture (`infrastructure/db/interfaces.ts` y repositories faltantes).

F3-A/F3-B:
- Revise repositories existentes:
  - `apps/web/src/infrastructure/db/coach.repository.ts`
  - `apps/web/src/infrastructure/db/client.repository.ts`
  - `apps/web/src/infrastructure/db/org.repository.ts`
- Cree `apps/web/src/infrastructure/db/interfaces.ts`.
- Cree repositories faltantes:
  - `apps/web/src/infrastructure/db/workout.repository.ts`
  - `apps/web/src/infrastructure/db/nutrition.repository.ts`
  - `apps/web/src/infrastructure/db/admin.repository.ts`
- Actualice `apps/web/src/infrastructure/db/index.ts` para exportar interfaces y nuevos repositories.
- Primer typecheck F3 fallo por columnas inexistentes en selects nuevos (repositorios creados contra nombres antiguos).
- Ajuste selects a columnas reales de `apps/web/src/lib/database.types.ts`:
  - `coaches` no tiene `email`.
  - `nutrition_plans` usa `protein_g/carbs_g/fats_g`, no `daily_*_g` ni `description`.
  - `nutrition_meals` es tabla simple con `description`, no campos de macro por comida.
  - `foods` no tiene `fiber_g/is_public/created_at/updated_at`.
  - `workout_plans` no tiene `description`.
  - `workout_logs` no tiene `plan_id/notes/created_at`.
  - `workout_programs` usa `program_notes/duration_days/duration_type`, no `description/goal/level/duration_weeks/is_template`.
- `npm run typecheck -w @eva/web` limpio despues de ajustes F3-A/F3-B.

Siguiente:
- F3-C incremental: migrar `_data` existentes a usar repositories donde sea bajo riesgo.

Confirmacion:
- El trabajo sigue el plan `ok-primero-que-nada-declarative-bunny.md`.
- Estado por fases:
  - F1: ya venia completada desde handoff.
  - F2-A/F2-C: ya venian completadas desde handoff.
  - F2-B: cerrado para `page.tsx` server y `layout.tsx` server.
  - F3-A/F3-B: completado y typecheck limpio.
  - F3-C: en progreso.

F3-C avance previo:
- Extendi `CoachRow` en `apps/web/src/infrastructure/db/coach.repository.ts` con:
  - `current_period_end`
  - `trial_ends_at`
- Migre una query directa de `coaches` en `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts` a `findCoachById(supabase, userId)`.
- Usuario pidio corregir esto: F3-C debe quedar completo, no parcial.

F3-C objetivo a cerrar ahora segun handoff:
- `coach/dashboard/_data/dashboard.queries.ts` debe usar `coach.repository.ts`.
- `c/[coach_slug]/dashboard/_data/dashboard.queries.ts` debe usar `client.repository.ts`.
- `admin/(panel)/dashboard/_data/admin.queries.ts` debe usar `admin.repository.ts`.
- Verificar tambien fases anteriores con busquedas y typecheck.

F3-C cierre en progreso:
- Agregue `findDashboardClientById()` a `client.repository.ts` y lo conecte en `c/[coach_slug]/dashboard/_data/dashboard.queries.ts`.
- Agregue helpers admin a `admin.repository.ts` y conecte `admin/(panel)/dashboard/_data/admin.queries.ts`.
- Agregue helpers de coach dashboard a `coach.repository.ts`:
  - `countCoachClients`
  - `findCoachRecentClients`
  - `findCoachClientSignupDates`
- Corregi barrel atomics: `components/ui/sonner.tsx` exporta `Toaster`, asi que `atoms/index.ts` reexporta `Toaster as Sonner`.

F3-C verificado completo:
- `rg -n "\.from\('coaches'\)|\.from\('clients'\)|\.from\('admin_audit_logs'\)"` sobre:
  - `apps/web/src/app/admin/(panel)/dashboard/_data/admin.queries.ts`
  - `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`
  - `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts`
  no devolvio resultados.
- `npm run typecheck -w @eva/web` limpio.

Verificacion fases previas:
- F1: `rg "@eva/schemas|safeParse|zod"` confirma `apps/mobile` auth usando schemas compartidos y `zod` en `apps/mobile/package.json`.
- F2-A: script sobre `apps/web/src/app/**/actions.ts` no encontro root actions fuera del patron barrel `export * from './_actions/...`.
- F2-B: `rg -n createClient apps/web/src/app -g page.tsx -g layout.tsx` solo muestra `@/lib/supabase/client` en paginas client-side de auth.
- F3-A/F3-B: `index.ts` exporta `interfaces`, `workout.repository`, `nutrition.repository`, `admin.repository`.

Siguiente:
- F4-B/F4-C: crear `packages/tokens` y agregar `@eva/tokens` a `optimizePackageImports`.

F4-B/F4-C:
- Cree `packages/tokens/`:
  - `package.json`
  - `index.ts`
  - `theme.css`
- Agregue `@eva/tokens` como workspace file dep en `package.json` raiz.
- Agregue `@eva/tokens` a `experimental.optimizePackageImports` en `apps/web/next.config.ts`.
- Agregue alias mobile `@eva/tokens` en `apps/mobile/tsconfig.json`.
- Valide JSON de `package.json` y `apps/mobile/tsconfig.json`.
- `npm run typecheck -w @eva/web` limpio.

F4-D:
- Cree barrels mobile sin mover componentes:
  - `apps/mobile/components/atoms/index.ts`
  - `apps/mobile/components/molecules/index.ts`
  - `apps/mobile/components/organisms/index.ts`

Mobile typecheck:
- `npx tsc --noEmit` en `apps/mobile` fallo con errores detectados:
  - Zod v4 usa `error.issues`, no `error.errors`.
  - `ClientProfile` no exponia `userId`, pero pantallas alumno lo usan.
  - Falta declaracion TS local para `react-native-webview`.
- Corregi:
  - `apps/mobile/app/(auth)/login.tsx`
  - `apps/mobile/app/(auth)/register.tsx`
  - `apps/mobile/lib/client.ts`
  - `apps/mobile/types/react-native-webview.d.ts`
- Ejecute `npm install --package-lock-only --ignore-scripts` para actualizar lockfile por `@eva/tokens`.
- `npm run typecheck -w @eva/web` limpio.
- Segundo mobile typecheck pidio props extra de WebView; agregue `allowsInlineMediaPlayback` y `javaScriptEnabled` a la declaracion local.
- `npx tsc --noEmit` en `apps/mobile` limpio.
- `npm run typecheck -w @eva/web` limpio.

Estado actualizado:
- F1 verificado.
- F2-A/F2-B/F2-C verificados.
- F3-A/F3-B/F3-C verificados.
- F4-A/F4-B/F4-C/F4-D/F4-E implementados y typecheck web/mobile limpio.

Pendiente del plan:
- F3-D/F3-E: services y thin actions para fat files `builder.actions.ts` y `client-detail.actions.ts`.
- F3-F: migrar/delegar queries de `lib/coach/get-coach.ts` y `lib/news/queries.ts` hacia infrastructure.

F3-F:
- Migre `apps/web/src/lib/coach/get-coach.ts` para delegar lookup a `findCoachById()` de `coach.repository.ts`.
- Agregue helpers de news en `admin.repository.ts`:
  - `findPublishedNewsIds`
  - `findNewsReadsByCoach`
  - `findPublishedNewsItems`
- Migre `apps/web/src/lib/news/queries.ts` para delegar queries a esos helpers.
- Verifique `rg -n "\.from\(" apps/web/src/lib/coach/get-coach.ts apps/web/src/lib/news/queries.ts`: sin resultados.
- `npm run typecheck -w @eva/web` limpio.
- `npx tsc --noEmit` en `apps/mobile` limpio.

Pendiente unico del plan arquitectonico principal:
- F3-D/F3-E: services y thin actions para fat files.

Checkpoint verificado:
- `git status --short` revisado.
- `npm run typecheck -w @eva/web` limpio.
- `npx tsc --noEmit` en `apps/mobile` limpio.
- No entre aun a F3-D/F3-E porque son los dos cambios de mayor riesgo:
  - `apps/web/src/app/coach/builder/[clientId]/_actions/builder.actions.ts` tiene 995 lineas y 10 exports.
  - `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` tiene 941 lineas y mezcla queries cacheadas + mutations.

F3-D/F3-E inicio:
- Usuario pidio completar el plan.
- Objetivo ahora:
  - Crear services `apps/web/src/services/workout/workout.service.ts` y `apps/web/src/services/client/client.service.ts`.
  - Extraer logica de negocio de los fat server actions.
  - Dejar actions como wrappers thin: auth/validacion -> service -> `revalidatePath`.

F3-E avance client service:
- Cree `apps/web/src/services/client/client.service.ts`.
- Extraje logica de:
  - `addPayment`
  - `deletePayment`
  - `getWeeklyCompliance`
  - `updateClientGoalWeight`
- `client-detail.actions.ts` queda como wrapper para esas mutations/queries acotadas: auth -> service -> revalidate cuando corresponde.

F3-D workout service:
- Movi implementation fat de `apps/web/src/app/coach/builder/[clientId]/_actions/builder.actions.ts` a `apps/web/src/services/workout/workout.service.ts`.
- Ajuste import relativo de `ProgramListModel` a alias absoluto.
- Recree `builder.actions.ts` como wrapper thin con `'use server'` que delega todas las exports al service.

F3-E client-detail service:
- Movi implementation fat de `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` a `apps/web/src/services/client/client-detail.service.ts`.
- Ajuste imports relativos de helpers de perfil a aliases absolutos.
- Recree `client-detail.actions.ts` como wrapper thin con `'use server'` que delega todas las exports al service.

Verificacion F3-D/F3-E:
- `rg -n "createClient|from\(|revalidatePath|cache\("` sobre:
  - `apps/web/src/app/coach/builder/[clientId]/_actions/builder.actions.ts`
  - `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts`
  no devolvio resultados.
- `npm run typecheck -w @eva/web` limpio.
- `npx tsc --noEmit` en `apps/mobile` limpio.

Nota de auditoria:
- Un grep global de `.from(` en `apps/web/src/app/**/*.actions.ts` aun muestra muchas acciones fuera de los dos fat files del plan (`org`, nutrition actions, settings, auth, etc.).
- El plan/handoff nombraba F3-D/F3-E especificamente para `builder.actions.ts` y `client-detail.actions.ts`; esos dos quedaron thin.

Pruebas solicitadas:
- Usuario pidio correr pruebas necesarias despues de completar el plan.
- Voy a ejecutar:
  - typecheck web/mobile ya estaban limpios, se mantienen como baseline.
  - `npx vitest run`
  - `npm run build -w @eva/web`
  - Playwright/E2E si hay base URL o servidor disponible.

Resultado inicial de pruebas:
- `npx vitest run` fallo: 25 archivos pasaron, 4 fallaron, 7 tests fallidos.
- `npm run build -w @eva/web` fallo por incompatibilidad Next 16/Turbopack:
  - archivos `actions.ts` con `'use server'` + `export * from './_actions/...'`.
  - Next exige que un archivo `'use server'` exporte solo funciones async.
- Correccion aplicada:
  - quite `'use server'` de los 13 barrel `actions.ts` con `export *`.
  - en `client-detail.actions.ts`, cambie `export const getClientProfileData = ...` por `export async function getClientProfileData(...)`.
- Re-ejecucion:
  - `npm run typecheck -w @eva/web` limpio.
  - `npm run build -w @eva/web` limpio.
  - Warning no bloqueante: Next indica que `middleware` convention esta deprecada y sugiere `proxy`.

F4-A:
- Revise barrels actuales:
  - `apps/web/src/components/atoms/index.ts`
  - `apps/web/src/components/molecules/index.ts`
  - `apps/web/src/components/organisms/index.ts`
- Confirme existencia de componentes UI/coach/client listados en el plan.
- Complete exports explicitos en atoms, molecules y organisms.

Correccion de tests post-plan:
- Ajuste tests desfasados por queries nuevas:
  - `apps/web/src/app/(auth)/login/actions.test.ts` ahora mockea `clients` y `organization_members` usados por `resolvePostLoginRedirect()`.
  - `apps/web/src/app/(auth)/register/actions.test.ts` ahora mockea la query extra de `generateUniqueInviteCode()`.
  - `apps/web/src/app/coach/clients/actions.test.ts` ahora mockea correctamente el doble `.eq()` del conteo de alumnos activos.
  - `apps/web/src/lib/nutrition-schemas.test.ts` valida unidad invalida real (`oz`), dejando `ml` permitido para alimentos liquidos.
- Primer re-run de `npx vitest run` bajo de 7 fallos a 2 fallos, ambos en `coach/clients/actions.test.ts`.
- Complete fixture de `createClientAction` con `age_confirmed = on`, requerido por `CreateClientSchema`.
- Segundo re-run `npx vitest run` limpio:
  - 29 test files passed.
  - 128 tests passed.
  - 2 files / 4 tests skipped de RLS.
  - Warnings esperados/no bloqueantes: webhook token ausente en test negativo y email de bienvenida sin `RESEND_API_KEY`.

Verificacion final adicional:
- `npm run typecheck -w @eva/web` limpio.
- `npx tsc --noEmit` en `apps/mobile` limpio.
- `npm run build -w @eva/web` limpio.
- `npx playwright test` no quedo limpio por entorno local:
  - varios tests requieren Supabase local en `127.0.0.1:54321` y fallo `ECONNREFUSED`.
  - varios tests enterprise requieren seeds/credenciales (`coach-owner-a@eva-test.cl`, invites) que no estan disponibles en el entorno actual.
  - esto queda como bloqueo de entorno E2E, no como fallo de typecheck/build/unit.
- `git diff --check` detecto un trailing whitespace en `apps/web/src/app/coach/workout-programs/builder/page.tsx`; corregido.
- Re-run `git diff --check` limpio; solo quedan warnings de CRLF/LF de Git en Windows.

2026-05-21 - Verificacion total solicitada con Supabase local levantado:
- Usuario levanto Docker/Supabase local y pidio probar todo.
- `npx supabase status` confirma APIs locales arriba:
  - Project URL `http://127.0.0.1:54321`
  - DB `127.0.0.1:54322`
  - Studio `127.0.0.1:54323`
  - Mailpit `127.0.0.1:54324`
- `npm run e2e:check-env` falla por variables faltantes:
  - `E2E_COACH_SLUG`
  - `E2E_CLIENT_EMAIL`
  - `E2E_CLIENT_PASSWORD`
- Siguiente: correr typecheck, tests unitarios, build y Playwright completo para separar regresiones reales de entorno/datos.
- Resultados:
  - `npm run typecheck -w @eva/web` limpio.
  - `npx tsc --noEmit` en `apps/mobile` limpio.
  - `git diff --check` limpio; solo warnings CRLF/LF.
  - `npx vitest run` limpio: 29 files passed, 128 tests passed, 2 files/4 tests skipped RLS.
  - `npm run build -w @eva/web` limpio; warning no bloqueante de Next sobre `middleware` deprecado a `proxy`.
- Siguiente: `npx playwright test` completo contra Supabase local.
- Primer `npx playwright test` contra Supabase local:
  - 23 passed.
  - 5 skipped.
  - 22 failed.
  - 2 did not run.
- Diagnostico:
  - La DB local estaba arriba pero sin schema/seed enterprise: faltaban tablas `organizations` y `organization_invites`.
  - Tambien faltaban usuarios seed `coach-owner-a@eva-test.cl`, `coach-owner-b@eva-test.cl`, `coach-member-a1@eva-test.cl`, `coach-standalone@eva-test.cl`.
  - Mailpit responde en `http://127.0.0.1:54324/api/v1/messages`; el endpoint Inbucket antiguo `/api/v1/status` devuelve 404.
- Ejecute `npx supabase db reset` con aprobacion para aplicar migraciones y seed local.
- Detecte que `.env.local` apunta al Supabase remoto, no al Docker local.
- Revalide seeds con overrides locales:
  - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
  - anon local de `npx supabase status`
  - service local de `npx supabase status`
  - usuarios seed principales existen salvo `coach-standalone@eva-test.cl` (seed actual usa `coach-solo@eva-test.cl`).
  - invites y orgs enterprise existen en local.
- `npm run e2e:check-env` pasa con:
  - `E2E_COACH_SLUG=coach-a1-test`
  - `E2E_CLIENT_EMAIL=client-a1@eva-test.cl`
  - `E2E_CLIENT_PASSWORD=TestPass123!`
- Playwright con env local revelo riesgo real de runtime:
  - Los barrels `actions.ts` sin `'use server'` compilaban, pero algunas Server Actions desde client components no quedaban registradas correctamente.
- Reemplace los 13 barrels `actions.ts` por wrappers async explicitos con `'use server'`:
  - admin login
  - client root/login/onboarding/check-in/workout
  - coach builder/clients/client detail/dashboard/exercises/meal-groups/recipes
- Verificacion despues de wrappers:
  - `npm run typecheck -w @eva/web` limpio.
  - tests focales de auth/clients actions limpios.
  - `npm run build -w @eva/web` limpio.
- Ajuste adicional:
  - Cambie wrappers de Server Actions de alumno (`login`, `onboarding`, `check-in`, `workout`) de rest params a firmas explicitas para evitar problemas de registro/bind con React/Next.
- Verificacion final tras firmas explicitas:
  - `npm run typecheck -w @eva/web` limpio.
  - `npm run build -w @eva/web` limpio.
  - `npx vitest run` limpio: 29 files passed, 128 tests passed, 2 files/4 tests skipped RLS.
  - `npx tsc --noEmit` en mobile limpio.
  - `git diff --check` limpio; solo warnings CRLF/LF.
  - Playwright `tests/auth.spec.ts` limpio: 2 passed.
  - Playwright `tests/enterprise/rls-isolation.spec.ts` limpio: 13 passed.
  - Playwright `tests/checkin-flow.spec.ts` no falla; queda skipped porque el usuario seed no cumple estado de acceso al flujo.
- Playwright completo aun no queda 100% verde por tests/fixtures desactualizados respecto del estado actual:
  - tests enterprise esperan `/coach/dashboard`, pero login de org owner redirige correctamente a `/org/crossfit-test-norte`.
  - tests Inbucket usan endpoint antiguo `/api/v1/status`; Supabase local actual levanta Mailpit, que responde en `/api/v1/messages`.
  - test register usa `getByLabel('Email')` y ahora matchea tambien checkbox de marketing; selector ambiguo del test.
  - nutrition smoke espera dashboard, pero seed `client-a1` cae en onboarding; requiere seed E2E de alumno con onboarding completo o test actualizado.

Informe por flujo para dejar pruebas E2E verdes:

1. Web publico
- Estado actual:
  - Landing `/` OK.
  - Login `/login` OK.
  - Build genera rutas publicas OK.
  - Pricing CTA OK.
- Fallo observado:
  - `tests/sprint3-register-pricing.spec.ts` -> `register multi-step keeps selected plan from query`.
- Causa:
  - Test usa `page.getByLabel('Email')`.
  - Ahora el selector matchea 2 elementos: input email y checkbox marketing.
  - Esto es selector ambiguo del test, no evidencia de bug del flujo.
- Para dejar verde:
  - Cambiar a `page.getByRole('textbox', { name: 'Email' })` o `page.locator('input[name="email"]')`.

2. Enterprise
- Estado actual:
  - Seguridad/RLS OK.
  - `tests/enterprise/rls-isolation.spec.ts` OK: 13/13 passed contra Supabase local.
  - Seeds enterprise existen despues de `npx supabase db reset`: orgs, memberships, invites, usuarios principales.
- Fallos observados:
  - `tests/enterprise/journey-e2e.spec.ts` falla por esperar `/coach/dashboard`.
  - `tests/enterprise/invite-flow.spec.ts` UI falla por esperar `/coach/dashboard`.
  - Test Inbucket falla en `/api/v1/status`.
- Causas:
  - App actual redirige org owners/admins a `/org/[slug]`, por ejemplo `/org/crossfit-test-norte`.
  - Los tests enterprise siguen esperando `/coach/dashboard`.
  - Seed usa `coach-solo@eva-test.cl`, no `coach-standalone@eva-test.cl`.
  - Supabase local actual levanta Mailpit en `:54324`; endpoint antiguo Inbucket `/api/v1/status` devuelve 404, pero `/api/v1/messages` responde 200.
- Para dejar verde:
  - Actualizar tests enterprise para esperar `/org/crossfit-test-norte` o aceptar `/org/.+`.
  - Cambiar `coach-standalone@eva-test.cl` por `coach-solo@eva-test.cl`, o agregar alias al seed.
  - Actualizar test de mail local a Mailpit: usar `/api/v1/messages` o hacer fallback Inbucket/Mailpit.

3. Coach enterprise
- Estado actual:
  - Login de `coach-owner-a@eva-test.cl` funciona.
  - Redirecciona a `/org/crossfit-test-norte`.
  - Snapshot Playwright mostro dashboard org cargado con seats, coaches, clientes y sidebar enterprise.
- Fallo observado:
  - Tests de dashboard/onboarding/perf esperan `/coach/dashboard`.
- Causa:
  - Se usaron credenciales enterprise en tests que esperan flujo coach standalone.
  - La redireccion a `/org/[slug]` parece comportamiento correcto para enterprise.
- Para dejar verde:
  - Separar tests:
    - Enterprise coach owner/admin -> esperar `/org/[slug]`.
    - Coach standalone -> esperar `/coach/dashboard`.

4. Coach standalone
- Estado actual:
  - No quedo cubierto por Playwright completo con credencial standalone correcta.
  - Typecheck/build/unit cubren codigo general.
- Fallo observado:
  - `navigation-perf-smoke` fallo porque `PERF_COACH_EMAIL` estaba en `coach-owner-a@eva-test.cl` y ese usuario redirige a org.
- Causa:
  - Fixture/variable equivocada para el objetivo del test.
- Para dejar verde:
  - Usar:
    - `PERF_COACH_EMAIL=coach-solo@eva-test.cl`
    - `PERF_COACH_PASSWORD=TestPass123!`
  - O actualizar test para soportar ambos destinos:
    - standalone -> `/coach/dashboard`
    - enterprise -> `/org/[slug]`

5. Alumno
- Estado actual:
  - Login alumno con `client-a1@eva-test.cl` autentica, pero cae en `/c/coach-a1-test/onboarding`.
  - `tests/checkin-flow.spec.ts` no falla; queda skipped porque el usuario seed no cumple acceso/estado para check-in.
- Fallos observados:
  - `tests/nutrition-student-smoke.spec.ts` espera `/c/coach-a1-test/dashboard`, pero llega a onboarding.
  - No se probo workout completo porque falta `E2E_WORKOUT_PLAN_ID`.
- Causa:
  - Seed alumno no esta en estado onboarding completo para esos smoke tests.
  - Faltan fixtures E2E dedicados para nutrition/check-in/workout.
- Para dejar verde:
  - Crear o ajustar seed de alumno E2E con:
    - auth user confirmado.
    - row en `clients`.
    - `force_password_change=false`.
    - onboarding/intake completo segun lo que la app consulta.
    - acceso activo al coach slug usado.
    - plan nutricional asignado si se quiere validar `/nutrition`.
    - plan/workout asignado y `E2E_WORKOUT_PLAN_ID` si se quiere validar `/workout/[planId]`.
  - Variables sugeridas:
    - `E2E_COACH_SLUG=coach-a1-test`
    - `E2E_CLIENT_EMAIL=<cliente_e2e_onboarding_completo>`
    - `E2E_CLIENT_PASSWORD=TestPass123!`
    - `E2E_WORKOUT_PLAN_ID=<plan_id_del_seed>`

6. Acciones tomadas por Codex durante verificacion
- Detecte y corregi riesgo real de Server Actions:
  - `actions.ts` barrel sin `'use server'` compilaban, pero podian fallar en runtime.
  - Los 13 barrels ahora son wrappers async explicitos con `'use server'`.
  - Las actions de alumno (`login`, `onboarding`, `check-in`, `workout`) usan firmas explicitas para compatibilidad con React/Next Server Actions.
- Revalide:
  - typecheck web OK.
  - typecheck mobile OK.
  - Vitest OK.
  - build OK.
  - RLS enterprise OK.
  - auth smoke OK.

7. Conclusión operativa
- La reestructuracion no rompe compile/build/unit.
- El punto real encontrado en runtime fue Server Actions por barrels; corregido.
- Lo pendiente para suite E2E 100% verde es normalizar fixtures/tests:
  - actualizar redirects enterprise,
  - usar credencial standalone real para coach standalone,
  - crear alumno E2E post-onboarding,
  - actualizar endpoint Mailpit,
  - corregir selector ambiguo de register.

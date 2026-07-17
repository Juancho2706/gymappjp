# Check-ins con estado "revisado" (cola del coach) - TASKS

**Status:** COMPLETADO 2026-07-04
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/checkins-revisado/SPEC.md`
**Plan:** `specs/checkins-revisado/PLAN.md`

> Rutas relativas a `apps/web/`. NO hay migracion (columnas ya en PROD). NO hay GRANT
> (grant de tabla). NO se altera RLS (policy `check_ins_coach` FOR ALL ya cubre mark/unmark).

---

## Tasks

- [x] **T1 - Service: `unmarkCheckInReviewed`**
  - Scope: en `src/services/client/client-detail.service.ts`, agregar `unmarkCheckInReviewed(clientId, checkInId)` espejo de `markCheckInReviewed`: `createClient()` (authenticated), `auth.getUser()` (throw si no hay user), `assertCoachClientReadAccess(supabase, user.id, clientId)`, `update({ reviewed_at: null, reviewed_by: null }).eq('id', checkInId).eq('client_id', clientId)`. Sin service-role. Validar ids como uuid.
  - Verification: `pnpm typecheck`; cubierto por T2 test.

- [x] **T2 - Test unitario de seguridad (DoD)**
  - Scope: crear `src/services/client/checkin-reviewed.test.ts`. Mock de `createClient`/`auth.getUser` y de `assertCoachClientReadAccess`. Casos: (a) `markCheckInReviewed` y `unmarkCheckInReviewed` **throw** cuando `assertCoachClientReadAccess` rechaza (alumno ajeno) y NO llaman `.update()`; (b) sin user -> throw `Unauthorized`; (c) caso valido -> `.update()` scoped por `.eq('client_id', clientId)` con los campos correctos (`reviewed_by=user.id` en mark; nulls en unmark).
  - Verification: `npx vitest run src/services/client/checkin-reviewed.test.ts` verde.

- [x] **T3 - Server action: `unmarkCheckInReviewed`**
  - Scope: en `src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` (`'use server'`, solo async functions), exportar `unmarkCheckInReviewed(clientId, checkInId)` que llama al service + `revalidatePath('/coach/clients/${clientId}')`.
  - Verification: `pnpm typecheck`.

- [x] **T4 - Toggle en la ficha**
  - Scope: `src/app/coach/clients/[clientId]/ProfileCheckInSnapshot.tsx`. Convertir el boton en toggle: revisado -> muestra "Revisado" con accion "des-marcar" (`unmarkCheckInReviewed`); pendiente -> "Marcar como revisado". Optimista con `useTransition`; revertir `setReviewed` en `catch`. Mantener Dialog/Sheet y safe-areas.
  - Verification: `pnpm typecheck`; revision visual local (dark + movil).

- [x] **T5 - Dashboard: `reviewed_at` en la query + `pendingCheckinsCount`**
  - Scope: `src/app/coach/dashboard/_data/dashboard.queries.ts`. Agregar `reviewed_at` al select de `recentCheckinsRaw` (~L294). Propagar a los items `type: 'check-in'` de `activities` (L466-477) como `reviewed: boolean`. Derivar `pendingCheckinsCount` (= `rawRecentCheckins.filter(c => !c.reviewed_at).length`). Actualizar tipos en `src/app/coach/dashboard/_data/types.ts` (`ActivityItemClient` + campo del dashboard).
  - Verification: `pnpm typecheck`.

- [x] **T6 - Dashboard: badge + senal por item + filtro**
  - Scope: en el/los componente(s) de actividad (`src/app/coach/dashboard/_components/activity/ActivityFeed.tsx` y su contenedor): senal visual revisado (`CheckCircle` `--success-600`) vs pendiente en items de check-in; badge de `pendingCheckinsCount` con `aria-label`; filtro client-side pendientes/revisados sobre los items de check-in. Tokens dark-mode-safe.
  - Verification: `pnpm typecheck`; revision visual local (dark + movil).

- [x] **T7 - No-regresion metricas enterprise**
  - Scope: confirmar que `getOrgCheckInOverview` (`src/infrastructure/db/org.repository.ts`) y `/org/[slug]/check-ins` siguen leyendo `reviewed_at` sin cambios. Solo lectura/verificacion, sin edicion salvo que algo rompa.
  - Verification: `pnpm typecheck`; (opcional, solo con OK CEO) revisar en PROD que `reviewedRate30d`/`avgResponseHours` no cambian de forma.

## Universal Definition of Done

- [x] `pnpm typecheck`
- [x] `pnpm test` (vitest) de lo tocado; test de seguridad T2 verde
- [x] Test de seguridad: un coach NO puede marcar NI des-marcar check-ins de alumnos ajenos (unit sobre la action/service, no E2E)
- [x] No hay llamadas Supabase directas de feature-data en `_data` para las mutaciones (van por service)
- [x] Server actions son solo async functions en el archivo `'use server'`
- [x] Mutaciones llaman `revalidatePath()` donde corresponde
- [x] Escritos usan cliente `authenticated` (nunca service-role) para heredar RLS
- [x] Mobile viewport usa `dvh`, no `vh`/`h-screen`; UI fija usa safe-areas
- [x] Dark mode revisado en badge, senal y toggle
- [x] Sin migracion, sin GRANT, sin cambio de RLS (verificado: columnas/grant/policy ya existen)
- [x] Docs canonicas actualizadas si cambia algo de rutas/flows (esta feature no agrega rutas)

## Notes

- Cambios acotados a app-layer + 1 funcion de service. Cero DB.
- No confundir "sin revisar" (esta feature) con "alumno sin check-in >30d" (focus `checkin_pendiente`, adherencia) — son conceptos distintos.
- Playwright/E2E y SQL contra PROD: solo con OK explicito del CEO (regla del repo).

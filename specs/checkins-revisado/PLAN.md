# Check-ins con estado "revisado" (cola del coach) - PLAN

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/checkins-revisado/SPEC.md`

---

## Estado actual (verificado en codigo/PROD)

La mayor parte de la infraestructura YA existe. Esta feature es sobre todo cableado
de UI + la accion de des-marcar. Rutas relativas a `apps/web/`.

- **DB (ya en PROD):** `supabase/migrations/20260601000600_check_ins_reviewed_at.sql`
  agrega `reviewed_at timestamptz NULL`, `reviewed_by uuid REFERENCES coaches(id) ON DELETE SET NULL`
  e indice `idx_check_ins_reviewed_at`. Confirmado aplicado: `src/lib/database.types.ts`
  ya expone ambas columnas y el FK `check_ins_reviewed_by_fkey`. **No hace falta migracion nueva.**
- **Grants:** `check_ins` tiene GRANT de **tabla** (`GRANT ALL ON TABLE public.check_ins TO authenticated`,
  baseline lineas 3574-3576), NO allowlist de columnas. Por lo tanto **NO se requiere
  `GRANT UPDATE(reviewed_at, reviewed_by)`** (el gotcha column-level del repo no aplica a esta tabla).
- **RLS:** `check_ins_coach` (baseline 2797-2801) es policy **FOR ALL** `TO authenticated`,
  `USING` + `WITH CHECK` = `EXISTS(clients c WHERE c.id = check_ins.client_id AND c.coach_id = auth.uid())`.
  → el coach ya puede UPDATE (marcar/des-marcar) check-ins de SUS alumnos y esta bloqueado
  de tocar ajenos. `check_ins_client` cubre al alumno. Las policies permisivas viejas ya
  fueron eliminadas (`20260517120000_security_fixes.sql`, `20260530170000_fix_checkins_rls_leak.sql`).
- **Service (existe):** `markCheckInReviewed(clientId, checkInId)` en
  `src/services/client/client-detail.service.ts:1084` — usa cliente `authenticated`
  (`createClient()`), valida `assertCoachClientReadAccess(supabase, user.id, clientId)`,
  setea `reviewed_at = now, reviewed_by = user.id`, con guard `.eq('client_id', clientId).is('reviewed_at', null)`.
- **Action (existe):** `markCheckInReviewed` en
  `src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts:67` + `revalidatePath`.
- **UI ficha (existe, parcial):** `src/app/coach/clients/[clientId]/ProfileCheckInSnapshot.tsx`
  — boton "Marcar como revisado" / estado "Revisado" con `useTransition`, SOLO para el ultimo
  check-in y de **una sola via** (sin undo).
- **Dashboard (existe, sin senal de revisado):** `src/app/coach/dashboard/_data/dashboard.queries.ts:294`
  trae los 5 check-ins recientes (`select id, created_at, front_photo_url, back_photo_url, clients!inner(...)`)
  y los vuelca al feed `activities` (`type: 'check-in'`, lineas 466-477). El select **no incluye `reviewed_at`**.
- **Enterprise read-only:** `src/app/org/[slug]/check-ins/page.tsx` + `src/infrastructure/db/org.repository.ts:907`
  (`getOrgCheckInOverview`: `reviewedRate30d`, `avgResponseHours`). No se toca.

## Delta a construir

1. **Des-marcar (undo)** — nueva funcion de service + action que limpia `reviewed_at`/`reviewed_by`; el boton de la ficha pasa a toggle.
2. **Badge de pendientes** — agregar `reviewed_at` al select de check-ins del dashboard y derivar `pendingCheckinsCount` (`reviewed_at IS NULL`) para un badge donde el coach ya mira.
3. **Filtro pendientes/revisados** — sobre la lista de check-ins recientes del feed de actividad (toggle client-side sobre los items ya fetch).

## Architecture

Respeta el data flow obligatorio (Clean Architecture + module pattern). No se
introduce acceso directo a Supabase desde `_data/` para las mutaciones; las
lecturas de dashboard ya usan el patron existente.

```text
app/coach/clients/[clientId]/_actions/client-detail.actions.ts   (server actions: mark + unmark)
  -> services/client/client-detail.service.ts                    (markCheckInReviewed / unmarkCheckInReviewed)
     -> assertCoachClientReadAccess (services/client/client-scope.service.ts)  (guard de scope)
     -> supabase(authenticated).from('check_ins').update(...)    (RLS check_ins_coach)

app/coach/dashboard/_data/dashboard.queries.ts                    (add reviewed_at al select + pendingCheckinsCount)
  -> app/coach/dashboard/_components/activity/*                   (senal revisado/pendiente + filtro)
  -> badge de pendientes (surface del dashboard donde el coach ya mira)
```

## Files

| Action | Path (rel. `apps/web/`) | Notes |
|---|---|---|
| UPDATE | `src/services/client/client-detail.service.ts` | Agregar `unmarkCheckInReviewed(clientId, checkInId)`; mismo patron de scope que `markCheckInReviewed` (auth client + `assertCoachClientReadAccess` + `.eq('client_id', clientId)`, set `reviewed_at=null, reviewed_by=null`). Revisar el guard `.is('reviewed_at', null)` de mark (mantener). |
| UPDATE | `src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` | Exportar `unmarkCheckInReviewed` (wrap service + `revalidatePath(/coach/clients/[id])`). Solo async functions (`'use server'`). |
| UPDATE | `src/app/coach/clients/[clientId]/ProfileCheckInSnapshot.tsx` | Boton toggle: si `reviewed` -> "Revisado (des-marcar)"; on undo llama `unmarkCheckInReviewed`, revierte estado en catch. |
| UPDATE | `src/app/coach/dashboard/_data/dashboard.queries.ts` | Agregar `reviewed_at` al select de `recentCheckinsRaw` (linea ~294); mapear a los items de actividad; derivar `pendingCheckinsCount` desde `rawRecentCheckins`. |
| UPDATE | `src/app/coach/dashboard/_data/types.ts` | Agregar `reviewed: boolean` (o `reviewedAt`) a `ActivityItemClient` (o al item de check-in) + `pendingCheckinsCount` al tipo del dashboard. |
| UPDATE | `src/app/coach/dashboard/_components/activity/ActivityFeed.tsx` (y/o su contenedor) | Senal visual revisado/pendiente en items `type: 'check-in'`; filtro pendientes/revisados; badge de conteo. |
| CREATE | `src/services/client/checkin-reviewed.test.ts` | Test unitario de seguridad (ver Test Plan). |

## Data Model

- DB changes: **none** (columnas + indice + FK ya existen en PROD; migracion `20260601000600` idempotente `IF NOT EXISTS`).
- Grants: **none** (grant de tabla; no allowlist de columnas en `check_ins`).
- RLS impact: **none** (policy `check_ins_coach` FOR ALL ya cubre mark/unmark scoped). No se crea ni altera policy.
- Generated types impact: **none** (`database.types.ts` ya tiene `reviewed_at`/`reviewed_by`).
- Nota teams/pool: `reviewed_by uuid REFERENCES coaches(id)` ya soporta atribucion multi-coach; `assertCoachClientReadAccess` ya resuelve scope standalone + team (`{ orgId, viaTeam }`).

## Server Actions

- `markCheckInReviewed(clientId, checkInId)` — ya existe; mantener. Valida Zod si se agregan inputs (ambos son strings/uuid — validar con `z.guid()`/`z.string().uuid()` en el service segun convencion del repo).
- `unmarkCheckInReviewed(clientId, checkInId)` — NUEVA. Wrap del service + `revalidatePath('/coach/clients/${clientId}')`.
- Validacion: ids como uuid (Zod en el service/action; ojo con seeds no-RFC -> `z.guid()` si se referencian seeds en tests).
- Revalidation path: `/coach/clients/[clientId]` (ficha). El dashboard revalida en su propio ciclo (RSC) o via `revalidatePath('/coach/dashboard')` si se marca desde ahi (no en fase 1).

## UI/UX

- **Ficha (toggle):** reusar `ProfileCheckInSnapshot.tsx`. Estado `reviewed` ya existe; agregar rama undo. Mantener Dialog (desktop) / Sheet (movil, `max-h-[min(88dvh,88svh)]`, safe-areas). Copy: "Marcar como revisado" <-> "Revisado · des-marcar".
- **Dashboard badge:** badge de conteo de pendientes en la superficie de check-ins recientes / actividad (donde el coach ya mira). `aria-label` con el conteo. Estilo alineado al kit (badge ember/`--ember-500` como el `BellIconWithBadge`, o token de estado). No inventar surface nueva.
- **Filtro:** toggle pendientes/revisados sobre los items `type: 'check-in'` del feed (client-side, N pequeno). Senal por item: check-ins revisados con `CheckCircle` en `--success-600`; pendientes con punto/badge sutil.
- Mobile viewport: `dvh`, safe-areas; sin `h-screen`/`vh` fuera de `md:`.
- Dark mode: usar tokens (`--success-600`, `--ember-500`, `--muted`) que ya soportan ambos temas.
- Components: todo route-local (ficha + dashboard). Nada a `atoms/molecules` (no hay reuso 3+ domains).

## Phases

Cada fase cierra con gate local: `pnpm typecheck` + `pnpm test` (vitest) de lo tocado.
Playwright/E2E y cualquier SQL contra PROD: **solo con OK explicito del CEO**.

1. **Fase 1 — Backend del undo + test de seguridad.** `unmarkCheckInReviewed` (service + action) + test unitario de scope (mark y unmark rechazan cliente ajeno). Gate: typecheck + vitest.
2. **Fase 2 — Toggle en la ficha.** `ProfileCheckInSnapshot.tsx` pasa a toggle (marcar/des-marcar) con optimista + revert en catch. Gate: typecheck + vitest.
3. **Fase 3 — Badge + senal + filtro en el dashboard.** `reviewed_at` al select, `pendingCheckinsCount`, tipos, senal por item, filtro y badge. Gate: typecheck + vitest.
4. **Fase 4 (opcional, solo con OK CEO) — verificacion e2e.** Smoke Playwright del toggle y del filtro; verificacion en PROD de que las metricas enterprise (`reviewedRate30d`, `avgResponseHours`) siguen consistentes.

## Test Plan

- **Unit (obligatorio, DoD de seguridad):** en `checkin-reviewed.test.ts`, mock de `createClient()` + `auth.getUser()` y de `assertCoachClientReadAccess`:
  - `markCheckInReviewed` y `unmarkCheckInReviewed` **lanzan** cuando `assertCoachClientReadAccess` rechaza (alumno ajeno) — sin llegar al `.update()`.
  - En caso valido: el `.update()` va scoped por `.eq('client_id', clientId)` y (mark) setea `reviewed_by = user.id`; (unmark) setea `reviewed_at = null, reviewed_by = null`.
  - Sin usuario autenticado -> `throw 'Unauthorized'`.
- **Unit (UI opcional):** reducer/handler del toggle revierte estado local si la accion rechaza.
- **Integration:** ninguna nueva (no hay capa nueva de repo).
- **E2E (solo con OK CEO):** coach marca -> desaparece de pendientes; des-marca -> reaparece; filtro alterna la lista.
- **Manual:** verificar que el badge NO se confunde con el focus "alumno sin check-in >30d".

## Rollback Plan

Revert de codigo (feature es solo app-layer; sin DB). El commit del delta se revierte
sin tocar Supabase: las columnas `reviewed_at`/`reviewed_by` preexisten y las usan las
metricas enterprise, asi que **no** se revierte nada en DB. Si el badge/filtro molesta,
se puede ocultar la UI dejando la accion de undo viva (o revert total del PR). No hay
migracion que deshacer.

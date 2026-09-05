# Eliminacion de cuenta EN-APP - TASKS

**Status:** IN PROGRESS
**Owner:** Juan Pablo (owner)
**Last updated:** 2026-08-11
**Spec:** `specs/account-deletion/SPEC.md` · **Plan:** `specs/account-deletion/PLAN.md`

---

## Tanda build 52 (HOY)

- [x] T1 - SPEC/PLAN/TASKS
  - Scope: requisito del repo antes de tocar codigo.
- [x] T2 - Endpoint `POST /api/mobile/account/delete`
  - Scope: bearer via `admin.auth.getUser` → rol → cancelacion best-effort del gateway → ban + `app_metadata` → `{ ok, warnings? }`.
  - Verification: lectura de tipos/imports (`verifyMobileBearer` NO se usa a proposito, ver PLAN).
- [x] T3 - `apps/mobile/lib/account-deletion.ts`
  - Scope: wrapper `apiFetch` autenticado, espejo de `lib/pool-consent.ts`.
- [x] T4 - RN coach — `app/coach/(tabs)/settings.tsx`
  - Scope: `DangerZone` pasa de `mailto` a Dialog DS + POST + logout via `signOutAndRedirectHome()`.
- [x] T5 - RN alumno — `app/alumno/(tabs)/perfil.tsx`
  - Scope: idem con el logout local que ya existia (`handleLogout`, incluye `clearBranding`).

## Pendientes (NO entran en la build 52)

- [x] T6 - **Job de purga a 30 dias** — HECHO, verificado 2026-09-05
  - Scope: cron que lea `auth.users.raw_app_meta_data->>'deletion_requested_at'`, y pasados 30 dias borre/anonimice la data del usuario y el auth identity.
  - Evidencia: `apps/web/src/app/api/cron/purge-data/route.ts` (`readDeletionRequestedAt` líneas 55-66, `purgeDeletedAccounts` línea 135, `MAX_ACCOUNT_PURGES_PER_RUN=25`); cron registrado en `vercel.json` (`/api/cron/purge-data`); tests en `apps/web/src/app/api/cron/purge-data/route.test.ts` (338 líneas).
- [x] T6b - Cron de semanal a diario (`0 3 * * *`) — HECHO 2026-09-05 en `vercel.json` (el route es idempotente: borrados condicionados por edad, tope 25 por corrida). Toma efecto con el próximo deploy.
- [x] T7 - **Paridad web** — HECHO, verificado 2026-09-05
  - Scope: `apps/web/.../DangerZone.tsx` ya usa `deleteCoachAccountAction` (deja de ofrecer `mailto`).
  - Evidencia: `apps/web/src/app/coach/settings/_components/DangerZone.tsx` importa y llama `deleteCoachAccountAction`.
- [x] T8 - **Cascada a alumnos del coach** — HECHO, verificado 2026-09-05
  - Scope: al purgar un coach, cortar acceso de sus alumnos.
  - Evidencia: `purgeDeletedAccounts` (`apps/web/src/app/api/cron/purge-data/route.ts:135`) cubierto por la suite de 338 líneas de `route.test.ts`.
- [x] T9 - **Revocacion inmediata de sesiones activas** — dueño: backend
  - Scope: el ban corta login/refresh pero no invalida un access token ya emitido (~1h). Evaluar `auth.admin.signOut(jwt, 'global')`.
- [ ] T10 - **Panel admin / metricas de bajas** — dueño: backend
  - Scope: requiere tabla propia ⇒ migracion ⇒ fuera del alcance de hoy.

## Definition of Done de esta tanda

- [ ] `pnpm --filter @eva/mobile exec tsc --noEmit`
- [ ] `pnpm typecheck` (apps/web)
- [ ] QA en device iOS: coach y alumno completan la baja y quedan en la entrada sin poder volver a entrar
- [ ] Dark mode revisado en ambos dialogos
- [ ] `docs/status/CURRENT.md` actualizado al mergear

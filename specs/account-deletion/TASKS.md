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

- [ ] T6 - **Job de purga a 30 dias** — dueño: backend
  - Scope: cron que lea `auth.users.raw_app_meta_data->>'deletion_requested_at'`, y pasados 30 dias borre/anonimice la data del usuario y el auth identity.
  - Bloqueante real: sin esto la promesa de "eliminados por completo dentro de 30 dias" no se cumple. Agendar ANTES del 2026-09-10 (30 dias del primer pedido posible).
- [ ] T7 - **Paridad web** — dueño: web
  - Scope: `apps/web/.../DangerZone.tsx` y `ProfileClient.tsx` siguen ofreciendo `mailto`. No se tocan hoy (fuera del alcance del rechazo de Apple).
- [ ] T8 - **Cascada a alumnos del coach** — dueño: backend
  - Scope: al purgar un coach, cortar acceso de sus alumnos. Hoy solo se avisa en el copy.
- [ ] T9 - **Revocacion inmediata de sesiones activas** — dueño: backend
  - Scope: el ban corta login/refresh pero no invalida un access token ya emitido (~1h). Evaluar `auth.admin.signOut(jwt, 'global')`.
- [ ] T10 - **Panel admin / metricas de bajas** — dueño: backend
  - Scope: requiere tabla propia ⇒ migracion ⇒ fuera del alcance de hoy.

## Definition of Done de esta tanda

- [ ] `pnpm --filter @eva/mobile exec tsc --noEmit`
- [ ] `pnpm typecheck` (apps/web)
- [ ] QA en device iOS: coach y alumno completan la baja y quedan en la entrada sin poder volver a entrar
- [ ] Dark mode revisado en ambos dialogos
- [ ] `docs/status/CURRENT.md` actualizado al mergear

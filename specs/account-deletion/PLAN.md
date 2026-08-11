# Eliminacion de cuenta EN-APP - PLAN

**Status:** IN PROGRESS
**Owner:** Juan Pablo (owner)
**Last updated:** 2026-08-11
**Spec:** `specs/account-deletion/SPEC.md`

---

## Arquitectura

RN no habla nunca con `auth.admin` (eso exige `service_role`). La baja va por el **bridge bearer** que ya usan el resto de las mutaciones moviles:

```text
apps/mobile (Dialog DS)
  -> lib/account-deletion.ts (apiFetch, authenticated: true)
  -> POST /api/mobile/account/delete            (apps/web)
     -> admin.auth.getUser(token)               (identidad AUTORITATIVA, no jose)
     -> createServiceRoleClient()
        (a) rol: coaches.id | clients.id | client_accounts.id
        (b) coach con sub viva -> provider.cancelCheckoutAtProvider()   [best-effort]
        (c) auth.admin.updateUserById(ban + app_metadata)               [fail-closed]
     -> { ok: true, warnings? }
  -> signOut local + router.replace('/')
```

**Por que `admin.auth.getUser(token)` y NO `verifyMobileBearer`:** `lib/mobile-auth.ts` lo documenta explicitamente — `verifyMobileBearer` valida la FIRMA localmente con JWKS pero **no consulta revocacion** en GoTrue, y esta reservado a GETs read-only. Esta ruta es la mutacion de cuenta mas destructiva que existe ⇒ identidad autoritativa por red, igual que `coach/activate-free` y `auth/pool-consent`.

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `specs/account-deletion/{SPEC,PLAN,TASKS}.md` | requisito del repo antes de codigo |
| CREATE | `apps/web/src/app/api/mobile/account/delete/route.ts` | POST, bearer, service-role |
| CREATE | `apps/mobile/lib/account-deletion.ts` | wrapper `apiFetch` (espejo de `lib/pool-consent.ts`) |
| UPDATE | `apps/mobile/app/coach/(tabs)/settings.tsx` | `DangerZone` deja de ser `mailto` |
| UPDATE | `apps/mobile/app/alumno/(tabs)/perfil.tsx` | zona de peligro deja de ser `mailto` |

## Data Model

- **DB changes: NINGUNO.** Cero migraciones, cero DDL, cero grants.
- Escrituras: solo `auth.users` (ban + `app_metadata`) y, para el coach que cancela, `coaches.subscription_status='canceled'` + fila en `subscription_events` — las MISMAS columnas que ya escribe `/api/payments/cancel-subscription`.
- Traza: fila best-effort en `admin_audit_logs` (`action: 'account.delete_requested'`), como hace `activateFreePlanForCoach`.

## Reglas de dinero / seguridad

- La cancelacion usa el gateway **PERSISTIDO** (`getPaymentsProviderForCoach`): Flow → `subscription_provider_external_id`, MP → `subscription_mp_id`; ademas el `superseded_mp_preapproval_id` en vuelo se cancela SIEMPRE con el provider MP explicito (un id MP contra Flow falla en silencio y sigue cobrando).
- Cancelacion **best-effort**: un 502 del gateway NO aborta la baja; vuelve como `warnings[]`.
- `subscription_status` pasa a `canceled` **solo si** el gateway no fallo (no mentirle a la DB sobre un preapproval que quizas siga vivo).
- El ban es **fail-closed**: si `updateUserById` falla, la respuesta es 500 y la app NO cierra sesion ni dice "listo".
- Rate limit `rateLimitAuth(userId)` (20/min, helper existente) — la identidad ya viene del bearer, asi que no hay superficie de enumeracion.

## Riesgos aceptados

1. **Access token vigente (~1h):** el ban corta login y refresh, pero un access token ya emitido sigue firmado hasta su `exp`. La app cierra sesion de inmediato al recibir `ok`, asi que en la practica la ventana es cero para el usuario que se dio de baja.
2. **Sin purga aun:** hasta que exista el job, la cuenta queda deshabilitada pero la data sigue en la base. El copy promete "dentro de 30 dias", no "ahora".
3. **Alumnos del coach:** siguen entrando hasta la purga. El copy dice que pierden acceso; el corte duro llega con el job.

# Eliminacion de cuenta EN-APP - SPEC

**Status:** IN PROGRESS
**Owner:** Juan Pablo (owner)
**Last updated:** 2026-08-11
**Origen:** rechazo de App Review — build iOS 1.1.0 (51)

---

## Problema

Apple rechazo la build 1.1.0 (51) por **Guideline 5.1.1(v) — Data Collection and Storage / Account Deletion**:

> "If your app supports account creation, you must also offer account deletion within the app... Apps may include an option to contact the developer... but this option must be in addition to, not instead of, in-app deletion. Only apps in highly-regulated industries may require the user to use a customer service channel."

Hoy AMBOS roles ofrecen **solo correo**:

- coach: `apps/mobile/app/coach/(tabs)/settings.tsx` → boton "Solicitar baja por correo" (`mailto:contacto@eva-app.cl`).
- alumno: `apps/mobile/app/alumno/(tabs)/perfil.tsx` → fila "Solicitar baja de cuenta" (`mailto:privacidad@eva-app.cl`).

EVA no es industria altamente regulada ⇒ el `mailto` NO califica. Sin baja en-app la build 52 se rechaza de nuevo.

## Decision del owner (2026-08-11)

Baja **iniciada y confirmada dentro de la app**, sin correo, sin intermediarios:

1. El usuario toca "Eliminar mi cuenta" → dialogo de confirmacion del DS con el alcance real.
2. Al confirmar: la cuenta queda **DESHABILITADA al instante** (no puede volver a entrar) y la sesion del dispositivo se cierra.
3. **Purga definitiva a 30 dias** (retencion Ley 21.719 / trazabilidad de pagos), por job posterior.
4. Si el coach tiene suscripcion viva, se **cancela el preapproval en el gateway** de forma automatica.

## Diseño (restriccion dura: HOY no se toca el schema)

El pedido de baja se registra **en `auth`**, no en una tabla nueva:

```ts
admin.auth.admin.updateUserById(userId, {
  ban_duration: '876000h',                                  // ~100 años = deshabilitada
  app_metadata: { deletion_requested_at: '<ISO>', deletion_reason: 'user_request' },
})
```

- El ban es **fail-closed a nivel auth**: GoTrue rechaza login y refresh de token ⇒ bloquea TODAS las superficies (RN, web, PWA) sin depender de RLS ni de la UI. Mismo mecanismo ya usado en `services/client/client-archive.service.ts` para archivar alumnos.
- `app_metadata` es la cola de trabajo del job de purga: no requiere migracion y sobrevive a cualquier deploy.
- Cancelacion de MP/Flow **best-effort**: si el gateway falla, la baja **igual procede** y el fallo vuelve como `warning` (el borrado no puede quedar rehen del proveedor de pagos).

## Acceptance Criteria

- [ ] Coach y alumno pueden eliminar su cuenta 100% dentro de la app iOS, sin `mailto`.
- [ ] La confirmacion explica: que se elimina, que es definitivo y el plazo de 30 dias.
- [ ] Al confirmar: usuario baneado en auth + sesion cerrada + de vuelta en la entrada.
- [ ] Coach con suscripcion viva: preapproval cancelado (o warning si el gateway falla).
- [ ] La identidad sale SOLO del bearer; el body nunca manda ids.
- [ ] Error de red: inline y reintentable, sin dejar la cuenta a medias.

## Fuera de alcance HOY (pendientes con dueño)

| Item | Dueño | Nota |
|---|---|---|
| Job de purga a 30 dias (lee `app_metadata.deletion_requested_at`) | backend | sin el, la data queda deshabilitada pero no borrada |
| Paridad web (`DangerZone.tsx` / `ProfileClient.tsx` siguen con `mailto`) | web | Apple solo exige la app; la web queda para la tanda siguiente |
| Tabla propia `account_deletion_requests` + panel admin | backend | requiere migracion; hoy prohibido |
| Cascada inmediata a alumnos del coach | backend | hoy solo se avisa en el copy; el corte real llega con la purga |
| Correo de confirmacion de baja | growth | nice-to-have, no lo pide Apple |

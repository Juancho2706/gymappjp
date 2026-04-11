# RET-003 - Transactional Emails Smoke (Sprint 6)

## Alcance implementado
- `ENG-071`: proveedor consolidado en `src/lib/email/send-email.ts`.
- `ENG-072`: email de bienvenida al crear alumno en `src/app/coach/clients/actions.ts`.
- `ENG-074`: email de programa asignado en `src/app/coach/builder/[clientId]/actions.ts`.

## Plantillas
- `src/lib/email/transactional-templates.ts` contiene:
  - `buildClientWelcomeEmail()`
  - `buildProgramAssignedEmail()`

## Variables requeridas
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NEXT_PUBLIC_SITE_URL` (o `NEXT_PUBLIC_APP_URL`)

## Flujo de envio
1. Coach crea alumno con password temporal.
2. Se crea `auth user` + `public.clients`.
3. Se envia email de bienvenida con credenciales y link a `/c/[slug]/login`.
4. Coach asigna programa desde builder.
5. Se envia email de programa asignado con link a `/c/[slug]/dashboard`.

## Smoke test de produccion (manual)
1. Crear un alumno real de prueba con correo propio.
2. Verificar llegada de email "Bienvenido a ...".
3. Asignar un programa al mismo alumno.
4. Verificar llegada de email "Nuevo programa asignado: ...".
5. Abrir links de ambos emails y confirmar que cargan en dominio productivo.

## Resultado local (evidencia tecnica)
- Los tests unitarios pasaron con envio "best effort" sin romper accion si faltan variables.
- `npx playwright test`: `4 passed`, `2 skipped`.

## Notas operativas
- Si Resend falla, la accion principal sigue funcionando y el error queda en logs del servidor.
- Para auditoria, revisar logs en Vercel por:
  - `Welcome email delivery error`
  - `Program assigned email error`

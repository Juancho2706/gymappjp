---
status: active
owner: product-owner
last_verified: "2026-09-02"
canonical: true
---

# Acciones manuales pendientes

Esta es la única lista de acciones que requieren al dueño, credenciales externas o una decisión irreversible. El trabajo de ingeniería vive en [CURRENT.md](../status/CURRENT.md); el estado de paridad móvil vive en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

Reglas:

- Solo entran acciones todavía pendientes y comprobables.
- Una acción terminada se elimina; Git conserva el historial.
- No guardar secretos, datos personales ni credenciales en este archivo.
- Los pasos automáticos, ideas comerciales y features futuras no son tareas manuales.

## P0 — Billing

### BILL-01 — Confirmar la reactivación por Flow del coach `movida-la2yw4` (cupón protegido desde el 02-09)

El 01-09 el owner reactivó por SQL el canje `06070508-33d6-4839-8c81-9a723a43e65f` (50 % forever ⇒ Pro mensual
14.995; `coupon_codes.JHNG3C48AE` sigue inactivo a propósito). El coach intentó reactivar por Flow **5 veces**
(22:45 · 22:47 · 23:39 · 00:03 · 00:04 UTC), las 2 últimas ya con el fix del gate en producción (`850d85a9`,
READY 23:47:56Z): llega al enrolamiento de Flow y **nunca vuelve a `/flow/retorno`** (probable rechazo de tarjeta
o cierre de ventana), así que `confirm-enrollment` sigue sin correr. Verificado 02-09 00:14Z: `pending_payment`,
`provider_customer_id` presente, `subscription_provider_external_id` null, canje `active`, ningún
`billing_snapshots` de Flow.

- [x] **Barrido «abandoned signup coupons» arreglado (02-09)**: `sweepAbandonedSignupCoupons()` en
      `apps/web/src/services/billing/coupons.service.ts` excluye a los coaches Flow con `provider_customer_id`
      y a todo coach con ≥1 fila en `billing_snapshots` (decisión del owner: un cupón de quien ya pagó o está
      pagando por Flow solo lo cancela él a mano). 7 tests. Con esto el cron de las 10:00 UTC ya no toca este canje.
- [ ] Verificar en `coaches` (slug `movida-la2yw4`): `subscription_status='active'`, `subscription_provider='flow'`,
      `provider_plan_id='eva_pro_monthly_14995'`, `subscription_provider_external_id` no nulo, `current_period_end`
      futuro; y en `billing_snapshots` la fila con total 14.995 y `coupon_code='JHNG3C48AE'`.
- [ ] Si el canje apareciera `reverted` (no debería): re-flip por SQL `update coupon_redemptions set status='active'
      where id='06070508-…' and status='reverted'` + fila en `admin_audit_logs` (`coupon.reactivate_redemption`) +
      `update coupon_codes set redeemed_count=1 where id='09afd265-435d-4365-9d24-50e2777f586b' and redeemed_count=0`.
- Cómo completa el coach: con sesión iniciada, `https://www.eva-app.cl/coach/subscription/flow-processing?tier=pro&cycle=monthly`
  (poll de `confirm-enrollment`: verifica la tarjeta en Flow y crea la sub al toque) o rehacer el checkout Flow desde
  `/coach/reactivate`. Alternativa sin Flow: Mercado Pago (su vuelta `/coach/subscription/processing` siempre estuvo exenta).
  El owner le escribe por mail (no WhatsApp) para saber qué ve en la pantalla de Flow.

## P0 — Seguridad

### SEC-01 — Cerrar la enumeración anónima de `coaches.invite_code` (3 fases)

Hallazgo verificado el 02-09: la política `coaches_select_anon` (`USING (true)`) + el grant de columna
`SELECT (invite_code)` a `anon` permiten `GET /rest/v1/coaches?select=invite_code` con la anon key (viaja en el
bundle web y en la app) ⇒ 200 con las 91 filas. Los advisors no lo levantan. Revocar la columna de golpe rompe
web y app: Postgres exige SELECT sobre la columna también para FILTRAR, y hoy hay 9 lecturas anónimas por
`invite_code` (proxy `/c/<CÓDIGO>/**`, login del alumno, manifest/splash/og/pwa-screenshot, y la pantalla
«ingresá tu código» de RN, que corre PRE-LOGIN como `anon`). Censo completo en el informe del 02-09.

- [x] **Fase 0 (02-09, LIVE `20260902012559`)**: `REVOKE ALL ON client_payments FROM anon` +
      `REVOKE TRIGGER, TRUNCATE, REFERENCES ON coaches FROM anon`. Probada en transacción con rollback, advisors
      sin ERROR, prod 200.
- [x] **Fase 1 (02-09, LIVE `20260902014246`)**: RPC `public.get_coach_public_branding(text)` SECURITY DEFINER, UNA
      fila por slug-o-código con exactamente las 31 columnas de branding que `anon` ya puede leer. Probada en
      transacción como `anon` (slug, código, desconocidos ⇒ null) antes de aplicar.
- [x] **Fase 2 (02-09)**: los 9 call sites migrados al RPC (web: `lib/branding/public-branding.ts` usado por
      `proxy.ts`, `c/[coach_slug]/login/_data/login.queries.ts`, `api/manifest|splash|og|pwa-screenshot`; RN:
      `apps/mobile/lib/branding.ts` `fetchBrandingByCoachIdentifier`). Deploy web + OTA RN por GH Actions.
- [ ] **Fase 3 (solo cuando la OTA esté adoptada — verificar en PostHog/EAS que no queden sesiones con el
      bundle viejo entrando por código)**: `REVOKE SELECT (invite_code) ON public.coaches FROM anon` +
      `REVOKE EXECUTE ON FUNCTION generate_unique_invite_code(), generate_invite_code() FROM anon`. Después,
      confirmar con la anon key que `?select=invite_code` devuelve 42501 y que `/c/<slug>/login` sigue 200.
- Rollback de cualquier fase: `GRANT` inverso (cada migración lo lleva comentado al pie).

## P1 — Cierre del build y QA móvil

### MOB-02 — Certificar paridad en dispositivos reales

MOB-01 quedó CERRADO el 2026-07-25: profile con HealthKit + Associated Domains validado en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) (`856829fa`, Android+iOS verdes con submits), procesamiento verificado por el owner en App Store Connect y Play Console, artefactos retenidos en `D:\tmp\eva-artifacts-856829fa\`. Código estático y tests no sustituyen esta prueba.

**Actualización 2026-08-19 (saneo documental)**: esta tarea pedía el smoke sobre el TestFlight de julio (`856829fa`) cuando el binario vigente ya es otro — iOS pasó por 1.1.0 (54) y `app.json` va en **1.1.1**. Las rondas de QA del owner del 15, 16, 17 y 18-08 cubrieron nutrición, el editor único y el tour; **no** la matriz transversal de esta tarea. Y no se certifica por OTA: la experiencia de entrada cambió el config plugin del splash, así que exige **binario nuevo**.

- [ ] Android: smoke de alumno y coach, light/dark y marca EVA/custom, sobre el binario vigente (no sobre un OTA).
- [ ] iOS: mismo smoke sobre el binario vigente en TestFlight/App Store, anotando versión y build usados.
- [ ] Validar navegación, safe areas, teclado, cámara/scanner, offline/reintentos y cambio de workspace.
- [ ] Registrar cada defecto con plataforma, build, pantalla, pasos, resultado esperado/real y captura.
- [ ] Actualizar únicamente el resultado consolidado en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

## P1 — Operación de datos

### DATA-01 — Aprobar la siguiente limpieza del catálogo

El catálogo productivo está operativo. Quedan decisiones humanas antes de mutar referencias o eliminar respaldos:

- [ ] Aprobar el mapeo canónico de los duplicados con referencias activas antes de ejecutar un merge.
- [ ] Revisar la cola de clasificación de baja confianza antes de asignar grupos nutricionales.
- [ ] Confirmar una ventana sin reclamos antes de borrar tablas de respaldo y assets redundantes.
- [ ] Exigir snapshot, dry-run y conteos antes/después para cualquier operación.

Procedimiento: [FOOD_CATALOG_CL_IMPORT.md](FOOD_CATALOG_CL_IMPORT.md).

### COMMS-01 — Correo Pricing v3 a los Free con cupo 1

Aviso «Tu plan Free ahora incluye tu marca» ([spec](../specs/pricing-v3/SPEC.md)): el white-label pasa a todos los planes con el sello «Hecho con EVA», y el cupo Free queda en 1 alumno activo conservando a los alumnos existentes. Envío manual: **panel admin › Coaches › botón «Aviso Pricing v3»**.

- [ ] Ejecutar el backfill de `coaches.max_clients` ANTES del envío: el botón filtra por `max_clients = 1` y sin él la lista sale vacía.
- [ ] Enviar la prueba a la casilla del owner desde el propio diálogo y leer el correo entero antes de confirmar.
- [ ] Confirmar el envío real y anotar `sent / failed / skipped`; el botón deduplica contra `admin_audit_logs` (`coach.pricing_v3_notice`), así que un reintento tras un corte no reescribe a quien ya recibió.
- [ ] Revisar los `failed` en Auditoría y decidir uno por uno (rebote, casilla inexistente) antes de reintentar.

### OPS-RESEND-01 — Crear el webhook de Resend y pegar el secreto en Vercel

El endpoint `POST /api/webhooks/resend` ya existe en el código, pero está **fail-closed**: sin `RESEND_WEBHOOK_SECRET` responde 503 y el ledger de correos (`coach_email_ledger`) nunca sabe si un correo se entregó o rebotó. Solo el dueño de la cuenta de Resend puede crearlo.

- [x] Resend → Webhooks → **Add Webhook** con endpoint `https://www.eva-app.cl/api/webhooks/resend` (**creado el 2026-08-22 por MCP, id `8ef77e25-b514-4079-8a59-39fe4df7ae16`**).
- [x] Suscribir exactamente siete eventos: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.suppressed` (hecho en la creación).
- [x] Copiar el **signing secret** (formato `whsec_…`) y guardarlo en Vercel como `RESEND_WEBHOOK_SECRET` en Production (**hecho el 2026-08-22 por CLI, + redeploy de `0e42d480`**; Preview no tiene el secreto a propósito).
- [x] Verificado el 2026-08-22 por sonda directa: `POST https://www.eva-app.cl/api/webhooks/resend` sin firma responde **401** (no 503) ⇒ el secreto está en el runtime y el endpoint exige firma. El primer evento real (`email.delivered` del drip D+1 de un coach nuevo) se valida el 23-08 mirando `coach_email_ledger.status`. Para repetir la prueba desde Resend: botón de prueba del webhook → 200 (o 200 con `ignored: true` si el `email_id` no está en el ledger); 503 = variable ausente; 401 = secreto mal pegado.
- [ ] No pegar el valor del secreto en este archivo, en un PR ni en un ticket.

Detalle operativo y consultas de auditoría: [RUNBOOK.md](RUNBOOK.md#ledger-de-correos-y-webhook-de-resend).

## P2 — Gates bajo demanda

### LEGAL-01 — Revisar identidad y textos legales antes de publicar

Los templates legales todavía describen al proveedor como persona natural. No inferir una razón social ni un RUT.

- [ ] Confirmar nombre legal, RUT, domicilio y representante del proveedor.
- [ ] Obtener revisión jurídica de Términos, Privacidad y contrato Enterprise.
- [ ] Confirmar que los correos y canales de derechos ARCO están operativos.
- [ ] Retirar las notas internas antes de publicar o enviar un contrato.

Fuentes: [`docs/legal/`](../legal/) y [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md).

### QA-01 — Ejecutar E2E conectado a Supabase antes de un release de riesgo

Las suites E2E no bloquean PR automáticamente porque utilizan un entorno Supabase real y aún requieren preparación de datos.

Desde el 2026-09-02 el job `e2e` del dispatch corre **solo el project `prod-suave`**
(`npx playwright test --project=prod-suave`): un navegador, sin paralelismo, `retries: 0`, header
`x-eva-qa` y el guardián de `/api/health`. El project `chromium` —specs que escriben en producción
sobre un coach real— ya no se lanza desde CI, y el paso de RLS de `apps/enterprise` (app congelada,
B15) se eliminó.

- [ ] **Bloqueante hoy**: cargar en GitHub los secrets `E2E_QA_COACH_EMAIL` y
  `E2E_QA_COACH_PASSWORD` con la cuenta del coach QA `evademo`. Mientras no existan, el project
  `setup` se salta solo y la tanda entera queda skipped (comportamiento seguro, pero no valida
  nada). Las credenciales no se anotan acá ni en ningún archivo del repo.
- [ ] Ejecutar manualmente el workflow **CI** con `workflow_dispatch` antes de cambios de auth, RLS, pagos, nutrición o releases de tienda.
- [ ] Confirmar que los secrets E2E existen en el environment de GitHub.
- [ ] Guardar el run y resultado consolidado en [TEST_STATUS.md](../testing/TEST_STATUS.md).

### STORE-02 — Formulario Play Health con los data types de Cardio Conectado (2026-07-30)

El corte 6 (`specs/cardio-conectado/`) suma permisos de lectura de Health Connect que la declaración
de Play Console debe cubrir con justificación escrita por tipo de dato (~7 días de aprobación +
5-7 hábiles de propagación del allowlist).

- [ ] Verificar que la cuenta de Play sea **Organization Account verificada** (obligatoria para apps
  de salud desde 2026-01-28; una cuenta individual bloquea el form).
- [ ] Declarar y justificar: `READ_STEPS`, `READ_SLEEP` (ya en uso) + `READ_EXERCISE`,
  `READ_HEART_RATE`, `READ_DISTANCE`, `READ_ACTIVE_CALORIES_BURNED` (Cardio Conectado F2). Pedir
  solo lectura; beneficio: validar el cardio prescrito y autocompletar hábitos/check-in del alumno.
- [ ] Confirmar que la privacy policy del listing coincide con la del link dentro de Health Connect.
- [ ] Tras aprobar: probar en device que el diálogo de permisos muestra los 6 tipos.

## Cuándo agregar una tarea

Agregar solo si se cumplen las tres condiciones:

1. no puede resolverla el repositorio o CI;
2. tiene una evidencia y un resultado verificable;
3. está dentro del siguiente release o mitiga un riesgo vigente.

Si una acción no cumple esas condiciones, pertenece a producto, backlog o a un runbook; no a esta lista.

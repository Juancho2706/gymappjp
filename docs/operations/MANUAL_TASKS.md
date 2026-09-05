---
status: active
owner: product-owner
last_verified: "2026-09-05"
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

### BILL-01 — Cerrado 2026-09-05

Reactivación por Flow del coach `movida-la2yw4` verificada en LIVE: `subscription_status='active'`, `payment_provider='flow'`, `provider_customer_id='cus_qc1ad190f3'`, `current_period_end=2026-10-01`; `billing_snapshots` con la fila Flow `invoice:7406619` del 2026-09-02 21:51Z por 14.995 CLP y `coupon_redemption_id 06070508`; canje `status='active'`.

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
- [x] **Fase 3 (2026-09-05, LIVE `20260905190100`, archivo `20260905190100_sec01_phase3_revoke_invite_code_anon.sql`)**:
      gate verificado con los logs de PostgREST (rol del JWT de Authorization, no el de la apikey): 0 lecturas
      anónimas de `invite_code` desde el 2026-09-02 01:37Z, y 100 % de los eventos nativos en 1.1.2 + OTA 04-09.
      `REVOKE SELECT (invite_code) ON public.coaches FROM anon` + `REVOKE EXECUTE ON FUNCTION
      generate_unique_invite_code(), generate_invite_code() FROM PUBLIC, anon, authenticated` (las dos tenían el
      grant a PUBLIC, así que revocar solo a `anon` no cerraba nada; `generate_invite_code` es función de trigger y
      no necesita EXECUTE del rol; `generate_unique_invite_code` solo la llama `service_role`). Probado en
      transacción como `anon` antes de aplicar: branding por código y por slug siguen respondiendo. Verificación
      post-aplicación con la anon key en el cierre del 05-09 (ver `docs/status/CURRENT.md`).
- Rollback de cualquier fase: `GRANT` inverso (cada migración lo lleva comentado al pie).

## P1 — Cierre del build y QA móvil

### MOB-02 — Cerrado 2026-09-05

Matriz transversal corrida por el owner en una sesión única sobre el **binario vigente**: Android **1.1.2 build 86** e iPhone **1.1.2 build 59** (ambos con el OTA del 04-09 android `d8220490` / ios `54487ddd`) más web `www.eva-app.cl` `dpl_ASZExsTB…` = `f9ba8a3f` — **QA del owner VERDE 05-09 (artifact `6bd32370`, 102 verificaciones en 11 áreas)**: smoke de alumno y coach en light/dark con marca EVA y custom, navegación, safe areas, teclado, cámara/scanner, offline/reintentos y cambio de workspace; cero defectos que registrar. Resultado consolidado en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md); detalle por ítem en [QA_DEVICE_PENDIENTE.md](../testing/QA_DEVICE_PENDIENTE.md).

Residual declarado (no bloquea esta tarea): la **experiencia de entrada** (config plugin del splash) no es certificable por OTA — su certificación con build EAS propia queda para **1.1.3**.

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

- [x] Ejecutar el backfill de `coaches.max_clients` ANTES del envío: el botón filtra por `max_clients = 1` y sin él la lista sale vacía.
- [x] Enviar la prueba a la casilla del owner desde el propio diálogo y leer el correo entero antes de confirmar.
- [x] Confirmar el envío real y anotar `sent / failed / skipped`; el botón deduplica contra `admin_audit_logs` (`coach.pricing_v3_notice`), así que un reintento tras un corte no reescribe a quien ya recibió.
- [x] Revisar los `failed` en Auditoría y decidir uno por uno (rebote, casilla inexistente) antes de reintentar.

**Cerrado 2026-08-21** (34 enviados, 0 fallidos; `7ea0f7b4`). Verificado 2026-09-02.

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

- [x] **Secrets cargados (2026-09-02)**: `E2E_QA_COACH_EMAIL` y `E2E_QA_COACH_PASSWORD` apuntan al
  coach QA propio **`qa-e2e-coach@evatest.cl`** (slug `qa-e2e-coach`, id `19fc07a3-…`), creado por la
  API admin con clave aleatoria que solo vive en los secrets. Decisión del owner: la cuenta de App
  Review (`evademo`) NO se usa para tests. Sin alumnos, persona `strength`, correo verificado; está en
  la allowlist de `tests/e2e-accounts.ts`. Si hay que rotar la clave: `auth.admin.updateUserById` +
  `gh secret set` por stdin, nunca por chat ni por argv. Ojo: el reporte de Playwright de un run
  fallido guarda el snapshot de la página con la clave tipeada — borrar el artifact si se filtra.
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

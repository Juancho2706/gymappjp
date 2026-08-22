---
status: active
owner: product-owner
last_verified: "2026-08-21"
canonical: true
---

# Acciones manuales pendientes

Esta es la única lista de acciones que requieren al dueño, credenciales externas o una decisión irreversible. El trabajo de ingeniería vive en [CURRENT.md](../status/CURRENT.md); el estado de paridad móvil vive en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

Reglas:

- Solo entran acciones todavía pendientes y comprobables.
- Una acción terminada se elimina; Git conserva el historial.
- No guardar secretos, datos personales ni credenciales en este archivo.
- Los pasos automáticos, ideas comerciales y features futuras no son tareas manuales.

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

- [ ] Resend → Webhooks → **Add Webhook** con endpoint `https://www.eva-app.cl/api/webhooks/resend`.
- [ ] Suscribir exactamente siete eventos: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.suppressed`.
- [ ] Copiar el **signing secret** (formato `whsec_…`) y guardarlo en Vercel como `RESEND_WEBHOOK_SECRET` en Production (y Preview si se va a probar ahí). Redeploy para que la variable exista en runtime.
- [ ] Verificar con el botón de prueba de Resend: la respuesta debe ser 200 (o 200 con `ignored: true` si el `email_id` de prueba no está en el ledger). Un 503 significa que la variable no llegó al runtime; un 401, que el secreto quedó mal pegado.
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

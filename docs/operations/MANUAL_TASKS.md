---
status: active
owner: product-owner
last_verified: "2026-07-25 @ 856829fa"
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

- [ ] Android: smoke de alumno y coach, light/dark y marca EVA/custom.
- [ ] iOS: mismo smoke con el build de TestFlight (`856829fa`).
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

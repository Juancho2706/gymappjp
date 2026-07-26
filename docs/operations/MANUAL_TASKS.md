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

### MOB-01 — Reparar provisioning iOS (HealthKit) y build del corte actual

El [run 29885773193](https://github.com/Juancho2706/gymappjp/actions/runs/29885773193) (2026-07-22, `4382ff6c`, perfil `production`, platform `all`) compiló Android+iOS y **completó los submits**: AAB a Play internal testing e IPA a TestFlight, ambos verdes. Después el build iOS `production` falló en [29976332962](https://github.com/Juancho2706/gymappjp/actions/runs/29976332962) (`b7e5e34d`) y [30063566202](https://github.com/Juancho2706/gymappjp/actions/runs/30063566202) (`335c88da`; Android verde con submit ahí).

**Causa raíz confirmada** (run diagnóstico [30183498116](https://github.com/Juancho2706/gymappjp/actions/runs/30183498116) sobre `a59acfd1`, 2026-07-25): `Provisioning profile "evaapp_production" doesn't include the HealthKit capability (target 'EVA')`. La Ola 6 de wearables (`de3ce837`) agregó el entitlement `com.apple.developer.healthkit` vía el plugin de `react-native-health`; el profile guardado en secrets es anterior. El primer build verde (`4382ff6c`) fue el último corte SIN wearables.

Arreglo (portal Apple + secret):

- [x] App ID `cl.evaapp.eva` con capability **HealthKit** (y **Associated Domains**) habilitadas — hecho por el dueño de la cuenta; profile `evaapp_production` regenerado el 2026-07-24 con ambas capabilities + push (expira 2027-05-18).
- [x] Secret `IOS_PROVISIONING_PROFILE_BASE64` actualizado con el profile nuevo (2026-07-26; el `.p12` no cambió). `ios.associatedDomains` repuesto en `app.json` en el mismo paso (universal links vuelven en el próximo binario).
- [x] Workflow relanzado: [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` — Android e iOS verdes **con ambos submits success** (2026-07-25).
- [ ] Verificar en App Store Connect que los builds (`4382ff6c` y `856829fa`) procesaron en TestFlight; verificar los AAB en Play Console → internal testing.
- [ ] Descargar/retener HOY los artefactos del run `30185211552` (retención 1 día) y registrar el resultado en [TEST_STATUS.md](../testing/TEST_STATUS.md) y [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

### MOB-02 — Certificar paridad en dispositivos reales

Código estático y tests no sustituyen esta prueba.

- [ ] Android: smoke de alumno y coach, light/dark y marca EVA/custom.
- [ ] iOS: mismo smoke con la IPA actual cuando MOB-01 quede verde.
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

## Cuándo agregar una tarea

Agregar solo si se cumplen las tres condiciones:

1. no puede resolverla el repositorio o CI;
2. tiene una evidencia y un resultado verificable;
3. está dentro del siguiente release o mitiga un riesgo vigente.

Si una acción no cumple esas condiciones, pertenece a producto, backlog o a un runbook; no a esta lista.

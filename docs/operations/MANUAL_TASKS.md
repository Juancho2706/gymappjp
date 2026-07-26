---
status: active
owner: product-owner
last_verified: "2026-07-25 @ a59acfd1"
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

### MOB-01 — Build del corte actual y verificación de los submits ya hechos

El [run 29885773193](https://github.com/Juancho2706/gymappjp/actions/runs/29885773193) (2026-07-22, `4382ff6c`, perfil `production`, platform `all`) compiló Android+iOS y **completó los submits**: AAB a Play internal testing e IPA a TestFlight, ambos verdes. Después el build iOS `production` falló dos veces ([29976332962](https://github.com/Juancho2706/gymappjp/actions/runs/29976332962) sobre `b7e5e34d` y [30063566202](https://github.com/Juancho2706/gymappjp/actions/runs/30063566202) sobre `335c88da`, donde Android sí quedó verde con submit) y los logs de las fallas ya expiraron.

GitHub Actions → **Mobile Build (Local — no EAS credits)**:

```text
branch: rnmobiledenuevo
app: mobile
platform: all
profile: production
submit_ios: true
submit_android: true
```

- [ ] Verificar en App Store Connect que el build de `4382ff6c` procesó y está en TestFlight; verificar el AAB en Play Console → internal testing.
- [ ] Relanzar el workflow sobre el corte actual (`a59acfd1` o descendiente); si iOS vuelve a fallar, conservar enlace y logs el mismo día — la retención es de 1 día.
- [ ] Descargar/retener los artefactos el mismo día.
- [ ] Registrar el resultado en [TEST_STATUS.md](../testing/TEST_STATUS.md) y [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

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

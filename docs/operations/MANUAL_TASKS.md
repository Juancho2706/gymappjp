---
status: active
owner: product-owner
last_verified: 2026-07-20
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

### MOB-01 — Repetir build iOS `previewv2`

El intento anterior falló antes de Xcode porque EAS buscó credenciales remotas. El perfil quedó corregido en `c6743ef3`: iOS usa credenciales locales y distribución App Store.

GitHub Actions → **Mobile Build (Local — no EAS credits)**:

```text
branch: rnmobiledenuevo
app: mobile
platform: ios
profile: previewv2
submit_ios: false
```

- [ ] Ejecutar el workflow.
- [ ] Descargar/retener el artefacto si termina correctamente.
- [ ] Si falla, conservar el enlace del run y los logs completos; no copiar secretos al issue.
- [ ] Registrar el resultado en [TEST_STATUS.md](../testing/TEST_STATUS.md) y [MOBILE_PARITY.md](../status/MOBILE_PARITY.md).

### MOB-02 — Certificar paridad en dispositivos reales

Código estático y tests no sustituyen esta prueba.

- [ ] Android: smoke de alumno y coach, light/dark y marca EVA/custom.
- [ ] iOS: mismo smoke cuando MOB-01 quede verde.
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

### STORE-01 — Primera publicación Android en Play Console

La automatización de `eas submit` solo funciona después de que la app y su primer AAB existan en Play Console.

- [ ] Crear/verificar la app con package `cl.evaapp.eva`.
- [ ] Subir manualmente el primer AAB `production` al track Internal testing si aún no existe uno.
- [ ] Verificar testers y enlace de opt-in.
- [ ] Confirmar `GOOGLE_SERVICE_ACCOUNT_JSON` y permiso de publicación al track de pruebas antes de activar `submit_android=true`.

No usar un binario de otro pipeline: `versionCode` debe quedar alineado con el contador remoto de EAS.

## Cuándo agregar una tarea

Agregar solo si se cumplen las tres condiciones:

1. no puede resolverla el repositorio o CI;
2. tiene una evidencia y un resultado verificable;
3. está dentro del siguiente release o mitiga un riesgo vigente.

Si una acción no cumple esas condiciones, pertenece a producto, backlog o a un runbook; no a esta lista.

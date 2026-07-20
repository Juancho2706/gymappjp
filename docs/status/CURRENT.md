---
status: active
owner: product-engineering
last_verified: 2026-07-20
canonical: true
---

# Current status

Esta es la única vista global de qué está en producción, qué está en integración y qué sigue. El detalle de paridad, pruebas y acciones humanas vive en sus trackers canónicos; no se duplica aquí.

## Corte verificado

| Referencia | Estado al revisar |
|---|---|
| Rama de trabajo | `rnmobiledenuevo` |
| Corte base de esta limpieza | `34b09d8f` |
| Producción web sincronizada | `origin/master` en `649bfd3a` |
| Relación | `rnmobiledenuevo` contiene ese corte de `origin/master` |

Este bloque es un snapshot, no reemplaza `git fetch`, `git status` ni los checks remotos antes de integrar.

## Estado por frente

| Frente | Estado | Fuente de detalle |
|---|---|---|
| Web/PWA | Plataforma productiva; `master` es la línea de producción | [Testing](../testing/TEST_STATUS.md), [Runbook](../operations/RUNBOOK.md) |
| App nativa | Desarrollo de paridad activo sobre `rnmobiledenuevo`; no declarar cierre sin build y QA física | [Mobile parity](MOBILE_PARITY.md) |
| Nutrition V2 | Implementación web/mobile y contratos compartidos presentes; rollout autorizado server-side y con fallback OFF si falta configuración válida | [Product overview](../product/PRODUCT_OVERVIEW.md), [Runbook V2](../operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md) |
| Teams | Pool compartido, membresías, marca, módulos y workspace coach/alumno implementados | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | Panel org, roles, asignaciones, programas, nutrición, reportes, pagos, marca y auditoría implementados en web | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |
| Dependencias | Automatización limitada a seguridad; previews de ramas Dependabot deshabilitadas en Vercel | `vercel.json`, `.github/dependabot.yml` |
| Documentación | Núcleo canónico reducido; material histórico no gobierna decisiones | [Docs index](../README.md) |

## Prioridad actual

1. Obtener build iOS verde con el perfil `previewv2` corregido y registrar el resultado real.
2. Completar QA en dispositivos Android/iOS de los recorridos críticos.
3. Cerrar las unidades pendientes de paridad móvil según `MOBILE_PARITY.md`.
4. Ejecutar los gates web/mobile completos sobre el commit candidato.
5. Integrar `rnmobiledenuevo` a `master` solo con evidencia verde y sin migraciones o artefactos locales pendientes.

## Gates que siguen abiertos

- Rebuild iOS posterior al ajuste `c6743ef3`.
- Certificación física de cámara, gestos, teclado, safe areas, offline y notificaciones en ambos sistemas.
- Cierre verificable de la paridad móvil restante; código presente no equivale a QA aprobada.
- Confirmación del rollout/configuración de Nutrition V2 en el entorno objetivo antes de una promoción.

Android tuvo un build reportado como correcto por el owner. El resultado debe quedar en la evidencia de paridad/pruebas, no convertirse en una suposición permanente de este documento.

## Nutrition V2: criterio actual

- V2 es el destino funcional para trabajo nuevo.
- V1 se conserva como compatibilidad y rollback, no como segunda línea de producto.
- Edge Config y el gate server-side deciden disponibilidad real por superficie/scope.
- Mobile usa endpoints autoritativos para intake, catálogo y operaciones coach V2; la caché local no concede permisos.
- Importaciones del catálogo chileno requieren fuente y licencia verificables; no inventar GTIN ni nutrientes.

Acciones operativas o manuales pendientes van en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md), no en este archivo.

## Reglas para cambiar el estado

- `master` significa código integrado, no necesariamente deploy sano: verificar Vercel.
- Un build EAS verde no certifica el flujo: falta QA física y, si aplica, submit.
- Una ruta o migración existente no significa rollout habilitado.
- Marcar un frente “cerrado” requiere evidencia enlazada en testing/paridad.
- Toda nueva prioridad desplaza o elimina una anterior; no acumular backlog histórico aquí.

## Fuentes canónicas

| Pregunta | Documento |
|---|---|
| ¿Qué hace el producto? | [PRODUCT_OVERVIEW.md](../product/PRODUCT_OVERVIEW.md) |
| ¿Dónde vive el código? | [PROJECT_STRUCTURE.md](../architecture/PROJECT_STRUCTURE.md) |
| ¿Cómo viajan datos y permisos? | [FLOWS_AND_COMPONENTS.md](../architecture/FLOWS_AND_COMPONENTS.md) |
| ¿Qué falta para paridad RN? | [MOBILE_PARITY.md](MOBILE_PARITY.md) |
| ¿Qué pruebas/gates están vigentes? | [TEST_STATUS.md](../testing/TEST_STATUS.md) |
| ¿Qué debe hacer manualmente el owner? | [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md) |
| ¿Cómo responder incidentes? | [RUNBOOK.md](../operations/RUNBOOK.md) |

## Cuándo actualizar

Actualizar este documento al cambiar la rama de integración, la prioridad principal, un gate de release o el estado productivo de un frente. No usarlo para registrar cada commit.

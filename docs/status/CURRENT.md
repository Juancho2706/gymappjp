---
status: active
owner: product-engineering
last_verified: "2026-07-25 @ a59acfd1"
canonical: true
---

# Current status

Esta es la única vista global de qué está en producción, qué está en integración y qué sigue. El detalle de paridad, pruebas y acciones humanas vive en sus trackers canónicos; no se duplica aquí.

## Corte verificado

| Referencia | Estado al revisar |
|---|---|
| Rama de trabajo | `rnmobiledenuevo`, única rama viva junto a `master` |
| Corte de `master` integrado | `origin/master` en `a59acfd1` (docs post-merge PR #170 `60090f90`, 2026-07-25) |
| Relación de ramas | `rnmobiledenuevo` == `master` en `a59acfd1` (ambas sincronizadas) |
| PR #170 (mergeada) | Ejecutor V3 (ceremonia logo dark + ignición del CTA Finalizar), home alumno (link retirado + scroll-top), cardio fases A-D completas (ejes por modalidad, coach ve registros, intervalos por distancia), pulido del creador de ejercicios |
| Migración DB | `20260725221804_cardio_modality_axes` APLICADA en LIVE antes del merge (aditiva: `exercises.cardio_modality`, Escaladora, `reps_unit` +jumps/floors) |
| Gate `quality` | Verde en el [run 30181033720](https://github.com/Juancho2706/gymappjp/actions/runs/30181033720) sobre `baef4283`: docs, lint 0 errores, typecheck web, tokens y Vitest 3940 aprobados / 4 omitidos (330 archivos). `tsc --noEmit` web+mobile+enterprise re-ejecutados verdes en local sobre `a59acfd1` (2026-07-25) |
| QA | Ronda funcional del owner aprobada en web/emulador; QA física fina Android/iOS pendiente (háptico, reduced-motion) |

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

1. Olas 4A y 4B **cerradas estáticas** (nutrición alumno + coach en paridad 1:1 de código). Siguiente: ola 5 (builder y programas del coach; el ejecutor V3 del alumno ya quedó integrado en PR #170, sin coordinación pendiente) según `MOBILE_PARITY.md`; QA device pendiente para todo.
2. Ejecutar los gates web/mobile completos sobre cada checkpoint candidato.
3. Generar y retener artefactos Android/iOS del corte actual (el build iOS `production` está roto desde el 2026-07-23) y verificar en App Store Connect/Play Console los submits ya realizados.
4. Completar QA en dispositivos Android/iOS de los recorridos críticos.
5. Integrar `rnmobiledenuevo` a `master` solo con evidencia verde y sin migraciones o artefactos locales pendientes.

## Gates que siguen abiertos

- Build firmado Android/iOS del corte actual (`a59acfd1`); el submit iOS ya quedó probado verde vía perfil `production` sobre `4382ff6c`, pero el build iOS falló en los dos intentos posteriores.
- Certificación física de cámara, gestos, teclado, safe areas, offline y notificaciones en ambos sistemas.
- Cierre verificable de la paridad móvil restante; código presente no equivale a QA aprobada.
- Confirmación del rollout/configuración de Nutrition V2 en el entorno objetivo antes de una promoción.

Builds `production` (workflow manual): Android e iOS verdes **con submit a Play internal testing y TestFlight incluidos** en el [run 29885773193](https://github.com/Juancho2706/gymappjp/actions/runs/29885773193) sobre `4382ff6c` (2026-07-22). Android repitió verde con submit en el [run 30063566202](https://github.com/Juancho2706/gymappjp/actions/runs/30063566202) sobre `335c88da` (2026-07-24), pero iOS `production` falló ahí y en el [run 29976332962](https://github.com/Juancho2706/gymappjp/actions/runs/29976332962) sobre `b7e5e34d`; los logs de ambas fallas expiraron (retención 1 día). No existe build del corte integrado `a59acfd1` y nada de esto certifica QA física.

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

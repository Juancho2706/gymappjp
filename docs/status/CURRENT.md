---
status: active
owner: product-engineering
last_verified: "2026-07-26 @ 80995cae"
canonical: true
---

# Current status

Esta es la única vista global de qué está en producción, qué está en integración y qué sigue. El detalle de paridad, pruebas y acciones humanas vive en sus trackers canónicos; no se duplica aquí.

## Corte verificado

| Referencia | Estado al revisar |
|---|---|
| Rama de trabajo | `rnmobiledenuevo`, única rama viva junto a `master` |
| Corte de `master` integrado | merge de `rnmobiledenuevo` completo (ola post-incidente P0) — ramas igualadas por decisión del owner 2026-07-26 |
| Relación de ramas | `master` == `rnmobiledenuevo` tras el merge de la ola post-incidente; trabajo nuevo sigue en `rnmobiledenuevo` |
| Hotfix P0 2026-07-26 (PR #171, EN PROD) | Ejecutor alumno perdía series al reentrar un día recuperado: `?fecha=<hoy>` activaba el modo solo-UPDATE (jamás inserta) y la cola offline descartaba cada rechazo `past_set_not_found`. Fix en 3 capas (action, page, `buildWorkoutDoneEditHref`); `?fecha=` queda reservado a días realmente pasados. CI quality verde ([run 30214247333](https://github.com/Juancho2706/gymappjp/actions/runs/30214247333)), Vercel prod READY |
| Ola post-incidente (PR #172, EN PROD) | Telemetría de descartes por code en la cola offline (web+RN, evento Sentry por causa, chip RN honesto), `CountUpText` compartido que extingue la clase EVA-NEXTJS-10/E (7 superficies migradas), dedup (plan, día) en la atribución semanal, banner RN acotado al plan de hoy. Issues Sentry EVA-NEXTJS-10/E/11 resueltos con evidencia |
| Estado "En progreso" (O2, local) | Implementado sobre `docs/specs/workout-day-in-progress`: `deriveDayCompletion` en `@eva/workout-engine` (12 fixtures de paridad), day-cards/sheet/banner/dots en web y RN con visual y copy espejados; racha RPC intacta. Suite completa 4054 tests verdes. Pendiente: QA device (4 escenarios) e integrar a `master` cuando el owner lo pida |
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

- ~~Build firmado Android/iOS del corte actual~~ → HECHO (`856829fa`, run `30185211552`, submits incluidos). Quedan: retener artefactos, verificar App Store Connect/Play Console y QA física.
- Certificación física de cámara, gestos, teclado, safe areas, offline y notificaciones en ambos sistemas.
- Cierre verificable de la paridad móvil restante; código presente no equivale a QA aprobada.
- Confirmación del rollout/configuración de Nutrition V2 en el entorno objetivo antes de una promoción.

Builds `production`: el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` (2026-07-25) dejó **Android e iOS verdes end-to-end con submits incluidos** (AAB a Play internal testing + IPA a TestFlight), usando el profile regenerado con HealthKit + Associated Domains (la falla de capability de los runs 07-23/24 quedó cerrada; diagnóstico [30183498116](https://github.com/Juancho2706/gymappjp/actions/runs/30183498116)). Ese binario incluye la deuda cardio saldada y los universal links repuestos. Pendiente humano: retener artefactos (1 día), verificar procesamiento en App Store Connect/Play Console y QA física — nada de esto certifica QA device.

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

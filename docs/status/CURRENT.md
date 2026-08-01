---
status: active
owner: product-engineering
last_verified: "2026-07-31"
canonical: true
---

# Current status

Esta es la vista global vigente. El código y las migraciones ejecutables prevalecen sobre este
resumen; antes de integrar o desplegar, verificar branch, deployment y estado remoto.

## Estado por frente

| Frente | Estado | Fuente de detalle |
|---|---|---|
| Web/PWA | Productivo; verificar deployment activo antes de incidentes o despliegues | [Runbook](../operations/RUNBOOK.md) |
| App nativa | Paridad estática amplia; build y QA físico Android/iOS siguen pendientes de certificación | [Mobile parity](MOBILE_PARITY.md) |
| Archivado de alumnos | Implementación local lista para integración: servicio scoped, ban/unban Auth, cuenta suspendida RN, RLS/migraciones y prueba SQL. No aplicado en producción. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica en código para Standalone/Team; V1 queda como historial solo lectura. Conversión, preflight y desactivación V1 remota pendientes de entorno controlado. | [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| Teams | Pool, membresías y workspaces implementados; la nutrición V2 usa scope explícito Team/Standalone. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | Fuera del corte de Nutrition V2 y de la eliminación de legacy en esta entrega. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridad actual

1. Autorizar y preparar un entorno Supabase controlado (branch o snapshot) para aplicar y validar
   las migraciones de archivado con JWTs reales.
2. Ejecutar conversión/preflight V1→V2 y reconciliar todos los enlaces antes de desactivar V1.
3. Desplegar Web/PWA y la versión RN V2, mantener compatibilidad temporal y medir errores/scope.
4. Ejecutar Playwright responsive y QA físico Android/iOS, claro/oscuro, online/offline y deep links.
5. Tras versión mínima RN y la ventana web, retirar aliases/rutas/endpoints V1 de Standalone/Team.

## Criterio de corte Nutrition V2

- V2 es la única experiencia operativa de nutrición para Standalone y Team.
- V1 se preserva como historial auditable, no como rollback de producto.
- El preflight bloquea el corte si falta un V2 publicado equivalente o una trazabilidad de conversión.
- Enterprise permanece aislado hasta un proyecto separado.
- No marcar el corte como terminado sin migraciones aplicadas, validación RLS con JWTs reales,
  cero V1 activos soportados y QA físico aprobado.

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build EAS verde no sustituye QA físico.
- Una migración en el repositorio no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).

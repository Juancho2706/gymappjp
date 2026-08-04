---
status: active
owner: product-engineering
last_verified: "2026-08-03"
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
| Archivado de alumnos | Migraciones aplicadas en producción el 2026-08-01. Rompieron el alta de alumnos (P0, ningún coach pudo crear entre el 01 y el 03-08) y dejaron inalcanzable la pantalla de cuenta suspendida en web; ambas corregidas el 2026-08-03 con migraciones aditivas y smoke ampliado. Falta QA físico y la matriz Team/Enterprise. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica en código para Standalone/Team; historial V1 de solo lectura disponible. El preflight remoto mantiene 7 enlaces V1→V2 por reconciliar antes del corte definitivo. **2026-08-03**: cerradas F2 (listas de equivalencia propias del coach) y F3 (plantillas de plan + rescate de las 33 plantillas V1); DB aplicada en producción, código en commits locales sin desplegar. | [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) · [Programa de nutrición](../../specs/nutrition-exchange-lists/SPEC.md) |
| Retiro físico de V1 | **No iniciado y sin autorización.** El mapa del 18-jul quedó desactualizado: ejecutarlo hoy borraría código V2 vivo. Decisión vigente del owner: no borrar nada, solo asegurar que todos usen V2. | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados; la nutrición V2 usa scope explícito Team/Standalone. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | Fuera del corte de Nutrition V2 y de la eliminación de legacy en esta entrega. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridad actual

0. **Desplegar el programa de nutrición completo** (commits en `master` local sin push: F2, F3,
   F4 olas 1 y 2, T4.4, avisos F1 en quick-edit, y el canje de cupón para coach free).
   La base de datos ya tiene todo aplicado; la web en producción sigue funcionando porque el
   read-model conserva su rama legacy, así que el despliegue es la pieza que falta para que los
   coaches vean las listas de equivalencia, las plantillas y sus 33 plantillas rescatadas.
1. Ejecutar matriz con JWTs reales: alumno archivado, alumno pausado, coach que también es alumno,
   Standalone y Team. Toda policy `AS RESTRICTIVE FOR ALL` exige probar además el ALTA (su
   `WITH CHECK` corre en INSERT) y el `RETURNING`, no solo la lectura.
2. Ejecutar conversión/preflight V1→V2 y reconciliar los 7 enlaces antes de desactivar V1.
3. Desplegar Web/PWA y la versión RN V2, mantener compatibilidad temporal y medir errores/scope.
4. Ejecutar Playwright responsive y QA físico Android/iOS, claro/oscuro, online/offline y deep links.
5. Tras versión mínima RN y la ventana web, retirar aliases/rutas/endpoints V1 de Standalone/Team.

## Programa de nutrición F2–F5 (2026-08-03)

Origen: dos preguntas de coaches reales por WhatsApp. Plan maestro y decisiones del owner en
[`specs/nutrition-exchange-lists`](../../specs/nutrition-exchange-lists/SPEC.md) y
[`specs/nutrition-plan-templates-v2`](../../specs/nutrition-plan-templates-v2/SPEC.md).

| Fase | Estado | Qué queda |
|---|---|---|
| F0 · defectos de porciones (B1/B2/B4) + guard de día vacío | Cerrada y desplegada | — |
| F1 · conteo de equivalencias, estado vacío, duplicar grupo | Cerrada y desplegada; avisos llevados al quick-edit web el 2026-08-03 (conteo + porciones huérfanas + nota de publicación) | — |
| F2 · listas de equivalencia propias del coach | **Cerrada**; DB en producción, código sin desplegar | QA visual del coach |
| F3 · plantillas de plan V2 + rescate de las 33 V1 | **Cerrada**; 33 plantillas importadas en producción; T4.4 (guardar plantilla desde el builder) cerrado en código | Avisar a joaquinamr7 |
| F4 · paridad React Native | Olas 1 y 2 cerradas en código: pestaña Porciones (NativeWind), plantillas en el builder RN (`GET /api/mobile/nutrition-v2/plan-templates`), "Duplicar y ajustar" con copia de lista, conteo de equivalencias y aviso de porciones huérfanas | Build EAS + QA física |
| F5 · retiro físico de V1 | **Detenida por decisión del owner** | Nada: no se borra V1; el delta del mapa queda como referencia |

Regla vigente del owner (2026-08-03): **no borrar nada de V1**. El objetivo es que todos los
usuarios actuales operen en V2 sin fricción. Verificado en producción ese día: ningún alumno ni
coach real cae hoy en V1 — el único camino que queda es el de Enterprise, que tiene una sola
organización con un `org_owner` que no es coach y cero alumnos activos.

## Criterio de corte Nutrition V2

- V2 es la única experiencia operativa de nutrición para Standalone y Team.
- V1 se preserva como historial auditable, no como rollback de producto.
- El preflight bloquea el corte si falta un V2 publicado equivalente o una trazabilidad de conversión.
- Enterprise permanece aislado hasta un proyecto separado.
- No marcar el corte como terminado sin validación RLS con JWTs reales, cero V1 activos soportados
  y QA físico aprobado.

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build EAS verde no sustituye QA físico.
- Una migración en el repositorio no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).

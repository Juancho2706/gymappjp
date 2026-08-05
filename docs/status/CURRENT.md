---
status: active
owner: product-engineering
last_verified: "2026-08-05"
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

## Correccion RLS y fuga de respaldo (2026-08-05, aplicado en produccion)

Tres migraciones aplicadas en LIVE la madrugada del 05-08 (horario valle), con equivalencia
probada antes y despues (0 diferencias en 12.408 + 11.139 comparaciones) y reversion escrita:

- `20260805040625_secure_bak_catalina_logs_rls_revoke`: cierra la fuga de
  `_bak_catalina_logs_20260722` (estaba sin RLS y con GRANT a `anon`: 46 filas de una alumna
  real legibles y borrables con la anon key). Verificado por REST: 206 → 401/42501. Con esto
  desaparecio el unico advisor ERROR del proyecto.
- `20260805040810_archive_gate_set_based_rls`: el gate del archivado deja de evaluarse por fila
  (causa de los ~84 statement timeouts/dia). Dashboard coach 11.278 ms → 11,7 ms; alumno tambien
  mejora. 28 policies reescritas a `= ANY(ARRAY(SELECT private.student_readable_client_ids()))`.
- `20260805041843_nutrition_v2_set_based_rls_and_or_order`: mismas conversiones para nutricion v2
  (restrictive + permissive de 5 tablas de detalle). Abrir el plan del alumno: ~310 ms de RLS →
  ~15 ms. Items 254→9,8 ms; coach 576→5,0 ms.

La red de seguridad son los scripts de `supabase/tests/` (`student_gate_equivalence.sql`,
`student_gate_org_fixture.sql`, `nutrition_v2_sets_equivalence.sql`): correrlos antes y despues
de cualquier cambio a esas policies. Rollbacks en `*_rollback.sql` del mismo directorio.
Ademas, fase 4 en web (commit local): el dashboard del coach ya no emite el `console.error`
fantasma de la RPC retirada, la consulta de altas va acotada a 6 meses dentro del `Promise.all`,
y los graficos agrupan fechas en zona Chile (el runtime de Vercel es UTC).

Pendiente de este frente: ~~medir el lado no-DB~~ medido 05-08 (TTFB p75 3,1 s post-deploy ⇒
servidor; FCP≈LCP ⇒ no es code-splitting); reinstalar las 2 RPC agregadas con scope solo como higiene.

## Plan post-runbook ejecutado (2026-08-05 tarde)

Tres migraciones mas en LIVE + codigo local (commits sin push):

- `20260805181715_drop_public_read_coach_branding_leak` (SEC-B): cierra la fuga cross-tenant de
  billing en `coaches` (policy `public_read_coach_branding` qual TRUE dejaba a cualquier
  authenticated leer todas las filas con todas las columnas). El proxy ahora lee el branding /c
  con un client anon dedicado (column-grants de branding). Smoke tx-rollback: alumno ve solo su
  coach; coach ajeno = 0; anon (logins) intacto.
- `20260805182135_nutrition_v2_initplan_wraps_and_fk_indexes` (MIG-D): 11 `auth.uid()` →
  `(select auth.uid())` en 8 policies de nutricion v2 (expresiones verbatim de pg_policies,
  verificadas post-aplicacion) + 8 indices FK. `nutrition_v2_set_based_rollback.sql` actualizado
  para conservar el wrap.
- `20260805182248_revoke_anon_execute_writer_definer_fns` (F): revoke EXECUTE a `anon` en las 4
  funciones DEFINER de escritura; las 7 de lectura quedan (hot path anon del proxy).

Codigo (local): PR-A guard del crash `proxy.ts` (slug invalido en /c destructuraba null) +
validacion uuid en 6 rutas API + catch tipado en `flow-reconcile`; PR-C quick-wins del proxy
(prefetch /c sin Q1/Q2, cache branding y flag Edge Config por instancia, clients+gate en
paralelo) y dashboard coach (workspace dedup — antes se resolvia 3 veces —, pulse de 6 olas
seriales a gate→ola unica→totals, layout de 6 saltos a 3); PR-B guards uuid en RN + filtro en
`mapApiDashboard` + breadcrumbs (merge listo, **OTA recien post-aprobacion iOS**).

Criterio de exito PR-C: TTFB p75 < 1,5 s por ruta en Sentry a las 48 h del deploy web.

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

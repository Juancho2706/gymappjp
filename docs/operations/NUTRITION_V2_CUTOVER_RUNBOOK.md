---
status: active
owner: engineering
last_verified: "2026-07-31"
canonical: true
---

# Nutrition V2 — corte seguro y operación

Nutrition V2 es la experiencia canónica para Standalone y Team. Nutrition V1 no vuelve a ser un
fallback operativo: sus filas, logs y alimentos se conservan como historial auditable de solo
lectura dentro de V2. Enterprise queda fuera de este corte.

Este runbook no autoriza cambios remotos por sí mismo. Al momento de esta revisión, las migraciones
de archivado y el corte V1 siguen **sin aplicar en producción**.

## Fuentes de verdad

- Invariante y alcance: [`specs/archive-nutrition-v2-cutover/SPEC.md`](../../specs/archive-nutrition-v2-cutover/SPEC.md).
- Migraciones, en este orden:
  1. `supabase/migrations/20260731123000_archive_client_deactivates_assignments.sql`
  2. `supabase/migrations/20260801023414_archive_client_access_and_nutrition_v2_history.sql`
- Prueba SQL de regresión: `supabase/tests/archive_client_access_rollback.sql`.
- Conversión y preflight: `scripts/nutrition-v2-conversion/`.
- Boundaries V2: `pnpm check:nutrition-v2-boundaries`.

## Estado de preflight auditado

- El proyecto remoto no tiene una rama de desarrollo provisionada. Crear una puede implicar costo;
  no se reemplaza por un `db push` a LIVE. Sin rama, el paso 1 exige snapshot y ventana controlada.
- El preflight remoto de solo lectura verificó 46 planes V1 y encontró 7 enlaces V1→V2 faltantes.
  El conversor confirma que esos casos ya tienen un plan V2 o son duplicados V1: hay que
  reconciliar cada enlace con su reporte de fidelidad antes de desactivar V1.
- El advisor de seguridad remoto mantiene un error previo y fuera de este cambio:
  `public._bak_catalina_logs_20260722` tiene RLS deshabilitada. Resolverlo o aceptarlo
  explícitamente es un gate de producción separado; esta entrega no toca ni borra backups.

## Orden obligatorio de despliegue

1. Confirmar un branch efímero de Supabase. Si no está disponible, tomar snapshot, registrar
   conteos y usar un entorno/ventana controlada con datos sintéticos antes de LIVE.
2. Aplicar las dos migraciones en el orden anterior; son aditivas y forward-only. No editar ni
   revertir DDL aplicado.
3. Ejecutar la prueba SQL de archivado y una matriz con JWTs reales: alumno archivado, coach que
   además es alumno, standalone y Team.
4. Ejecutar el conversor V1 en modo dry-run y resolver toda diferencia de fidelidad o enlace.
5. Ejecutar el preflight bloqueante:

   ```bash
   pnpm nutrition:v2:preflight -- --strict
   ```

   El corte no continúa hasta que no haya bloqueos. Los enlaces de conversión incompletos se
   reconcilian; no se omiten alumnos.
6. Desactivar únicamente las asignaciones V1 ya verificadas, con confirmación explícita y el
   mismo reporte en cero bloqueos:

   ```bash
   NUTRITION_V2_CUTOVER_CONFIRM=yes pnpm nutrition:v2:preflight -- --strict --deactivate-verified-v1
   ```

   Este comando no borra planes, logs, alimentos ni identidades V1.
7. Desplegar Web/PWA y publicar la versión RN que contiene V2 canónica. Mantener redirects web
   V1 durante 30 días y aliases RN hasta imponer una versión mínima; después retirar las rutas y
   endpoints legacy alcanzables para Standalone/Team.

## Invariante de archivado

- Archivar desactiva programas y V1, y archiva planes V2; las guardas impiden nuevas asignaciones
  activas.
- Auth aplica ban/unban a identidades dedicadas junto con RLS para bloquear accesos nuevos y JWTs
  emitidos antes del archivo. Una identidad compartida de coach/staff/multi-workspace no se banea
  globalmente: RLS/API bloquean únicamente el contexto archivado. No se eliminan identidades.
- Desarchivar verifica cupo por workspace y no revive asignaciones. El coach las reasigna de forma
  explícita.
- La UI de archivados solo permite desarchivar cuando existe cupo; no abre ficha ni permite editar,
  asignar o eliminar.

Las URLs firmadas de Storage emitidas antes del archivo pueden seguir funcionando hasta su propia
expiración. Confirmar TTL corto y revocación/rotación aplicable al bucket antes de declarar una
contención completa de archivos privados.

## Validación de salida

- Un JWT previo al archivo no lee ni escribe por PostgREST, RPC o API móvil.
- Login, deep links y sesiones existentes terminan en cuenta suspendida; RN limpia sesión, caché y
  cola offline al recibir `CLIENT_BLOCKED`.
- Standalone y Team no cruzan alumnos. Team no reutiliza el cupo personal del coach ni
  `teams.seat_limit`: ese campo limita miembros/coaches, no alumnos. Mientras Team no tenga una
  cuota de alumnos persistida y separada, su pool compartido puede desarchivar sin ese bloqueo.
- Archivar desactiva asignaciones y desarchivar no revive ninguna.
- V2 muestra el plan convertido y el detalle histórico V1 por fecha sin modificar la fuente.
- Para Standalone/Team: cero asignaciones de archivados y cero V1 activos tras el corte.
- `pnpm check:nutrition-v2-boundaries` no encuentra imports V2 hacia V1, flags de rollout ni rutas
  legacy alcanzables.
- Pasar typecheck Web/RN, pruebas de conversión, Playwright responsive y QA físico Android/iOS en
  claro/oscuro antes de certificar el release.

## Incidente o rollback

No existe un flag que reabra V1. Ante un incidente, detener writers con rollback de deployment o
contención server-side, conservar snapshot/evidencia y corregir con una migración o reparación
forward-only. No reactivar automáticamente V1 ni restaurar datos históricos para ocultar un fallo.

Registrar SHA, hora UTC, superficie, workspace técnico, request/error ID y alcance. No registrar
tokens, contenido nutricional ni notas privadas.

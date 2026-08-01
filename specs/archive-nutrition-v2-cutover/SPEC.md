# Cierre seguro de archivado + consolidación Nutrition V2

**Estado:** En implementación
**Fecha:** 2026-07-31

## Objetivo

Un alumno archivado conserva su historial, pero pierde de inmediato todo acceso como alumno y deja de tener asignaciones activas. Nutrition V2 pasa a ser la única experiencia de nutrición para Standalone y Team, sin reescribir el historial V1.

## Invariantes

1. `clients.is_archived = true` implica: ninguna asignación de entrenamiento o nutrición activa, y ninguna lectura/escritura como alumno por PostgREST, RPC o API móvil. La identidad Auth se banea cuando es dedicada al alumno; una identidad compartida de coach/staff/multi-workspace conserva sus otros contextos y queda bloqueada por RLS en esta fila.
2. El coach conserva acceso de coach a sus alumnos archivados; un usuario que es coach y alumno no queda bloqueado globalmente.
3. Desarchivar requiere cupo sólo donde exista una cuota de alumnos persistida (standalone: `coaches.max_clients` efectivo; Enterprise: `organizations.client_limit`). Team usa su pool compartido sin cuota de alumnos en el modelo actual: `teams.seat_limit` limita coaches en `team_members`, no alumnos. Desarchivar nunca reactiva programas ni planes.
4. La UI de archivados sólo ofrece desarchivar: no navega a ficha ni permite editar, asignar o eliminar.
5. Standalone y Team usan Nutrition V2. Las filas, logs y alimentos V1 se conservan como historia inmutable y se leen sólo mediante el read-model V2.
6. Ningún corte desactiva un plan V1 activo hasta que la conversión reporte un V2 publicado equivalente para ese alumno.

## Alcance

- Migraciones aditivas y forward-only para guardas de archivo, RLS y detalle histórico V1.
- Servicio único server-side para archivar, desarchivar y archivar masivamente, con Auth ban/unban.
- Endpoints móviles explícitos, estado suspendido y limpieza de sesión/caché/cola ante `CLIENT_BLOCKED`.
- Read model V2 de detalle histórico V1, incluido en web/RN sin acciones de escritura.
- Eliminación del rollout técnico de V2 para Standalone y Team; Enterprise queda fuera del corte.

## No alcance

- Eliminar Enterprise, identidades de Auth o datos históricos V1.
- Ejecutar conversiones o migraciones en producción sin snapshot, preflight completo y verificación con JWTs reales.
- Reactivar automáticamente asignaciones al desarchivar.

## Criterios de aceptación

- Un JWT emitido antes del archivo no puede leer ni escribir datos propios de alumno.
- El archivo apaga programas/V1 y archiva V2; los intentos posteriores de asignación activa se normalizan a inactivos/archivados.
- Team no usa el límite personal del coach al desarchivar.
- El read-model V2 expone comidas, alimentos, cantidades, swaps, intakes y objetivos V1 por fecha como contenido de sólo lectura.
- Cero flags de rollout o imports V2 hacia rutas V1 en los flujos Standalone/Team alcanzables.

# Plan técnico

## 1. Seguridad de archivado

1. Aplicar primero `20260731123000_archive_client_deactivates_assignments.sql` en el entorno de despliegue, tras snapshot.
2. La migración siguiente agrega guardas de lectura/escritura restrictivas por fila de alumno; nunca una política global por actor.
3. El servicio de archivo hace el cambio de estado scoped, aplica Auth ban/unban y devuelve el alumno afectado para notificación. La actualización parcial no puede tocar `is_archived` ni `is_active`.
4. La aplicación móvil consulta un endpoint de estado mínimo antes de cargar datos de alumno y limpia persistencia local ante `CLIENT_BLOCKED`.

## 2. Nutrition V2

1. Extraer identidad de coach a un servicio neutral y eliminar dependencias V2 hacia queries/rutas V1.
2. Hacer V2 canónica para standalone/team; conservar Enterprise aislado en su flujo actual.
3. Añadir RPC de detalle legacy por fecha, contrato Zod, gateways web/RN y presentación de sólo lectura.
4. Mantener el conversor existente, agregando preflight de completitud antes de desactivar V1.

## 3. Despliegue

1. No hay branch efímero disponible: usar snapshot, migraciones aditivas y seed sintético antes de LIVE.
2. Ejecutar preflight de conversión; abortar si falta V2 publicado equivalente.
3. Aplicar migraciones, validar RLS con JWT reales y luego desplegar Web/RN.
4. Mantener redirects web V1 por 30 días y aliases RN hasta versión mínima; retirar legacy después del telemetry/QA.
